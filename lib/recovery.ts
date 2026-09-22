import { PrismaClient, Evaluation, AccountAssignment, MT5Account, AuditAction } from "@prisma/client";
import { linkEvaluation, LinkEvaluationResult } from "./evaluation-link";

export interface RecoverLinkInput {
  evaluationId: string;
  performedBy: string;
}

export interface RecoverLinkSuccess {
  success: true;
  result: LinkEvaluationResult;
  wasAlreadyLinked: boolean;
}

export interface RecoverLinkFailure {
  success: false;
  error: string;
  stillRecoverable: boolean;
}

export type RecoverLinkResult = RecoverLinkSuccess | RecoverLinkFailure;

export async function recoverEvaluationLink(
  prisma: PrismaClient,
  input: RecoverLinkInput
): Promise<RecoverLinkResult> {
  const { evaluationId, performedBy } = input;

  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: { account: true },
  });

  if (!evaluation) {
    return { success: false, error: "Evaluation not found", stillRecoverable: false } as RecoverLinkFailure;
  }

  const assignment = await prisma.accountAssignment.findFirst({
    where: {
      traderId: evaluation.traderId,
      status: "ASSIGNED",
    },
    orderBy: { assignedAt: "desc" },
  });

  if (!assignment) {
    await prisma.auditLog.create({
      data: {
        action: AuditAction.RECOVERY_FAILED,
        entityType: "Evaluation",
        entityId: evaluationId,
        performedBy: performedBy,
        details: {
          error: "No active assignment found for evaluation trader",
          evaluationId: evaluationId,
          stillRecoverable: false,
        },
      },
    });
    return { success: false, error: "No active assignment found for evaluation trader", stillRecoverable: false } as RecoverLinkFailure;
  }

  if (evaluation.accountId) {
    const linkedAccount = await prisma.mT5Account.findUnique({
      where: { id: evaluation.accountId },
    });
    if (linkedAccount && linkedAccount.status === "IN_USE") {
      await prisma.auditLog.create({
        data: {
          action: AuditAction.RECOVERY_SUCCEEDED,
          entityType: "Evaluation",
          entityId: evaluationId,
          performedBy: performedBy,
          details: {
            alreadyLinked: true,
            accountId: evaluation.accountId,
            accountNumber: linkedAccount.accountNumber,
          },
        },
      });
      return { success: true, result: { success: true, evaluation, linkedAccountId: evaluation.accountId }, wasAlreadyLinked: true } as RecoverLinkSuccess;
    }
  }

  const linkResult = await linkEvaluation(prisma, {
    evaluationId: evaluationId,
    accountId: assignment.accountId,
    performedBy: performedBy,
  });

  if (linkResult.success) {
    await prisma.auditLog.create({
      data: {
        action: AuditAction.RECOVERY_SUCCEEDED,
        entityType: "Evaluation",
        entityId: evaluationId,
        performedBy: performedBy,
        details: {
          alreadyLinked: false,
          accountId: linkResult.linkedAccountId,
          assignmentId: assignment.id,
        },
      },
    });
    return { success: true, result: linkResult, wasAlreadyLinked: false } as RecoverLinkSuccess;
  }

  const canRetry = linkResult.error.includes("not linked") || linkResult.error.includes("not IN_USE") || linkResult.error.includes("not found");

  await prisma.auditLog.create({
    data: {
      action: AuditAction.RECOVERY_FAILED,
      entityType: "Evaluation",
      entityId: evaluationId,
      performedBy: performedBy,
      details: {
        error: linkResult.error,
        assignmentId: assignment.id,
        stillRecoverable: canRetry,
      },
    },
  });

  return { success: false, error: linkResult.error, stillRecoverable: canRetry } as RecoverLinkFailure;
}
