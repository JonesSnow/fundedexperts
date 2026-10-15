import type { FundedAccountStatus } from "@prisma/client";

const VALID_TRANSITIONS: Record<FundedAccountStatus, readonly FundedAccountStatus[]> = {
  PENDING: ["ELIGIBLE"],
  ELIGIBLE: ["APPROVED"],
  APPROVED: [],
  ACTIVE: ["SUSPENDED", "COMPLETED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
  COMPLETED: [],
  CLOSED: [],
};

/** ACTIVE is reached only through linkAccount, which reserves MT5 inventory atomically. */
export function isValidFundedAccountTransition(
  from: FundedAccountStatus,
  to: FundedAccountStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
