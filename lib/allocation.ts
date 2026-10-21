import type { PrismaClient, MT5Account, AccountAssignment, MT5AccountPurpose } from "@prisma/client";

export interface AllocateAccountInput {
  traderId: string;
  minAccountSize?: number;
  maxAccountSize?: number;
  purpose?: MT5AccountPurpose;
}

export interface AllocateAccountSuccess {
  success: true;
  account: MT5Account;
  assignment: AccountAssignment;
  evaluationLinked?: boolean;
}

export interface AllocateAccountFailure {
  success: false;
  error: string;
}

export type AllocateAccountResult = AllocateAccountSuccess | AllocateAccountFailure;

export async function allocateAccount(
  prisma: PrismaClient,
  input: AllocateAccountInput
): Promise<AllocateAccountResult> {
  // Retired legacy allocator: it accepts optional, non-purchase-scoped filters
  // and can reserve inventory without the canonical activation invariants.
  // Keep the old export fail-closed while callers migrate to
  // activatePaidOrder(), which validates purchased terms and reserves an exact
  // EVALUATION account in one transaction.
  void prisma;
  void input;
  return { success: false, error: "Legacy account allocation is disabled. Use the verified paid-order activation flow." };
}
