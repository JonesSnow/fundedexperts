import { PrismaClient, Evaluation, MT5Account, AccountAssignment, AuditAction } from "@prisma/client";

export interface LinkEvaluationInput {
  evaluationId: string;
  accountId: string;
  performedBy: string;
}

export interface LinkEvaluationSuccess {
  success: true;
  evaluation: Evaluation;
  linkedAccountId: string;
}

export interface LinkEvaluationFailure {
  success: false;
  error: string;
  failureCategory: string;
}

export type LinkEvaluationResult = LinkEvaluationSuccess | LinkEvaluationFailure;

async function recordLinkFailure(
  prisma: PrismaClient,
  evaluationId: string,
  performedBy: string,
  error: string,
  category: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: AuditAction.EVALUATION_LINK_FAILED,
        entityType: "Evaluation",
        entityId: evaluationId,
        performedBy: performedBy,
        details: { error, failureCategory: category, ...details },
      },
    });
  } catch {
    // Audit logging failure should not affect the result
  }
}

export async function linkEvaluation(
  prisma: PrismaClient,
  input: LinkEvaluationInput
): Promise<LinkEvaluationResult> {
  const { evaluationId, accountId, performedBy } = input;

  try {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { account: true },
    });

    if (!evaluation) {
      await recordLinkFailure(prisma, evaluationId, performedBy, "Evaluation not found", "NOT_FOUND");
      return { success: false, error: "Evaluation not found", failureCategory: "NOT_FOUND" } as LinkEvaluationFailure;
    }

    if (evaluation.status !== "IN_PROGRESS") {
      await recordLinkFailure(prisma, evaluationId, performedBy, `Evaluation is not in progress (status=${evaluation.status})`, "INVALID_STATE");
      return { success: false, error: `Evaluation is not in progress (status=${evaluation.status})`, failureCategory: "INVALID_STATE" } as LinkEvaluationFailure;
    }

    if (evaluation.accountId) {
      await recordLinkFailure(prisma, evaluationId, performedBy, "Evaluation is already linked to an account", "ALREADY_LINKED", { existingAccountId: evaluation.accountId });
      return { success: false, error: "Evaluation is already linked to an account", failureCategory: "ALREADY_LINKED" } as LinkEvaluationFailure;
    }

    const account = await prisma.mT5Account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      await recordLinkFailure(prisma, evaluationId, performedBy, "Account not found", "NOT_FOUND");
      return { success: false, error: "Account not found", failureCategory: "NOT_FOUND" } as LinkEvaluationFailure;
    }

    if (account.status !== "IN_USE") {
      await recordLinkFailure(prisma, evaluationId, performedBy, `Account is not IN_USE (status=${account.status})`, "INVALID_ACCOUNT_STATE", { accountStatus: account.status });
      return { success: false, error: `Account is not IN_USE (status=${account.status})`, failureCategory: "INVALID_ACCOUNT_STATE" } as LinkEvaluationFailure;
    }

    const assignment = await prisma.accountAssignment.findFirst({
      where: {
        accountId: accountId,
        status: "ASSIGNED",
      },
    });

    if (!assignment) {
      await recordLinkFailure(prisma, evaluationId, performedBy, "No active assignment found for this account", "NO_ASSIGNMENT");
      return { success: false, error: "No active assignment found for this account", failureCategory: "NO_ASSIGNMENT" } as LinkEvaluationFailure;
    }

    if (assignment.traderId !== evaluation.traderId) {
      await recordLinkFailure(prisma, evaluationId, performedBy, "Account assignment does not belong to the evaluation's trader", "OWNERSHIP_MISMATCH", {
        assignmentTraderId: assignment.traderId,
        evaluationTraderId: evaluation.traderId,
      });
      return { success: false, error: "Account assignment does not belong to the evaluation's trader", failureCategory: "OWNERSHIP_MISMATCH" } as LinkEvaluationFailure;
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.evaluation.update({
        where: { id: evaluationId },
        data: {
          accountId: accountId,
          completedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.EVALUATION_LINKED,
          entityType: "Evaluation",
          entityId: evaluationId,
          performedBy: performedBy,
          details: {
            accountId: accountId,
            accountNumber: account.accountNumber,
            assignmentId: assignment.id,
          },
        },
      });

      return await tx.evaluation.findUnique({ where: { id: evaluationId } });
    });

    return { success: true, evaluation: result, linkedAccountId: accountId } as LinkEvaluationSuccess;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    await recordLinkFailure(prisma, evaluationId, performedBy, errorMsg, "TRANSACTION_ERROR");
    return { success: false, error: `Evaluation linking failed: ${errorMsg}`, failureCategory: "TRANSACTION_ERROR" } as LinkEvaluationFailure;
  }
}
