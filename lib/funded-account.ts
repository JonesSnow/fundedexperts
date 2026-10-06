import {
  PrismaClient,
  Prisma,
  FundedAccount,
  FundedAccountStatus,
  AuditAction,
} from "@prisma/client";
import { createLogger, generateCorrelationId } from "./logger";
import { sendFundedAccountActivatedEmail, sendAccountStatusChangedEmail } from "./email/templates";

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

const VALID_TRANSITIONS: Record<FundedAccountStatus, FundedAccountStatus[]> = {
  PENDING: ["ELIGIBLE"],
  ELIGIBLE: ["APPROVED"],
  APPROVED: ["ACTIVE"],
  ACTIVE: ["SUSPENDED", "COMPLETED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
  COMPLETED: [],
  CLOSED: [],
};

function isValidTransition(
  from: FundedAccountStatus,
  to: FundedAccountStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

function makeActor(id: string): { type: "trader"; id: string } | { type: "admin"; id: string } {
  return { type: "trader", id };
}

function makeEntity(type: string, id?: string): { type: string; id?: string } {
  return { type, id };
}

export async function createFundedAccount(
  prisma: PrismaClient,
  input: CreateFundedAccountInput,
): Promise<CreateFundedAccountResult> {
  const correlationId = generateCorrelationId();
  const { evaluationId, performedBy } = input;

  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: { rulesetVersion: true },
  });

  if (!evaluation) {
    logger.error("FUNDED_ACCOUNT", "Evaluation not found", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Evaluation", evaluationId),
      error: { code: "EVALUATION_NOT_FOUND", message: `Evaluation ${evaluationId} not found` },
    });
    return {
      success: false,
      error: "Evaluation not found",
      errorCategory: "NOT_FOUND",
      recoverable: false,
      correlationId,
    };
  }

  if (evaluation.status !== "PASSED") {
    logger.error("FUNDED_ACCOUNT", "Evaluation has not passed", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Evaluation", evaluationId),
      error: {
        code: "EVALUATION_NOT_PASSED",
        message: `Evaluation ${evaluationId} is ${evaluation.status}`,
      },
    });
    return {
      success: false,
      error: `Evaluation is ${evaluation.status}: only a PASSED evaluation can become a funded account`,
      errorCategory: "INVALID_STATE",
      recoverable: false,
      correlationId,
    };
  }

  const existing = await prisma.fundedAccount.findFirst({
    where: { evaluationId },
  });

  if (existing) {
    logger.info("FUNDED_ACCOUNT", "Funded account already exists for evaluation", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount", existing.id),
      metadata: { evaluationId, status: existing.status },
    });
    return {
      success: true,
      account: existing,
      wasAlreadyCreated: true,
      correlationId,
    };
  }

  try {
    // The funded account row and its audit entry are written in one transaction.
    // Previously the audit insert was a separate statement, so a failure there
    // returned an error for a row that had already been committed, leaving the
    // audit trail permanently missing that the account was created.
    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.fundedAccount.create({
        data: {
          traderId: evaluation.traderId,
          evaluationId: evaluation.id,
          rulesetVersionId: evaluation.rulesetVersionId ?? undefined,
          status: "ELIGIBLE",
        },
      });

      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_CREATED" as AuditAction,
          entityType: "FundedAccount",
          entityId: created.id,
          performedBy,
          details: {
            evaluationId: evaluation.id,
            rulesetVersionId: evaluation.rulesetVersionId,
            traderId: evaluation.traderId,
            status: created.status,
          },
        },
      });

      return created;
    });

    logger.info("FUNDED_ACCOUNT", "Funded account created", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount", account.id),
      metadata: { evaluationId: evaluation.id, status: account.status },
    });

    return {
      success: true,
      account,
      wasAlreadyCreated: false,
      correlationId,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logger.error("FUNDED_ACCOUNT", "Failed to create funded account", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount"),
      error: { code: "CREATE_FAILED", message: msg },
    });
    return {
      success: false,
      error: "Failed to create funded account",
      errorCategory: "CREATE_FAILED",
      recoverable: true,
      correlationId,
    };
  }
}

