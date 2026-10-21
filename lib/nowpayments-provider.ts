import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentProvider,
  PaymentRecord,
  PaymentRequest,
  PaymentResult,
  PaymentStatus,
  RefundRequest,
  RefundResult,
  WebhookSignatureInput,
  WebhookVerificationResult,
} from "./payment";

const API_ORIGIN = "https://api.nowpayments.io/v1";
const TERMINAL_PAYMENT_STATUSES = new Set(["finished", "failed", "expired", "refunded"]);

export type NowPaymentsOrderEvent =
  | "PAYMENT_INITIATED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "PAYMENT_EXPIRED"
  | "PAYMENT_CANCELLED";

/** Normalize IPN stages into the application's existing order state machine. */
export function mapNowPaymentsOrderEvent(value: unknown): NowPaymentsOrderEvent | null {
  if (typeof value !== "string") return null;
  switch (value.trim().toLowerCase()) {
    case "waiting":
    case "confirming":
    case "confirmed":
    case "sending":
    case "partially_paid":
      return "PAYMENT_INITIATED";
    case "finished":
      return "PAYMENT_CONFIRMED";
    case "failed":
      return "PAYMENT_FAILED";
    case "expired":
      return "PAYMENT_EXPIRED";
    case "cancelled":
      return "PAYMENT_CANCELLED";
    // The order model has no safe refund state transition. Require manual
    // reconciliation instead of changing a paid order implicitly.
    case "refunded":
    case "wrong_asset_confirmed":
    default:
      return null;
  }
}

export function mapNowPaymentsStatus(value: unknown): PaymentStatus | null {
  if (typeof value !== "string") return null;
  switch (value.trim().toLowerCase()) {
    case "waiting":
    case "confirming":
    case "confirmed":
    case "sending":
    case "partially_paid":
      return "PROCESSING";
    case "finished":
      return "COMPLETED";
    case "failed":
    case "expired":
      return "FAILED";
    case "refunded":
      return "REFUNDED";
    case "cancelled":
      return "CANCELLED";
    default:
      return null;
  }
}

/** Order-preserving canonicalization required by NOWPayments IPN signing. */
function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (value === null || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(object).sort().map((key) => [key, sortRecursively(object[key])]),
  );
}

export function canonicalNowPaymentsWebhookBody(rawBody: Buffer): string | null {
  try {
    const parsed: unknown = JSON.parse(rawBody.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return JSON.stringify(sortRecursively(parsed));
  } catch {
    return null;
  }
}

export function verifyNowPaymentsSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!signature || !secret || !/^[a-f\d]{128}$/i.test(signature)) return false;
  const canonicalBody = canonicalNowPaymentsWebhookBody(rawBody);
  if (!canonicalBody) return false;
  const expected = createHmac("sha512", secret.trim()).update(canonicalBody).digest();
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function safeInvoiceUrl(value: string | undefined): string | null {
  const url = safeHttpUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase();
  return host === "nowpayments.io" || host.endsWith(".nowpayments.io") ? url : null;
}

export function isNowPaymentsEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.NOWPAYMENTS_LIVE_ENABLED === "true"
    && env.NOWPAYMENTS_MERCHANT_APPROVED === "true"
    && Boolean(env.NOWPAYMENTS_API_KEY?.trim())
    && Boolean(env.NOWPAYMENTS_IPN_SECRET?.trim())
    && Boolean(safeHttpUrl(env.NOWPAYMENTS_IPN_CALLBACK_URL))
    && Boolean(safeHttpUrl(env.NOWPAYMENTS_SUCCESS_URL))
    && Boolean(safeHttpUrl(env.NOWPAYMENTS_CANCEL_URL))
    && env.NOWPAYMENTS_UNDERPAYMENT_POLICY_CONFIRMED === "true";
}

interface NowPaymentsProviderConfig {
  apiKey?: string;
  ipnSecret?: string;
  callbackUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface InvoiceResponse {
  id?: string | number;
  invoice_url?: string;
}

/**
 * NOWPayments hosted-invoice adapter. It never treats a callback or redirect as
 * proof of payment; only its signed IPN can be reconciled by the webhook route.
 */
export class NowPaymentsProvider implements PaymentProvider {
  private readonly apiKey: string;
  private readonly ipnSecret: string;
  private readonly callbackUrl: string;
  private readonly successUrl: string;
  private readonly cancelUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly requests = new Map<string, { terms: string; result: PaymentResult }>();
  private readonly inFlight = new Map<string, Promise<PaymentResult>>();

