import {
  PrismaClient,
  Prisma,
  FundedAccount,
  FundedAccountStatus,
  AuditAction,
} from "@prisma/client";
import { createLogger, generateCorrelationId } from "./logger";
import { sendFundedAccountActivatedEmail, sendAccountStatusChangedEmail } from "./email/templates";
import { evaluateFundedAccountLink, getEvaluationDenominationCurrency } from "./funded-account-link-policy";
import { isValidFundedAccountTransition } from "./funded-account-transition-policy";

const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

export interface CreateFundedAccountInput {
  evaluationId: string;
  performedBy: string;
}

export interface CreateFundedAccountSuccess {
  success: true;
  account: FundedAccount;
  wasAlreadyCreated: boolean;
  correlationId: string;
}

export interface CreateFundedAccountFailure {
  success: false;
  error: string;
  errorCategory: string;
  recoverable: boolean;
  correlationId: string;
}

export type CreateFundedAccountResult =
  | CreateFundedAccountSuccess
  | CreateFundedAccountFailure;

export interface ApproveFundedAccountInput {
  id: string;
  performedBy: string;
}

export interface ApproveFundedAccountSuccess {
  success: true;
  account: FundedAccount;
  correlationId: string;
}

export interface ApproveFundedAccountFailure {
  success: false;
  error: string;
  errorCategory: string;
  recoverable: boolean;
  correlationId: string;
}

export type ApproveFundedAccountResult =
  | ApproveFundedAccountSuccess
  | ApproveFundedAccountFailure;

export interface LinkAccountInput {
  fundedAccountId: string;
  accountId: string;
  performedBy: string;
}

export interface LinkAccountSuccess {
  success: true;
  account: FundedAccount;
  correlationId: string;
}

export interface LinkAccountFailure {
  success: false;
  error: string;
  errorCategory: string;
  recoverable: boolean;
  correlationId: string;
}

export type LinkAccountResult = LinkAccountSuccess | LinkAccountFailure;

export interface TransitionInput {
  id: string;
  status: FundedAccountStatus;
  reason?: string;
  performedBy: string;
}

export interface TransitionSuccess {
  success: true;
  account: FundedAccount;
  correlationId: string;
}

export interface TransitionFailure {
  success: false;
  error: string;
  errorCategory: string;
  recoverable: boolean;
  correlationId: string;
}

export type TransitionResult = TransitionSuccess | TransitionFailure;

export type GetFundedAccountResult =
  | { success: true; account: FundedAccount }
  | { success: false; error: string; errorCategory: string };

export interface ListFundedAccountsInput {
  traderId?: string;
  status?: FundedAccountStatus;
  evaluationId?: string;
  limit?: number;
}

function makeActor(id: string): { type: "trader"; id: string } | { type: "admin"; id: string } {
  return { type: "trader", id };
}

function makeEntity(type: string, id?: string): { type: string; id?: string } {
  return { type, id };
}

export async function createFundedAccountInTransaction(
  tx: Prisma.TransactionClient,
  input: { evaluationId: string; traderId: string; rulesetVersionId: string | null; performedBy: string },
): Promise<{ account: FundedAccount; wasAlreadyCreated: boolean }> {
  const existing = await tx.fundedAccount.findUnique({ where: { evaluationId: input.evaluationId } });
  if (existing) return { account: existing, wasAlreadyCreated: true };

  const account = await tx.fundedAccount.create({
    data: {
      traderId: input.traderId,
      evaluationId: input.evaluationId,
      rulesetVersionId: input.rulesetVersionId ?? undefined,
      status: "ELIGIBLE",
    },
  });
  await tx.auditLog.create({
    data: {
      action: "ACCOUNT_CREATED" as AuditAction,
      entityType: "FundedAccount",
      entityId: account.id,
      performedBy: input.performedBy,
      details: {
        evaluationId: input.evaluationId,
        rulesetVersionId: input.rulesetVersionId,
        traderId: input.traderId,
        status: account.status,
      },
    },
  });
  return { account, wasAlreadyCreated: false };
}

