export interface FundedAccountLinkState {
  fundedStatus: string;
  linkedAccountId: string | null;
  requestedAccountId: string;
  traderId: string;
  evaluationStatus: string | null;
  evaluationTraderId: string | null;
  expectedAccountSize: unknown;
  expectedAccountCurrency: string | null;
  accountStatus: string;
  accountPurpose: string | null;
  accountSize: unknown;
  accountCurrency: string | null;
  credentialsConfigured: boolean;
  activeAssignmentTraderId: string | null;
  activeAssignmentCount: number;
  linkedToAnotherFundedAccount: boolean;
}

export type FundedAccountLinkDecision =
  | { kind: "ready" }
  | { kind: "already-linked" }
  | { kind: "rejected"; category: string; message: string };

function canonicalAmount(value: unknown): string | null {
  const text = typeof value === "string"
    ? value
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : value !== null && typeof value === "object" && "toString" in value && typeof value.toString === "function"
        ? value.toString()
        : "";
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

export function getEvaluationDenominationCurrency(
  orderItems: unknown,
  expectedProductId?: string | null,
  laterStageAccount?: { accountSize: unknown; startingBalance: unknown; currency: unknown; purpose: unknown },
): string | null {
  if (Array.isArray(orderItems)) {
    if (orderItems.length !== 1) return null;
    const item = orderItems[0];
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const itemRecord = item as Record<string, unknown>;
    const productSnapshot = itemRecord.productSnapshot;
    if (typeof productSnapshot !== "object" || productSnapshot === null || Array.isArray(productSnapshot)) return null;
    const snapshot = productSnapshot as Record<string, unknown>;
    if (
      typeof itemRecord.productId !== "string"
      || typeof snapshot.productId !== "string"
      || itemRecord.productId !== snapshot.productId
      || (expectedProductId && expectedProductId !== snapshot.productId)
    ) return null;
    const currency = snapshot.denominationCurrency;
    return typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : null;
  }

  // Later challenge stages cannot point at the same order because Evaluation.orderId
  // is unique. Their product and stage are immutable after publication; use the
  // assigned EVALUATION account only when it still agrees with the recorded balance.
  if ((orderItems !== null && orderItems !== undefined) || !expectedProductId || !laterStageAccount) return null;
  const evaluationSize = canonicalAmount(laterStageAccount.startingBalance);
  const accountSize = canonicalAmount(laterStageAccount.accountSize);
  if (
    evaluationSize === null
    || accountSize === null
    || evaluationSize === "0.00"
    || evaluationSize !== accountSize
    || laterStageAccount.purpose !== "EVALUATION"
    || typeof laterStageAccount.currency !== "string"
    || !/^[A-Z]{3}$/.test(laterStageAccount.currency)
  ) return null;
  return laterStageAccount.currency;
}

function canonicalCurrency(value: string | null): string | null {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : null;
}

function reject(category: string, message: string): FundedAccountLinkDecision {
  return { kind: "rejected", category, message };
}

/**
 * Keeps funded-account linking tied to a passed evaluation and one matching,
 * unused FUNDED inventory account. The transaction still enforces these
 * checks under row locks before making any writes.
 */
export function evaluateFundedAccountLink(state: FundedAccountLinkState): FundedAccountLinkDecision {
  if (state.evaluationStatus !== "PASSED" || state.evaluationTraderId !== state.traderId) {
    return reject("TERMS_REVIEW_REQUIRED", "A funded account must belong to its trader's passed evaluation");
  }

  if (state.linkedAccountId && state.linkedAccountId !== state.requestedAccountId) {
    return reject("ALREADY_LINKED", "Funded account is already linked to a different MT5 account");
  }

  const expectedSize = canonicalAmount(state.expectedAccountSize);
  const accountSize = canonicalAmount(state.accountSize);
  if (expectedSize === null || accountSize === null) {
    return reject("TERMS_REVIEW_REQUIRED", "The funded account size cannot be verified against the passed evaluation");
  }
  if (expectedSize === "0.00" || accountSize === "0.00") {
    return reject("TERMS_REVIEW_REQUIRED", "Funded-account sizes must be greater than zero");
  }
  if (expectedSize !== accountSize) {
    return reject("ACCOUNT_SIZE_MISMATCH", "MT5 account size does not match the passed evaluation");
  }
  const expectedCurrency = canonicalCurrency(state.expectedAccountCurrency);
  const accountCurrency = canonicalCurrency(state.accountCurrency);
  if (expectedCurrency === null || accountCurrency === null) {
    return reject("TERMS_REVIEW_REQUIRED", "The funded-account denomination currency cannot be verified");
  }
  if (expectedCurrency !== accountCurrency) {
    return reject("ACCOUNT_CURRENCY_MISMATCH", "MT5 account currency does not match the passed evaluation");
  }
  if (state.accountPurpose !== "FUNDED") {
    return reject("ACCOUNT_PURPOSE_MISMATCH", "Only a FUNDED-purpose MT5 account can be linked");
  }
  if (state.credentialsConfigured !== true) {
    return reject("CREDENTIALS_UNAVAILABLE", "MT5 account has no stored encrypted credentials and cannot be assigned");
  }
  if (state.linkedToAnotherFundedAccount) {
    return reject("ACCOUNT_ALREADY_LINKED", "MT5 account is already linked to another funded account");
  }

  const alreadyLinked = state.linkedAccountId === state.requestedAccountId;
  if (alreadyLinked) {
    if (
      state.fundedStatus === "ACTIVE" &&
      state.accountStatus === "IN_USE" &&
      state.activeAssignmentCount === 1 &&
      state.activeAssignmentTraderId === state.traderId
    ) {
      return { kind: "already-linked" };
    }
    return reject("TERMS_REVIEW_REQUIRED", "Existing funded-account linkage is inconsistent and requires review");
  }

  if (state.fundedStatus !== "APPROVED") {
    return reject("INVALID_STATE", "Only an approved funded account can receive its first MT5 assignment");
  }
  if (state.accountStatus !== "AVAILABLE") {
    return reject("ACCOUNT_NOT_AVAILABLE", "MT5 account is not available for assignment");
  }
  if (state.activeAssignmentCount > 0 || state.activeAssignmentTraderId !== null) {
    return reject("ACCOUNT_ALREADY_ASSIGNED", "MT5 account already has an active assignment");
  }

  return { kind: "ready" };
}