export async function approveFundedAccount(
  prisma: PrismaClient,
  input: ApproveFundedAccountInput,
): Promise<ApproveFundedAccountResult> {
  const correlationId = generateCorrelationId();
  const { id, performedBy } = input;

  const account = await prisma.fundedAccount.findUnique({
    where: { id },
  });

  if (!account) {
    return {
      success: false,
      error: "Funded account not found",
      errorCategory: "NOT_FOUND",
      recoverable: false,
      correlationId,
    };
  }

  if (account.status !== "PENDING" && account.status !== "ELIGIBLE") {
    return {
      success: false,
      error: `Cannot approve: account is ${account.status}`,
      errorCategory: "INVALID_STATE",
      recoverable: false,
      correlationId,
    };
  }

  try {
    // Status change and its audit entry commit together, so a failed audit
    // write can no longer leave an APPROVED account with no audit record.
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.fundedAccount.update({
        where: { id },
        data: {
          status: "APPROVED",
          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_UPDATED" as AuditAction,
          entityType: "FundedAccount",
          entityId: account.id,
          performedBy,
          details: {
            statusChange: { from: account.status, to: "APPROVED" },
            evaluationId: account.evaluationId,
            rulesetVersionId: account.rulesetVersionId,
          },
        },
      });

      return changed;
    });

    logger.info("FUNDED_ACCOUNT", "Funded account approved", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount", account.id),
      metadata: { status: "APPROVED" },
    });

    return { success: true, account: updated, correlationId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logger.error("FUNDED_ACCOUNT", "Failed to approve funded account", {
      correlationId,
      error: { code: "APPROVE_FAILED", message: msg },
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

  const fundedAccount = await prisma.fundedAccount.findUnique({
    where: { id: fundedAccountId },
    include: { trader: true },
  });

  if (!fundedAccount) {
    return {
      success: false,
      error: "Funded account not found",
      errorCategory: "NOT_FOUND",
      recoverable: false,
      correlationId,
    };
  }

  const account = await prisma.mT5Account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    return {
      success: false,
      error: "MT5 account not found",
      errorCategory: "NOT_FOUND",
      recoverable: false,
      correlationId,
    };
  }

  if (fundedAccount.accountId && fundedAccount.accountId !== accountId) {
    return {
      success: false,
      error: "Funded account already linked to a different MT5 account",
      errorCategory: "ALREADY_LINKED",
      recoverable: false,
      correlationId,
    };
  }

  if (fundedAccount.status !== "APPROVED" && fundedAccount.status !== "ACTIVE") {
    return {
      success: false,
      error: `Cannot link account: funded account is ${fundedAccount.status}`,
      errorCategory: "INVALID_STATE",
      recoverable: false,
      correlationId,
    };
  }

  try {
    // Link mutation and its audit entry commit together. The activation email
    // is intentionally sent AFTER the transaction commits, so an email failure
    // cannot roll back the link.
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.fundedAccount.update({
        where: { id: fundedAccountId },
        data: {
          accountId: accountId,
          status: "ACTIVE",
          allocatedAt: fundedAccount.allocatedAt ?? new Date(),
          activatedAt: fundedAccount.activatedAt ?? new Date(),
          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_ASSIGNED" as AuditAction,
          entityType: "FundedAccount",
          entityId: fundedAccountId,
          performedBy,
          details: {
            accountId: account.id,
            accountNumber: account.accountNumber,
            fromStatus: fundedAccount.status,
            toStatus: "ACTIVE",
          },
        },
      });

      return changed;
    });

    logger.info("FUNDED_ACCOUNT", "MT5 account linked to funded account", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount", fundedAccountId),
      metadata: { accountId: account.id, status: "ACTIVE" },
    });

    await sendFundedAccountActivatedEmail(
      { id: fundedAccount.traderId, email: fundedAccount.trader?.email ?? "", firstName: fundedAccount.trader?.firstName ?? undefined },
      {
        accountId: updated.id,
        accountSize: account.accountSize ? String(account.accountSize) : "N/A",
        status: updated.status,
      },
    ).catch(() => {
      logger.error("FUNDED_ACCOUNT", "Funded account activated email failed", {
        correlationId,
        entity: makeEntity("FundedAccount", fundedAccountId),
        error: { code: "EMAIL_FAILED", message: "Failed to send funded account activated email" },
      });
    });

    return { success: true, account: updated, correlationId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logger.error("FUNDED_ACCOUNT", "Failed to link account", {
      correlationId,
      error: { code: "LINK_FAILED", message: msg },
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

  const account = await prisma.fundedAccount.findUnique({
    where: { id },
    include: { trader: true, account: true },
  });

  if (!account) {
    return {
      success: false,
      error: "Funded account not found",
      errorCategory: "NOT_FOUND",
      recoverable: false,
      correlationId,
    };
  }

  if (status === account.status) {
    return {
      success: true,
      account,
      correlationId,
    };
  }

  if (!isValidTransition(account.status, status)) {
    return {
      success: false,
      error: `Invalid transition from ${account.status} to ${status}`,
      errorCategory: "INVALID_TRANSITION",
      recoverable: false,
      correlationId,
    };
  }

  try {
    const now = new Date();
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: now,
    };

    if (status === "TERMINATED") {
      updateData.closedAt = now;
    }

    if (status === "ACTIVE") {
      updateData.activatedAt = account.activatedAt ?? now;
      updateData.allocatedAt = account.allocatedAt ?? now;
    }

    const auditDetails: Record<string, unknown> = {
      statusChange: { from: account.status, to: status },
    };
    if (reason) {
      auditDetails.reason = reason;
    }
    auditDetails.evaluationId = account.evaluationId;
    auditDetails.rulesetVersionId = account.rulesetVersionId;

    // Status change and its audit entry commit together. Notification emails
    // are sent after the transaction commits so they cannot affect the write.
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.fundedAccount.update({
        where: { id },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_UPDATED" as AuditAction,
          entityType: "FundedAccount",
          entityId: account.id,
          performedBy,
          details: auditDetails as unknown as Prisma.JsonObject,
        },
      });

      return changed;
    });

    logger.info("FUNDED_ACCOUNT", "Funded account status transitioned", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount", account.id),
      metadata: { from: account.status, to: status, reason: reason ?? undefined },
    });

    if (account.trader) {
      try {
        if (status === "ACTIVE") {
          await sendFundedAccountActivatedEmail(
            { id: account.traderId, email: account.trader.email, firstName: account.trader.firstName ?? undefined },
            {
              accountId: account.id,
              accountSize: account.account?.accountSize ? String(account.account.accountSize) : "N/A",
              status: updated.status,
            },
          );
        }
        await sendAccountStatusChangedEmail(
          { id: account.traderId, email: account.trader.email, firstName: account.trader.firstName ?? undefined },
          {
            accountId: account.id,
            oldStatus: account.status,
            newStatus: updated.status,
            reason: reason,
          },
        );
      } catch {
        logger.error("FUNDED_ACCOUNT", "Status change notification email failed", {
          correlationId,
          entity: makeEntity("FundedAccount", account.id),
          error: { code: "EMAIL_FAILED", message: "Failed to send status change notification email" },
        });
      }
    }

    return { success: true, account: updated, correlationId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logger.error("FUNDED_ACCOUNT", "Failed to transition funded account", {
      correlationId,
      error: { code: "TRANSITION_FAILED", message: msg },
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