export async function createFundedAccount(
  prisma: PrismaClient,
  input: CreateFundedAccountInput,
): Promise<CreateFundedAccountResult> {
  const correlationId = generateCorrelationId();
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: input.evaluationId },
    select: { id: true, traderId: true, rulesetVersionId: true, status: true },
  });

  if (!evaluation) {
    logger.error("FUNDED_ACCOUNT", "Evaluation not found", {
      correlationId,
      actor: makeActor(input.performedBy),
      entity: makeEntity("Evaluation", input.evaluationId),
      error: { code: "EVALUATION_NOT_FOUND", message: `Evaluation ${input.evaluationId} not found` },
    });
    return { success: false, error: "Evaluation not found", errorCategory: "NOT_FOUND", recoverable: false, correlationId };
  }
  if (evaluation.status !== "PASSED") {
    return {
      success: false,
      error: `Evaluation is ${evaluation.status}: only a PASSED evaluation can become a funded account`,
      errorCategory: "INVALID_STATE",
      recoverable: false,
      correlationId,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`funded-evaluation:${evaluation.id}`}))`;
      const current = await tx.evaluation.findUnique({ where: { id: evaluation.id }, select: { id: true, status: true } });
      if (!current) return { failure: "NOT_FOUND" as const };
      if (current.status !== "PASSED") return { failure: "INVALID_STATE" as const, status: current.status };
      return createFundedAccountInTransaction(tx, {
        evaluationId: evaluation.id,
        traderId: evaluation.traderId,
        rulesetVersionId: evaluation.rulesetVersionId,
        performedBy: input.performedBy,
      });
    });

    if ("failure" in result) {
      return {
        success: false,
        error: result.failure === "NOT_FOUND" ? "Evaluation not found" : `Evaluation is ${result.status}: only a PASSED evaluation can become a funded account`,
        errorCategory: result.failure,
        recoverable: false,
        correlationId,
      };
    }

    logger.info("FUNDED_ACCOUNT", result.wasAlreadyCreated ? "Funded account already exists for evaluation" : "Funded account created", {
      correlationId,
      actor: makeActor(input.performedBy),
      entity: makeEntity("FundedAccount", result.account.id),
      metadata: { evaluationId: evaluation.id, status: result.account.status, wasAlreadyCreated: result.wasAlreadyCreated },
    });
    return { success: true, account: result.account, wasAlreadyCreated: result.wasAlreadyCreated, correlationId };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.fundedAccount.findUnique({ where: { evaluationId: evaluation.id } });
      if (existing) return { success: true, account: existing, wasAlreadyCreated: true, correlationId };
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("FUNDED_ACCOUNT", "Failed to create funded account", {
      correlationId,
      actor: makeActor(input.performedBy),
      entity: makeEntity("FundedAccount"),
      error: { code: "CREATE_FAILED", message: msg },
    });
    return { success: false, error: "Failed to create funded account", errorCategory: "CREATE_FAILED", recoverable: true, correlationId };
  }
}
export async function approveFundedAccount(
  prisma: PrismaClient,
  input: ApproveFundedAccountInput,
): Promise<ApproveFundedAccountResult> {
  const correlationId = generateCorrelationId();
  const { id, performedBy } = input;

  try {
    type ApprovalOutcome =
      | { kind: "failure"; error: string; errorCategory: string }
      | { kind: "already-approved"; account: FundedAccount }
      | { kind: "approved"; account: FundedAccount; previousStatus: FundedAccountStatus };

    // Serialize approval against linking and lifecycle transitions so a stale
    // approval request cannot overwrite a later ACTIVE/SUSPENDED state.
    const outcome = await prisma.$transaction(async (tx): Promise<ApprovalOutcome> => {
      const locks = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FundedAccount" WHERE "id" = ${id} FOR UPDATE
      `;
      if (locks.length === 0) {
        return { kind: "failure", error: "Funded account not found", errorCategory: "NOT_FOUND" };
      }

      const current = await tx.fundedAccount.findUnique({ where: { id } });
      if (!current) return { kind: "failure", error: "Funded account not found", errorCategory: "NOT_FOUND" };
      if (current.status === "APPROVED") return { kind: "already-approved", account: current };
      if (current.status !== "PENDING" && current.status !== "ELIGIBLE") {
        return {
          kind: "failure",
          error: `Cannot approve: account is ${current.status}`,
          errorCategory: "INVALID_STATE",
        };
      }

      const changed = await tx.fundedAccount.updateMany({
        where: { id, status: current.status },
        data: { status: "APPROVED", updatedAt: new Date() },
      });
      if (changed.count !== 1) throw new Error("FUNDED_ACCOUNT_APPROVAL_CONFLICT");

      const updated = await tx.fundedAccount.findUnique({ where: { id } });
      if (!updated) throw new Error("FUNDED_ACCOUNT_DISAPPEARED_AFTER_APPROVAL");
      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_UPDATED" as AuditAction,
          entityType: "FundedAccount",
          entityId: current.id,
          performedBy,
          details: {
            statusChange: { from: current.status, to: "APPROVED" },
            evaluationId: current.evaluationId,
            rulesetVersionId: current.rulesetVersionId,
          },
        },
      });
      return { kind: "approved", account: updated, previousStatus: current.status };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (outcome.kind === "failure") {
      return {
        success: false,
        error: outcome.error,
        errorCategory: outcome.errorCategory,
        recoverable: false,
        correlationId,
      };
    }
    if (outcome.kind === "already-approved") {
      return { success: true, account: outcome.account, correlationId };
    }

    logger.info("FUNDED_ACCOUNT", "Funded account approved", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount", outcome.account.id),
      metadata: { from: outcome.previousStatus, status: "APPROVED" },
    });

    return { success: true, account: outcome.account, correlationId };
  } catch {
    logger.error("FUNDED_ACCOUNT", "Failed to approve funded account", {
      correlationId,
      error: { code: "APPROVE_FAILED", message: "Funded-account approval transaction failed" },
    });
    return {
      success: false,
      error: "Failed to approve funded account",
      errorCategory: "APPROVE_FAILED",
      recoverable: true,
      correlationId,
    };
  }
}