  constructor(config: NowPaymentsProviderConfig = {}) {
    const env = process.env;
    this.apiKey = (config.apiKey ?? env.NOWPAYMENTS_API_KEY ?? "").trim();
    this.ipnSecret = (config.ipnSecret ?? env.NOWPAYMENTS_IPN_SECRET ?? "").trim();
    this.callbackUrl = safeHttpUrl(config.callbackUrl ?? env.NOWPAYMENTS_IPN_CALLBACK_URL) ?? "";
    this.successUrl = safeHttpUrl(config.successUrl ?? env.NOWPAYMENTS_SUCCESS_URL) ?? "";
    this.cancelUrl = safeHttpUrl(config.cancelUrl ?? env.NOWPAYMENTS_CANCEL_URL) ?? "";
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    if (!this.apiKey || !this.ipnSecret || !this.callbackUrl || !this.successUrl || !this.cancelUrl) {
      return { success: false, status: "FAILED", safeToRetry: true, error: "NOWPayments is not fully configured" };
    }
    if (!Number.isFinite(request.amount) || request.amount <= 0 || !/^[A-Z]{3}$/i.test(request.currency)) {
      return { success: false, status: "FAILED", safeToRetry: true, error: "Invalid invoice terms" };
    }
    const key = request.idempotencyKey?.trim() || request.orderId;
    const terms = JSON.stringify([request.orderId, request.amount, request.currency.toUpperCase()]);
    const previous = this.requests.get(key);
    if (previous) {
      return previous.terms === terms
        ? { ...previous.result }
        : { success: false, status: "FAILED", error: "Idempotency key was reused with different invoice terms" };
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const operation = this.createInvoice(request, key, terms);
    this.inFlight.set(key, operation);
    try {
      return await operation;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async createInvoice(request: PaymentRequest, idempotencyKey: string, terms: string): Promise<PaymentResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${API_ORIGIN}/invoice`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey },
        body: JSON.stringify({
          price_amount: request.amount,
          price_currency: request.currency.toLowerCase(),
          order_id: request.orderId,
          order_description: `Funded Experts order ${request.orderId}`,
          ipn_callback_url: this.callbackUrl,
          success_url: this.successUrl,
          cancel_url: this.cancelUrl,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        // A normal client rejection means no invoice was created. Treat request
        // timeouts and server failures as uncertain so we never risk a second invoice.
        const safeToRetry = response.status >= 400
          && response.status < 500
          && response.status !== 408
          && response.status !== 409;
        const result: PaymentResult = {
          success: false,
          status: "FAILED",
          safeToRetry,
          error: "NOWPayments did not accept the invoice",
        };
        if (!safeToRetry) this.requests.set(idempotencyKey, { terms, result });
        return result;
      }
      const payload = asObject(await response.json()) as InvoiceResponse | null;
      const invoiceId = payload?.id === undefined ? "" : String(payload.id);
      const invoiceUrl = safeInvoiceUrl(payload?.invoice_url);
      if (!invoiceId || !invoiceUrl) {
        const result: PaymentResult = { success: false, status: "FAILED", error: "NOWPayments returned an invalid invoice response" };
        this.requests.set(idempotencyKey, { terms, result });
        return result;
      }
      const result: PaymentResult = {
        success: true,
        paymentId: invoiceId,
        providerRefId: invoiceId,
        providerStatus: "waiting",
        status: "PENDING",
        checkoutUrl: invoiceUrl,
      };
      this.requests.set(idempotencyKey, { terms, result });
      return { ...result };
    } catch {
      // A timeout can happen after the provider created the invoice. Do not
      // retry automatically: the provider API documents no idempotency header.
      const result: PaymentResult = { success: false, status: "FAILED", error: "NOWPayments invoice result is uncertain; reconcile before retrying" };
      this.requests.set(idempotencyKey, { terms, result });
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
    // POST /invoice returns an invoice id, while the documented status endpoint
    // accepts a payment id. We do not conflate them; signed IPNs reconcile the
    // hosted invoice into the local order ledger.
    void paymentId;
    return null;
  }

  async getPaymentRecord(paymentId: string): Promise<PaymentRecord | null> {
    // Payment records are owned by the application's transactional webhook
    // ledger. The provider status endpoint is not sufficient to reconstruct
    // the local order/amount/currency tuple safely.
    void paymentId;
    return null;
  }

  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    void request;
    return { success: false, error: "NOWPayments refunds require a separately reviewed refund workflow" };
  }

  async verifyWebhookSignature(input: WebhookSignatureInput): Promise<WebhookVerificationResult> {
    const signature = input.headers["x-nowpayments-sig"];
    if (!verifyNowPaymentsSignature(input.rawBody, signature, this.ipnSecret)) {
      return { valid: false, reason: "Invalid NOWPayments IPN signature" };
    }
    const payload = asObject(JSON.parse(input.rawBody.toString("utf8")));
    const paymentId = payload?.payment_id;
    const status = payload?.payment_status;
    if ((typeof paymentId !== "string" && typeof paymentId !== "number") || typeof status !== "string") {
      return { valid: false, reason: "NOWPayments IPN is missing payment identity or status" };
    }
    const normalizedPaymentId = String(paymentId);
    if (!normalizedPaymentId || normalizedPaymentId.length > 128 || status.length > 64) {
      return { valid: false, reason: "NOWPayments IPN identity or status is invalid" };
    }
    return {
      valid: true,
      // NOWPayments sends status-change callbacks for one payment id. A stable
      // payment/status key deduplicates retries while preserving later states.
      providerEventId: `${normalizedPaymentId}:${status.toLowerCase()}`,
      providerStatus: status,
    };
  }
}

export function isTerminalNowPaymentsStatus(status: string): boolean {
  return TERMINAL_PAYMENT_STATUSES.has(status.toLowerCase());
}
