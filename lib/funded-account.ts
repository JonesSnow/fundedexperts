import {
  PrismaClient,
  Prisma,
  FundedAccount,
  FundedAccountStatus,
  MT5Account,
  AccountAssignment,
  Evaluation,
  AuditAction,
  Order,
  OrderStatus,
} from "@prisma/client";
import { createLogger, generateCorrelationId } from "./logger";

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
    const account = await prisma.fundedAccount.create({
      data: {
        traderId: evaluation.traderId,
        evaluationId: evaluation.id,
        rulesetVersionId: evaluation.rulesetVersionId ?? undefined,
        status: "PENDING",
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "ACCOUNT_CREATED" as AuditAction,
        entityType: "FundedAccount",
        entityId: account.id,
        performedBy,
        details: {
          evaluationId: evaluation.id,
          rulesetVersionId: evaluation.rulesetVersionId,
          traderId: evaluation.traderId,
          status: account.status,
        },
      },
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
    const updated = await prisma.fundedAccount.update({
      where: { id },
      data: {
        status: "APPROVED",
        updatedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
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
    const updated = await prisma.fundedAccount.update({
      where: { id: fundedAccountId },
      data: {
        accountId: accountId,
        status: "ACTIVE",
        allocatedAt: fundedAccount.allocatedAt ?? new Date(),
        activatedAt: fundedAccount.activatedAt ?? new Date(),
        updatedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
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

    logger.info("FUNDED_ACCOUNT", "MT5 account linked to funded account", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount", fundedAccountId),
      metadata: { accountId: account.id, status: "ACTIVE" },
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

    const updated = await prisma.fundedAccount.update({
      where: { id },
      data: updateData,
    });

    const auditDetails: Record<string, unknown> = {
      statusChange: { from: account.status, to: status },
    };
    if (reason) {
      auditDetails.reason = reason;
    }
    auditDetails.evaluationId = account.evaluationId;
    auditDetails.rulesetVersionId = account.rulesetVersionId;

    await prisma.auditLog.create({
      data: {
        action: "ACCOUNT_UPDATED" as AuditAction,
        entityType: "FundedAccount",
        entityId: account.id,
        performedBy,
        details: auditDetails as unknown as Prisma.JsonObject,
      },
    });

    logger.info("FUNDED_ACCOUNT", "Funded account status transitioned", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("FundedAccount", account.id),
      metadata: { from: account.status, to: status, reason: reason ?? undefined },
    });

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

export async function getFundedAccount(
  prisma: PrismaClient,
  id: string,
): Promise<GetFundedAccountResult> {
  const account = await prisma.fundedAccount.findUnique({
    where: { id },
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