export async function linkAccount(
  prisma: PrismaClient,
  input: LinkAccountInput,
): Promise<LinkAccountResult> {
  const correlationId = generateCorrelationId();
  const { fundedAccountId, accountId, performedBy } = input;
  try {
    // Lock the funded record first, then the inventory row. Every check and
    // write below uses the locked current state, not a pre-transaction read.
    const linked = await prisma.$transaction(async (tx) => {
      const fundedLocks = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FundedAccount" WHERE "id" = ${fundedAccountId} FOR UPDATE
      `;
      if (fundedLocks.length === 0) return { kind: "missing-funded" as const };

      const fundedAccount = await tx.fundedAccount.findUnique({
        where: { id: fundedAccountId },
        include: {
          trader: { select: { id: true, email: true, firstName: true } },
          evaluation: {
            select: {
              id: true,
              productId: true,
              traderId: true,
              status: true,
              startingBalance: true,
              order: { select: { orderItems: { select: { productId: true, productSnapshot: true } } } },
            },
          },
        },
      });
      if (!fundedAccount) return { kind: "missing-funded" as const };

      const accountLocks = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "MT5Account" WHERE "id" = ${accountId} FOR UPDATE
      `;
      if (accountLocks.length === 0) return { kind: "missing-account" as const };

      const account = await tx.mT5Account.findUnique({
        where: { id: accountId },
        select: { id: true, accountNumber: true, accountSize: true, currency: true, purpose: true, status: true },
      });
      if (!account) return { kind: "missing-account" as const };

      const [activeAssignments, otherFundedLink] = await Promise.all([
        tx.accountAssignment.findMany({
          where: { accountId, status: "ASSIGNED" },
          select: { traderId: true },
          take: 2,
        }),
        tx.fundedAccount.findFirst({
          where: { accountId, id: { not: fundedAccountId } },
          select: { id: true },
        }),
      ]);

      const expectedAccountCurrency = getEvaluationDenominationCurrency(
        fundedAccount.evaluation?.order?.orderItems,
        fundedAccount.evaluation?.productId,
      );
      const decision = evaluateFundedAccountLink({
        fundedStatus: fundedAccount.status,
        linkedAccountId: fundedAccount.accountId,
        requestedAccountId: accountId,
        traderId: fundedAccount.traderId,
        evaluationStatus: fundedAccount.evaluation?.status ?? null,
        evaluationTraderId: fundedAccount.evaluation?.traderId ?? null,
        expectedAccountSize: fundedAccount.evaluation?.startingBalance,
        expectedAccountCurrency,
        accountStatus: account.status,
        accountPurpose: account.purpose,
        accountSize: account.accountSize,
        accountCurrency: account.currency,
        activeAssignmentTraderId: activeAssignments[0]?.traderId ?? null,
        activeAssignmentCount: activeAssignments.length,
        linkedToAnotherFundedAccount: otherFundedLink !== null,
      });

      if (decision.kind === "rejected") {
        return { kind: "rejected" as const, category: decision.category, message: decision.message };
      }
      if (decision.kind === "already-linked") {
        return { kind: "linked" as const, account: fundedAccount, mt5AccountSize: account.accountSize, wasAlreadyLinked: true };
      }
      if (!expectedAccountCurrency) {
        return { kind: "rejected" as const, category: "TERMS_REVIEW_REQUIRED", message: "The evaluation denomination currency requires review" };
      }

      const reserved = await tx.mT5Account.updateMany({
        where: {
          id: accountId,
          status: "AVAILABLE",
          purpose: "FUNDED",
          accountSize: fundedAccount.evaluation!.startingBalance!,
          currency: expectedAccountCurrency,
        },
        data: { status: "IN_USE", updatedAt: new Date() },
      });
      if (reserved.count !== 1) {
        return { kind: "rejected" as const, category: "ACCOUNT_NOT_AVAILABLE", message: "MT5 account changed before it could be reserved" };
      }

      const assignment = await tx.accountAssignment.create({
        data: { traderId: fundedAccount.traderId, accountId, status: "ASSIGNED" },
      });
      const changed = await tx.fundedAccount.updateMany({
        where: { id: fundedAccountId, status: "APPROVED", accountId: null },
        data: {
          accountId,
          status: "ACTIVE",
          allocatedAt: fundedAccount.allocatedAt ?? new Date(),
          activatedAt: fundedAccount.activatedAt ?? new Date(),
          updatedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new Error("FUNDED_ACCOUNT_LINK_CONFLICT");

      const updated = await tx.fundedAccount.findUnique({ where: { id: fundedAccountId } });
      if (!updated) throw new Error("FUNDED_ACCOUNT_DISAPPEARED_AFTER_LINK");

      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_ASSIGNED" as AuditAction,
          entityType: "FundedAccount",
          entityId: fundedAccountId,
          performedBy,
          details: {
            accountId: account.id,
            accountNumber: account.accountNumber,
            assignmentId: assignment.id,
            fromStatus: fundedAccount.status,
            toStatus: "ACTIVE",
          },
        },
      });

      return { kind: "linked" as const, account: updated, trader: fundedAccount.trader, mt5AccountSize: account.accountSize, wasAlreadyLinked: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (linked.kind === "missing-funded") {
      return { success: false, error: "Funded account not found", errorCategory: "NOT_FOUND", recoverable: false, correlationId };
    }
    if (linked.kind === "missing-account") {
      return { success: false, error: "MT5 account not found", errorCategory: "NOT_FOUND", recoverable: false, correlationId };
    }
    if (linked.kind === "rejected") {
      return { success: false, error: linked.message, errorCategory: linked.category, recoverable: false, correlationId };
    }

    logger.info("FUNDED_ACCOUNT", linked.wasAlreadyLinked ? "Funded account already has this MT5 assignment" : "MT5 account linked to funded account", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount", fundedAccountId),
      metadata: { accountId, status: linked.account.status, wasAlreadyLinked: linked.wasAlreadyLinked },
    });

    if (!linked.wasAlreadyLinked && "trader" in linked && linked.trader) {
      await sendFundedAccountActivatedEmail(
        { id: linked.trader.id, email: linked.trader.email, firstName: linked.trader.firstName ?? undefined },
        {
          accountId: linked.account.id,
          accountSize: linked.mt5AccountSize ? String(linked.mt5AccountSize) : "N/A",
          status: linked.account.status,
        },
      ).catch(() => {
        logger.error("FUNDED_ACCOUNT", "Funded account activated email failed", {
          correlationId,
          entity: makeEntity("FundedAccount", fundedAccountId),
          error: { code: "EMAIL_FAILED", message: "Failed to send funded account activated email" },
        });
      });
    }

    return { success: true, account: linked.account, correlationId };
  } catch {
    logger.error("FUNDED_ACCOUNT", "Failed to link account", {
      correlationId,
      error: { code: "LINK_FAILED", message: "Transactional MT5 assignment failed" },
    });
    return {
      success: false,
      error: "Failed to link account",
      errorCategory: "LINK_FAILED",
      recoverable: true,
      correlationId,
    };
  }
}

export async function transitionFundedAccountStatus(
  prisma: PrismaClient,
  input: TransitionInput,
): Promise<TransitionResult> {
  const correlationId = generateCorrelationId();
  const { id, status, reason, performedBy } = input;
  if ((status === "SUSPENDED" || status === "TERMINATED") && !reason?.trim()) {
    return {
      success: false,
      error: `A reason is required to set an account to ${status}`,
      errorCategory: "REASON_REQUIRED",
      recoverable: false,
      correlationId,
    };
  }
  try {
    type TransitionOutcome =
      | { kind: "failure"; error: string; errorCategory: string }
      | { kind: "unchanged"; account: FundedAccount }
      | {
          kind: "updated";
          account: FundedAccount;
          previousStatus: FundedAccountStatus;
          trader: { id: string; email: string; firstName: string | null } | null;
          accountSize: unknown;
        };

    const outcome = await prisma.$transaction(async (tx): Promise<TransitionOutcome> => {
      const fundedLocks = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FundedAccount" WHERE "id" = ${id} FOR UPDATE
      `;
      if (fundedLocks.length === 0) {
        return { kind: "failure", error: "Funded account not found", errorCategory: "NOT_FOUND" };
      }

      const current = await tx.fundedAccount.findUnique({
        where: { id },
        include: {
          trader: { select: { id: true, email: true, firstName: true } },
          account: { select: { id: true, status: true, purpose: true, accountSize: true, currency: true } },
          evaluation: {
            select: {
              id: true,
              productId: true,
              traderId: true,
              status: true,
              startingBalance: true,
              order: { select: { orderItems: { select: { productId: true, productSnapshot: true } } } },
            },
          },
        },
      });
      if (!current) {
        return { kind: "failure", error: "Funded account not found", errorCategory: "NOT_FOUND" };
      }

      if (status === current.status) return { kind: "unchanged", account: current };
      if (!isValidFundedAccountTransition(current.status, status)) {
        return {
          kind: "failure",
          error: `Invalid transition from ${current.status} to ${status}`,
          errorCategory: "INVALID_TRANSITION",
        };
      }

      const previousStatus = current.status;
      const now = new Date();
      const auditDetails: Record<string, unknown> = {
        statusChange: { from: previousStatus, to: status },
        evaluationId: current.evaluationId,
        rulesetVersionId: current.rulesetVersionId,
      };
      if (reason) auditDetails.reason = reason;

      if (status === "ACTIVE") {
        if (!current.accountId) {
          return { kind: "failure", error: "A consistent MT5 assignment is required to reactivate this funded account", errorCategory: "TERMS_REVIEW_REQUIRED" };
        }
        const accountLocks = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "MT5Account" WHERE "id" = ${current.accountId} FOR UPDATE
        `;
        if (accountLocks.length === 0) {
          return { kind: "failure", error: "The linked MT5 account is missing and requires review", errorCategory: "TERMS_REVIEW_REQUIRED" };
        }
        const mt5Account = await tx.mT5Account.findUnique({
          where: { id: current.accountId },
          select: { id: true, accountSize: true, currency: true, purpose: true, status: true },
        });
        if (!mt5Account) {
          return { kind: "failure", error: "The linked MT5 account is missing and requires review", errorCategory: "TERMS_REVIEW_REQUIRED" };
        }
        const [assignments, anotherFundedAccount] = await Promise.all([
          tx.accountAssignment.findMany({
            where: { accountId: current.accountId, status: "ASSIGNED" },
            select: { traderId: true },
            take: 2,
          }),
          tx.fundedAccount.findFirst({
            where: { accountId: current.accountId, id: { not: current.id } },
            select: { id: true },
          }),
        ]);
        const assignmentDecision = evaluateFundedAccountLink({
          fundedStatus: "ACTIVE",
          linkedAccountId: current.accountId,
          requestedAccountId: current.accountId,
          traderId: current.traderId,
          evaluationStatus: current.evaluation?.status ?? null,
          evaluationTraderId: current.evaluation?.traderId ?? null,
          expectedAccountSize: current.evaluation?.startingBalance,
          expectedAccountCurrency: getEvaluationDenominationCurrency(
            current.evaluation?.order?.orderItems,
            current.evaluation?.productId,
          ),
          accountStatus: mt5Account.status,
          accountPurpose: mt5Account.purpose,
          accountSize: mt5Account.accountSize,
          accountCurrency: mt5Account.currency,
          activeAssignmentTraderId: assignments[0]?.traderId ?? null,
          activeAssignmentCount: assignments.length,
          linkedToAnotherFundedAccount: anotherFundedAccount !== null,
        });
        if (assignmentDecision.kind !== "already-linked") {
          return {
            kind: "failure",
            error: assignmentDecision.kind === "rejected" ? assignmentDecision.message : "The linked MT5 assignment requires review",
            errorCategory: "TERMS_REVIEW_REQUIRED",
          };
        }
      }

      const terminal = status === "TERMINATED" || status === "COMPLETED";
      if (terminal && current.accountId) {
        const accountLocks = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "MT5Account" WHERE "id" = ${current.accountId} FOR UPDATE
        `;
        if (accountLocks.length === 0) {
          return { kind: "failure", error: "The linked MT5 account is missing and requires review", errorCategory: "TERMS_REVIEW_REQUIRED" };
        }
        const mt5Account = await tx.mT5Account.findUnique({
          where: { id: current.accountId },
          select: { id: true, purpose: true, status: true },
        });
        if (!mt5Account || mt5Account.purpose !== "FUNDED") {
          return { kind: "failure", error: "The linked inventory is inconsistent and requires review", errorCategory: "TERMS_REVIEW_REQUIRED" };
        }
        const [assignments, anotherFundedAccount] = await Promise.all([
          tx.accountAssignment.findMany({
            where: { accountId: current.accountId, status: "ASSIGNED" },
            select: { id: true, traderId: true },
            take: 2,
          }),
          tx.fundedAccount.findFirst({
            where: { accountId: current.accountId, id: { not: current.id } },
            select: { id: true },
          }),
        ]);
        if (
          assignments.length > 1 ||
          (assignments[0] && assignments[0].traderId !== current.traderId) ||
          anotherFundedAccount
        ) {
          return { kind: "failure", error: "The linked MT5 assignment is inconsistent and requires review", errorCategory: "TERMS_REVIEW_REQUIRED" };
        }

        if (assignments[0]) {
          const revoked = await tx.accountAssignment.updateMany({
            where: { id: assignments[0].id, status: "ASSIGNED" },
            data: { status: "REVOKED", revokedAt: now },
          });
          if (revoked.count !== 1) throw new Error("FUNDED_ACCOUNT_ASSIGNMENT_CHANGED");
        }
        if (mt5Account.status !== "INACTIVE") {
          const deactivated = await tx.mT5Account.updateMany({
            where: { id: current.accountId, status: mt5Account.status },
            data: { status: "INACTIVE", updatedAt: now },
          });
          if (deactivated.count !== 1) throw new Error("FUNDED_ACCOUNT_INVENTORY_CHANGED");
        }
        auditDetails.inventoryRelease = {
          accountId: current.accountId,
          assignmentId: assignments[0]?.id ?? null,
          assignmentStatus: assignments[0] ? { from: "ASSIGNED", to: "REVOKED" } : null,
          accountStatus: { from: mt5Account.status, to: "INACTIVE" },
        };
      }

      const updateData: Record<string, unknown> = { status, updatedAt: now };
      if (status === "TERMINATED" || status === "COMPLETED") updateData.closedAt = now;
      if (status === "ACTIVE") {
        updateData.activatedAt = current.activatedAt ?? now;
        updateData.allocatedAt = current.allocatedAt ?? now;
      }
      const changed = await tx.fundedAccount.updateMany({
        where: { id, status: previousStatus, accountId: current.accountId },
        data: updateData,
      });
      if (changed.count !== 1) throw new Error("FUNDED_ACCOUNT_STATUS_CHANGED");

      const updated = await tx.fundedAccount.findUnique({ where: { id } });
      if (!updated) throw new Error("FUNDED_ACCOUNT_DISAPPEARED_AFTER_TRANSITION");

      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_UPDATED" as AuditAction,
          entityType: "FundedAccount",
          entityId: current.id,
          performedBy,
          details: auditDetails as unknown as Prisma.JsonObject,
        },
      });

      return {
        kind: "updated",
        account: updated,
        previousStatus,
        trader: current.trader,
        accountSize: current.account?.accountSize,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (outcome.kind === "failure") {
      return {
        success: false,
        error: outcome.error,
        errorCategory: outcome.errorCategory,
        recoverable: false,
        correlationId,
      };
    }
    if (outcome.kind === "unchanged") return { success: true, account: outcome.account, correlationId };

    const updated = outcome.account;
    const previousStatus = outcome.previousStatus;
    logger.info("FUNDED_ACCOUNT", "Funded account status transitioned", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount", updated.id),
      metadata: { from: previousStatus, to: status, reason: reason ?? undefined },
    });

    if (outcome.trader) {
      try {
        if (status === "ACTIVE") {
          await sendFundedAccountActivatedEmail(
            { id: outcome.trader.id, email: outcome.trader.email, firstName: outcome.trader.firstName ?? undefined },
            {
              accountId: updated.id,
              accountSize: outcome.accountSize ? String(outcome.accountSize) : "N/A",
              status: updated.status,
            },
          );
        }
        await sendAccountStatusChangedEmail(
          { id: outcome.trader.id, email: outcome.trader.email, firstName: outcome.trader.firstName ?? undefined },
          { accountId: updated.id, oldStatus: previousStatus, newStatus: updated.status, reason },
        );
      } catch {
        logger.error("FUNDED_ACCOUNT", "Status change notification email failed", {
          correlationId,
          entity: makeEntity("FundedAccount", updated.id),
          error: { code: "EMAIL_FAILED", message: "Failed to send status change notification email" },
        });
      }
    }

    return { success: true, account: updated, correlationId };
  } catch {
    logger.error("FUNDED_ACCOUNT", "Failed to transition funded account", {
      correlationId,
      error: { code: "TRANSITION_FAILED", message: "Funded-account transition transaction failed" },
    });
    return {
      success: false,
      error: "Failed to transition funded account",
      errorCategory: "TRANSITION_FAILED",
      recoverable: true,
      correlationId,
    };
  }
}

/**
 * Fetch a single funded account.
 *
 * `traderId` is an OWNERSHIP SCOPE, not a lookup key: it must come from the
 * server-verified session, never from client input. When supplied, the query is
 * constrained to that trader, so another trader's account is reported as
 * NOT_FOUND rather than returned. Omit it only for ADMIN callers, which are
 * already authorized to read across traders by the route layer.
 */
export async function getFundedAccount(
  prisma: PrismaClient,
  id: string,
  traderId?: string,
): Promise<GetFundedAccountResult> {
  const account = await prisma.fundedAccount.findFirst({
    where: traderId ? { id, traderId } : { id },
  });

  if (!account) {
    return { success: false, error: "Funded account not found", errorCategory: "NOT_FOUND" };
  }

  return { success: true, account };
}

export async function listFundedAccounts(
  prisma: PrismaClient,
  input: ListFundedAccountsInput = {},
): Promise<FundedAccount[]> {
  const where: Record<string, unknown> = {};
  if (input.traderId) where.traderId = input.traderId;
  if (input.status) where.status = input.status;
  if (input.evaluationId) where.evaluationId = input.evaluationId;

  return prisma.fundedAccount.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 50,
  });
}
