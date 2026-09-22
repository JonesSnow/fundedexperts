import { PrismaClient, AccountAssignment, AccountAssignmentStatus, MT5Account, AccountStatus, Evaluation, EvaluationStatus, AuditAction } from "@prisma/client";

export type ReleaseReason =
  | "EVALUATION_FAILED"
  | "EVALUATION_COMPLETED"
  | "EVALUATION_EXPIRED"
  | "ADMINISTRATIVE_CORRECTION"
  | "ACCOUNT_DEACTIVATED"
  | "OTHER";

export interface ReleaseAccountInput {
  traderId: string;
  accountId: string;
  reason: ReleaseReason;
  isAdminOverride?: boolean;
}

export interface ReleaseAccountSuccess {
  success: true;
  assignment: AccountAssignment;
  account: MT5Account;
  evaluationUpdated: boolean;
  evaluationStatus?: EvaluationStatus;
}

export interface ReleaseAccountFailure {
  success: false;
  error: string;
}

export type ReleaseAccountResult = ReleaseAccountSuccess | ReleaseAccountFailure;

export async function releaseAccount(
  prisma: PrismaClient,
  input: ReleaseAccountInput
): Promise<ReleaseAccountResult> {
  const { traderId, accountId, reason, isAdminOverride } = input;

  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.accountAssignment.findFirst({
      where: {
        accountId: accountId,
        status: "ASSIGNED",
      },
      include: {
        trader: true,
        account: true,
      },
    });

    if (!assignment) {
      return { success: false, error: "No active assignment found for this account" } as ReleaseAccountFailure;
    }

    if (assignment.traderId !== traderId && !isAdminOverride) {
      return { success: false, error: "Not authorized to release another trader's assignment" } as ReleaseAccountFailure;
    }

    const account = assignment.account as MT5Account;

    let evaluationUpdated = false;
    let evaluationStatus: EvaluationStatus | undefined;

    try {
      const evaluation = await tx.evaluation.findFirst({
        where: {
          accountId: accountId,
          status: { in: ["IN_PROGRESS", "PASSED"] },
        },
      });

      if (evaluation) {
        if (reason === "EVALUATION_FAILED") {
          await tx.evaluation.update({
            where: { id: evaluation.id },
            data: { status: "FAILED", completedAt: new Date(), accountId: null },
          });
        } else if (reason === "EVALUATION_COMPLETED") {
          await tx.evaluation.update({
            where: { id: evaluation.id },
            data: { status: "PASSED", completedAt: new Date() },
          });
        } else {
          await tx.evaluation.update({
            where: { id: evaluation.id },
            data: { accountId: null },
          });
        }
        evaluationUpdated = true;
        const updatedEval = await tx.evaluation.findUnique({
          where: { id: evaluation.id },
        });
        evaluationStatus = updatedEval?.status;
      }
    } catch {
      evaluationUpdated = false;
    }

    let newStatus: AccountStatus;
    if (reason === "ACCOUNT_DEACTIVATED") {
      newStatus = "INACTIVE";
    } else if (reason === "EVALUATION_COMPLETED") {
      newStatus = "AVAILABLE";
    } else {
      newStatus = "AVAILABLE";
    }

    const updatedAccount = await tx.mT5Account.update({
      where: { id: accountId },
      data: { status: newStatus, updatedAt: new Date() },
    });

    const updatedAssignment = await tx.accountAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "RETURNED",
        returnedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        action: "ACCOUNT_RETURNED",
        entityType: "MT5Account",
        entityId: accountId,
        performedBy: traderId,
        details: {
          accountNumber: account.accountNumber,
          assignmentId: assignment.id,
          reason: reason,
          adminOverride: isAdminOverride ?? false,
          evaluationUpdated,
          newStatus: newStatus,
        },
      },
    });

    return {
      success: true,
      assignment: updatedAssignment,
      account: updatedAccount,
      evaluationUpdated,
      evaluationStatus,
    } as ReleaseAccountSuccess;
  });

  return result;
}
