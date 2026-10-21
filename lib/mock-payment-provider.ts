import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type {
  PaymentProvider,
  PaymentProviderName,
  PaymentRequest,
  PaymentResult,
  PaymentRecord,
  PaymentStatus,
  RefundRequest,
  RefundResult,
  WebhookSignatureInput,
  WebhookVerificationResult,
} from "./payment";

interface StoredPayment {
  id: string;
  orderId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  provider: PaymentProviderName;
  providerRefId?: string;
  providerStatus?: string;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Test-only secret used by the mock provider's webhook signature scheme.
 * Never used in production; the mock provider cannot be constructed outside
 * NODE_ENV=test.
 */
function mockWebhookSecret(): string {
  return process.env.MOCK_PAYMENT_WEBHOOK_SECRET ?? "mock-webhook-secret-test-only-do-not-use-in-production";
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return timingSafeEqual(ab, bb);
}

export function createMockPaymentProvider(): PaymentProvider {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The mock payment provider is available only in tests");
  }

  const payments = new Map<string, StoredPayment>();

  return {
    async processPayment(request: PaymentRequest): Promise<PaymentResult> {
      const idempotencyKey =
        request.idempotencyKey ?? `idem-${request.orderId}`;

      for (const payment of payments.values()) {
        if (payment.idempotencyKey === idempotencyKey) {
          const sameTerms = payment.orderId === request.orderId &&
            payment.amount === request.amount &&
            payment.currency.toUpperCase() === request.currency.toUpperCase() &&
            payment.provider === request.provider;
          if (!sameTerms) {
            return {
              success: false,
              status: "FAILED",
              error: "Idempotency key was already used with different payment details",
            };
          }
          return {
            success: true,
            paymentId: payment.id,
            status: payment.status,
            providerRefId: payment.providerRefId,
            providerStatus: payment.providerStatus,
          };
        }
      }

      const id = `pay_${randomUUID().slice(0, 16)}`;
      const providerRefId = `ref_${randomUUID().slice(0, 12)}`;
      const payment: StoredPayment = {
        id,
        orderId: request.orderId,
        amount: request.amount,
        currency: request.currency,
        provider: request.provider,
        providerRefId,
        providerStatus: "CAPTURED",
        status: "COMPLETED",
        idempotencyKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      payments.set(id, payment);

      return {
        success: true,
        paymentId: id,
        status: "COMPLETED",
        providerRefId,
        providerStatus: "CAPTURED",
      };
    },

    async getPaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
      const payment = payments.get(paymentId);
      if (payment) return payment.status;

      for (const payment of payments.values()) {
        if (payment.idempotencyKey === paymentId) {
          return payment.status;
        }
      }

      return null;
    },

    async getPaymentRecord(paymentId: string): Promise<PaymentRecord | null> {
      const payment = payments.get(paymentId) ?? [...payments.values()].find(
        (candidate) => candidate.idempotencyKey === paymentId,
      );
      return payment ? { ...payment } : null;
    },

    async refundPayment(request: RefundRequest): Promise<RefundResult> {
      const payment = payments.get(request.paymentId);
      if (!payment) {
        return { success: false, error: "Payment not found" };
      }
      if (payment.status === "REFUNDED") {
        return { success: false, error: "Payment already refunded" };
      }

      payment.status = "REFUNDED";
      payment.updatedAt = new Date();

      return {
        success: true,
        refundId: `refund_${randomUUID().slice(0, 12)}`,
        status: "COMPLETED",
      };
    },

    async verifyWebhookSignature(input: WebhookSignatureInput): Promise<WebhookVerificationResult> {
      const headers = normalizeHeaders(input.headers);
      const provided = headers["x-mock-payment-signature"];
      if (typeof provided !== "string" || provided.length === 0) {
        return { valid: false, providerEventId: null, providerStatus: null, reason: "Missing webhook signature" };
      }

      const expected = createHmac("sha256", mockWebhookSecret()).update(input.rawBody).digest("hex");
      if (!constantTimeCompare(provided, expected)) {
        return { valid: false, providerEventId: null, providerStatus: null, reason: "Invalid webhook signature" };
      }

      const providerEventId = typeof headers["x-mock-payment-event-id"] === "string"
        ? headers["x-mock-payment-event-id"]
        : null;
      const providerStatus = typeof headers["x-mock-payment-status"] === "string"
        ? headers["x-mock-payment-status"]
        : null;

      return {
        valid: true,
        providerEventId: providerEventId ?? null,
        providerStatus: providerStatus ?? null,
      };
    },
  };
}
