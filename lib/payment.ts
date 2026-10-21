export type PaymentStatus =
  "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REFUNDED" | "CANCELLED";
/** Only the test mock exists; add a concrete crypto provider after one is selected. */
export type PaymentProviderName = "MOCK" | "NOWPAYMENTS";

export type RefundStatus = "PENDING" | "COMPLETED" | "FAILED";

/**
 * Input to a provider's webhook signature verification. Real adapters must
 * verify the signature over the raw request body using the required headers.
 * The parsed body is never trusted before signature verification succeeds.
 */
export interface WebhookSignatureInput {
  /** Raw, unverified request body bytes exactly as received from the provider. */
  rawBody: Buffer;
  /** Request headers (normalized to lowercase keys by the caller). */
  headers: Record<string, string>;
}

/**
 * Result of provider webhook signature verification. `valid` is true only when
 * the provider's documented signature scheme validates the raw body and headers.
 */
export interface WebhookVerificationResult {
  valid: boolean;
  /** Provider event id extracted from a verified header, if the scheme binds one. */
  providerEventId?: string | null;
  /** Provider status extracted from a verified header, if the scheme binds one. */
  providerStatus?: string | null;
  reason?: string;
}

/**
 * Normalized webhook event after successful signature verification and parsing.
 */
export interface WebhookEvent {
  providerEventId: string;
  providerStatus: string;
  amount?: unknown;
  currency?: string;
  transactionId?: string | null;
  confirmations?: number | null;
  metadata?: Record<string, unknown>;
}

export interface PaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  provider: PaymentProviderName;
  idempotencyKey?: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  status: PaymentStatus;
  providerRefId?: string;
  providerStatus?: string;
  /** Hosted invoice URL, present only for providers that return a checkout page. */
  checkoutUrl?: string;
  /** True only when the provider definitively rejected creation before a payment exists. */
  safeToRetry?: boolean;
  error?: string;
}

export interface PaymentRecord {
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

export interface RefundRequest {
  paymentId: string;
  idempotencyKey?: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  status?: RefundStatus;
  error?: string;
}

export interface PaymentProvider {
  processPayment(request: PaymentRequest): Promise<PaymentResult>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus | null>;
  getPaymentRecord(paymentId: string): Promise<PaymentRecord | null>;
  refundPayment(request: RefundRequest): Promise<RefundResult>;
  /**
   * Authenticate a webhook delivery using the provider's documented signature
   * scheme over the raw body and required headers. Returns valid:false for
   * missing, malformed, or invalid signatures. Real adapters must never treat
   * a generic JSON body as proof of payment.
   */
  verifyWebhookSignature(input: WebhookSignatureInput): Promise<WebhookVerificationResult>;
}
