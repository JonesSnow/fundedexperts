export type PaymentStatus =
  "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REFUNDED" | "CANCELLED";
export type PaymentProviderName = "STRIPE" | "PAYPAL" | "MOCK";
export type RefundStatus = "PENDING" | "COMPLETED" | "FAILED";

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
  refundPayment(request: RefundRequest): Promise<RefundResult>;
}
