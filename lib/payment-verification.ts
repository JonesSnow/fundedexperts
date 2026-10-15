import type { PaymentProvider, PaymentRecord } from "./payment";

export interface OrderPaymentTerms {
  orderId: string;
  amount: unknown;
  currency: string;
}

export type PaymentVerificationFailure =
  | "NOT_FOUND"
  | "NOT_COMPLETED"
  | "ORDER_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "INVALID_TERMS";

export type PaymentVerificationResult =
  | { valid: true; payment: PaymentRecord }
  | { valid: false; reason: PaymentVerificationFailure };

function canonicalAmount(value: unknown): string | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim();
  } else if (typeof value === "object" && value !== null && "toString" in value && typeof value.toString === "function") {
    text = value.toString();
  } else {
    return null;
  }

  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = match[2] ?? "";
  if (fraction.length > 2 && /[^0]/.test(fraction.slice(2))) return null;
  return `${whole}.${fraction.slice(0, 2).padEnd(2, "0")}`;
}

function canonicalCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export function verifyPaymentForOrder(
  terms: OrderPaymentTerms,
  payment: PaymentRecord | null,
): PaymentVerificationResult {
  if (!payment) return { valid: false, reason: "NOT_FOUND" };
  if (payment.status !== "COMPLETED") return { valid: false, reason: "NOT_COMPLETED" };
  if (!terms.orderId || !payment.orderId || payment.orderId !== terms.orderId) {
    return { valid: false, reason: "ORDER_MISMATCH" };
  }

  const expectedAmount = canonicalAmount(terms.amount);
  const paidAmount = canonicalAmount(payment.amount);
  const expectedCurrency = canonicalCurrency(terms.currency);
  const paidCurrency = canonicalCurrency(payment.currency);
  if (expectedAmount === null || expectedCurrency === null) return { valid: false, reason: "INVALID_TERMS" };
  if (paidAmount === null) return { valid: false, reason: "AMOUNT_MISMATCH" };
  if (paidCurrency === null) return { valid: false, reason: "CURRENCY_MISMATCH" };
  if (expectedAmount !== paidAmount) return { valid: false, reason: "AMOUNT_MISMATCH" };
  if (expectedCurrency !== paidCurrency) return { valid: false, reason: "CURRENCY_MISMATCH" };
  return { valid: true, payment };
}

export async function verifyProviderPaymentForOrder(
  provider: Pick<PaymentProvider, "getPaymentRecord">,
  reference: string,
  terms: OrderPaymentTerms,
): Promise<PaymentVerificationResult> {
  const payment = await provider.getPaymentRecord(reference);
  return verifyPaymentForOrder(terms, payment);
}
