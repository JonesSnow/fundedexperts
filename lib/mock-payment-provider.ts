import { randomUUID } from "crypto";
import type {
  PaymentProvider,
  PaymentProviderName,
  PaymentRequest,
  PaymentResult,
  PaymentRecord,
  PaymentStatus,
  RefundRequest,
  RefundResult,
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

export function createMockPaymentProvider(): PaymentProvider {
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
  };
}
