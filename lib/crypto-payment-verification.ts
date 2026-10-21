/**
 * Pure classification for server-side crypto transfer observations.
 *
 * A provider adapter must map its authenticated event or trusted chain query
 * to canonical identifiers before calling this function. A CONFIRMED result
 * is evidence for the payment workflow only; persistence must still enforce
 * transaction uniqueness and atomically transition payment/order state.
 */
export type CryptoPaymentState = "PENDING" | "CONFIRMING" | "CONFIRMED" | "EXPIRED" | "EXCEPTION";

export type CryptoPaymentException =
  | "INVALID_TERMS"
  | "INVALID_OBSERVATION"
  | "ORDER_MISMATCH"
  | "NETWORK_MISMATCH"
  | "ASSET_MISMATCH"
  | "DESTINATION_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "OBSERVATION_FROM_FUTURE"
  | "PAYMENT_AFTER_EXPIRY"
  | "TRANSACTION_DROPPED"
  | "TRANSACTION_REORGED";

export interface ExpectedCryptoPayment {
  orderId: string;
  /** Canonical provider/network identifier, not a display symbol. */
  networkId: string;
  /** Canonical native-asset or token-contract identifier. */
  assetId: string;
  /** Canonical receiving address generated for this payment. */
  destination: string;
  /** Exact amount in the asset's smallest units; no floating-point arithmetic. */
  amountAtomicUnits: string;
  minimumConfirmations: number;
  expiresAt: Date;
  /** Expiry boundary is provider/policy-specific and must be configured explicitly. */
  expirationPolicy: "EXPIRE_AT" | "EXPIRE_AFTER";
}

export interface CryptoTransferObservation {
  /** Server-side association from the trusted invoice/provider lookup. */
  orderId: string;
  networkId: string;
  assetId: string;
  destination: string;
  amountAtomicUnits: string;
  transactionId: string;
  firstSeenAt: Date;
  confirmations: number;
  chainStatus: "PENDING" | "CONFIRMED" | "DROPPED" | "REORGED";
}

export type CryptoPaymentDecision =
  | { state: "PENDING" | "EXPIRED" }
  | { state: "CONFIRMING"; transactionId: string; confirmations: number; requiredConfirmations: number }
  | { state: "CONFIRMED"; transactionId: string; confirmations: number }
  | { state: "EXCEPTION"; reason: CryptoPaymentException; transactionId?: string };

function canonicalIdentifier(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || value.trim() !== value) return null;
  return value;
}

function validAtomicAmount(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 128
    && /^(0|[1-9]\d*)$/.test(value)
    && value !== "0";
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validTerms(terms: ExpectedCryptoPayment): boolean {
  return canonicalIdentifier(terms.orderId) !== null
    && canonicalIdentifier(terms.networkId) !== null
    && canonicalIdentifier(terms.assetId) !== null
    && canonicalIdentifier(terms.destination) !== null
    && validAtomicAmount(terms.amountAtomicUnits)
    && Number.isSafeInteger(terms.minimumConfirmations)
    && terms.minimumConfirmations >= 1
    && validDate(terms.expiresAt)
    && (terms.expirationPolicy === "EXPIRE_AT" || terms.expirationPolicy === "EXPIRE_AFTER");
}

function isExpired(at: Date, terms: ExpectedCryptoPayment): boolean {
  return terms.expirationPolicy === "EXPIRE_AT"
    ? at.getTime() >= terms.expiresAt.getTime()
    : at.getTime() > terms.expiresAt.getTime();
}

export function classifyCryptoPayment(
  terms: ExpectedCryptoPayment,
  observation: CryptoTransferObservation | null,
  asOf: Date,
): CryptoPaymentDecision {
  if (!validTerms(terms) || !validDate(asOf)) return { state: "EXCEPTION", reason: "INVALID_TERMS" };
  if (!observation) return isExpired(asOf, terms) ? { state: "EXPIRED" } : { state: "PENDING" };

  const transactionId = canonicalIdentifier(observation.transactionId);
  if (!transactionId || !validDate(observation.firstSeenAt) || !validAtomicAmount(observation.amountAtomicUnits)
    || !Number.isSafeInteger(observation.confirmations) || observation.confirmations < 0
    || !["PENDING", "CONFIRMED", "DROPPED", "REORGED"].includes(observation.chainStatus)) {
    return { state: "EXCEPTION", reason: "INVALID_OBSERVATION" };
  }
  if (observation.firstSeenAt.getTime() > asOf.getTime()) {
    return { state: "EXCEPTION", reason: "OBSERVATION_FROM_FUTURE", transactionId };
  }
  if (isExpired(observation.firstSeenAt, terms)) {
    return { state: "EXCEPTION", reason: "PAYMENT_AFTER_EXPIRY", transactionId };
  }
  if (observation.orderId !== terms.orderId) return { state: "EXCEPTION", reason: "ORDER_MISMATCH", transactionId };
  if (observation.networkId !== terms.networkId) return { state: "EXCEPTION", reason: "NETWORK_MISMATCH", transactionId };
  if (observation.assetId !== terms.assetId) return { state: "EXCEPTION", reason: "ASSET_MISMATCH", transactionId };
  if (observation.destination !== terms.destination) return { state: "EXCEPTION", reason: "DESTINATION_MISMATCH", transactionId };
  if (observation.amountAtomicUnits !== terms.amountAtomicUnits) return { state: "EXCEPTION", reason: "AMOUNT_MISMATCH", transactionId };
  if (observation.chainStatus === "DROPPED") return { state: "EXCEPTION", reason: "TRANSACTION_DROPPED", transactionId };
  if (observation.chainStatus === "REORGED") return { state: "EXCEPTION", reason: "TRANSACTION_REORGED", transactionId };
  if (observation.chainStatus !== "CONFIRMED" || observation.confirmations < terms.minimumConfirmations) {
    return {
      state: "CONFIRMING",
      transactionId,
      confirmations: observation.confirmations,
      requiredConfirmations: terms.minimumConfirmations,
    };
  }
  return { state: "CONFIRMED", transactionId, confirmations: observation.confirmations };
}
