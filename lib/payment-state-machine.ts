export type OrderPaymentStatus =
  | "CREATED"
  | "PENDING_PAYMENT"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type PaymentEvent =
  | "PAYMENT_INITIATED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "PAYMENT_EXPIRED"
  | "PAYMENT_CANCELLED"
  | "REFUND_INITIATED"
  | "REFUND_COMPLETED";

const VALID_TRANSITIONS: Record<OrderPaymentStatus, PaymentEvent[]> = {
  CREATED: ["PAYMENT_INITIATED", "PAYMENT_CONFIRMED"],
  PENDING_PAYMENT: ["PAYMENT_INITIATED", "PAYMENT_CONFIRMED", "PAYMENT_FAILED", "PAYMENT_EXPIRED", "PAYMENT_CANCELLED"],
  PAID: ["REFUND_INITIATED"],
  FAILED: ["PAYMENT_INITIATED", "PAYMENT_CONFIRMED"],
  EXPIRED: ["PAYMENT_INITIATED", "PAYMENT_CONFIRMED"],
  CANCELLED: [],
};

export function isValidTransition(
  currentState: string,
  event: PaymentEvent,
): boolean {
  const state = currentState as OrderPaymentStatus;
  return VALID_TRANSITIONS[state]?.includes(event) ?? false;
}

export function getNextState(
  currentState: string,
  event: PaymentEvent,
): OrderPaymentStatus | null {
  if (!isValidTransition(currentState, event)) return null;
  switch (event) {
    case "PAYMENT_INITIATED":
      return "PENDING_PAYMENT";
    case "PAYMENT_CONFIRMED":
      return "PAID";
    case "PAYMENT_FAILED":
      return "FAILED";
    case "PAYMENT_EXPIRED":
      return "EXPIRED";
    case "PAYMENT_CANCELLED":
      return "CANCELLED";
    case "REFUND_INITIATED":
      return "PAID";
    case "REFUND_COMPLETED":
      return "CANCELLED";
    default:
      return null;
  }
}

export function isTerminalState(state: OrderPaymentStatus): boolean {
  return state === "CANCELLED" || state === "EXPIRED";
}

export function canAllocateAccount(state: OrderPaymentStatus): boolean {
  return state === "PAID";
}
