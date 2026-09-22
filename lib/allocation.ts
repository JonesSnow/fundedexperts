import { PrismaClient, MT5Account, AccountAssignment, MT5AccountPurpose, AuditAction } from "@prisma/client";
import { createLogger, generateCorrelationId } from "./logger";

const logger = createLogger({ environment: process.env.NODE_ENV as "development" | "production" | "test" });

export interface AllocateAccountInput {
  traderId: string;
  minAccountSize?: number;
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
  const { traderId, minAccountSize, purpose } = input;

  let evaluationId: string | null = null;
  try {
    const activeEval = await prisma.evaluation.findFirst({
      where: {
        traderId: traderId,
        status: "IN_PROGRESS",
      },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    evaluationId = activeEval?.id ?? null;
  } catch {
    evaluationId = null;
  }

  if (!evaluationId) {
    return { success: false, error: "No active evaluation found for this trader" } as AllocateAccountFailure;
  }

  const existingAssignment = await prisma.accountAssignment.findFirst({
    where: { traderId, status: "ASSIGNED" },
  });
  if (existingAssignment) {
    return { success: false, error: "Trader already has an active assignment" } as AllocateAccountFailure;
  }

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.$queryRaw<MT5Account[]>`
      SELECT * FROM "MT5Account"
      WHERE "status" = 'AVAILABLE'
      AND (${purpose}::varchar IS NULL OR "purpose" = ${purpose})
      AND (${minAccountSize}::numeric IS NULL OR "accountSize" >= ${minAccountSize})
      ORDER BY "accountSize" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (!account || account.length === 0) {
      return { success: false, error: "No available accounts matching criteria" } as AllocateAccountFailure;
    }

    const selectedAccount = account[0];

    const activeAssignment = await tx.accountAssignment.findFirst({
      where: {
        accountId: selectedAccount.id,
        status: "ASSIGNED",
      },
    });

    if (activeAssignment) {
      return { success: false, error: "Account already assigned" } as AllocateAccountFailure;
    }

    const [assignment, updatedAccount] = await Promise.all([
      tx.accountAssignment.create({
        data: {
          traderId,
          accountId: selectedAccount.id,
          status: "ASSIGNED",
        },
      }),
      tx.mT5Account.update({
        where: { id: selectedAccount.id },
        data: { status: "IN_USE", updatedAt: new Date() },
      }),
    ]);

    await tx.auditLog.create({
      data: {
        action: "ACCOUNT_ASSIGNED",
        entityType: "MT5Account",
        entityId: selectedAccount.id,
        performedBy: traderId,
        details: {
          accountNumber: selectedAccount.accountNumber,
          assignmentId: assignment.id,
        },
      },
    });

    return { success: true, account: updatedAccount, assignment } as AllocateAccountSuccess;
  });

  let evaluationLinked = false;
  if (result.success && evaluationId) {
    try {
      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: { accountId: (result as AllocateAccountSuccess).account.id },
      });
      evaluationLinked = true;
      await prisma.auditLog.create({
        data: {
          action: "EVALUATION_LINKED" as AuditAction,
          entityType: "Evaluation",
          entityId: evaluationId,
          performedBy: traderId,
          details: {
            accountId: (result as AllocateAccountSuccess).account.id,
            accountNumber: (result as AllocateAccountSuccess).account.accountNumber,
          },
        },
      });
    } catch (e) {
      evaluationLinked = false;
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      logger.error("ALLOCATION", "Evaluation linking failed after allocation", {
        correlationId: generateCorrelationId(),
        actor: { type: "system", id: traderId },
        entity: { type: "Evaluation", id: evaluationId },
        error: { code: "EVALUATION_LINK_FAILED", message: errorMsg },
      });
      await prisma.auditLog.create({
        data: {
          action: "EVALUATION_LINK_FAILED" as AuditAction,
          entityType: "Evaluation",
          entityId: evaluationId,
          performedBy: traderId,
          details: {
            accountId: (result as AllocateAccountSuccess).account.id,
            reason: `Evaluation linking failed after allocation committed: ${errorMsg}`,
          },
        },
      });
    }
  }

  if (result.success) {
    return { ...result, evaluationLinked } as AllocateAccountSuccess;
  }

  return result;
}