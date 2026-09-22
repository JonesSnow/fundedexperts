import { PrismaClient, MT5Account, AccountAssignment, Evaluation, AuditAction } from "@prisma/client";

export interface Inconsistency {
  type: "IN_USE_WITHOUT_ASSIGNMENT" | "AVAILABLE_WITH_ASSIGNMENT" | "EVAL_LINKED_TO_WRONG_ACCOUNT" | "EVAL_LINKED_TO_UNOWNED_ACCOUNT" | "MULTIPLE_ACTIVE_ASSIGNMENTS";
  entityId: string;
  entityType: string;
  details: Record<string, unknown>;
  repairable: boolean;
  repairHint: string;
}

export interface RepairResult {
  inconsistencyId: string;
  repaired: boolean;
  action: AuditAction;
  details: Record<string, unknown>;
  error?: string;
}

export interface ReconcileResult {
  inconsistencies: Inconsistency[];
  repairs: RepairResult[];
  unrepairableCount: number;
}

export async function reconcile(prisma: PrismaClient, performedBy: string): Promise<ReconcileResult> {
  const inconsistencies: Inconsistency[] = [];
  const repairs: RepairResult[] = [];

  const allAccounts = await prisma.mT5Account.findMany({
    include: { assignments: { where: { status: "ASSIGNED" } } },
  });

  for (const account of allAccounts) {
    const activeAssignments = account.assignments.filter(a => a.status === "ASSIGNED");

    if (account.status === "IN_USE" && activeAssignments.length === 0) {
      const inconsistency: Inconsistency = {
        type: "IN_USE_WITHOUT_ASSIGNMENT",
        entityId: account.id,
        entityType: "MT5Account",
        details: { accountNumber: account.accountNumber, status: account.status },
        repairable: false,
        repairHint: "Cannot safely determine which assignment to create",
      };
      inconsistencies.push(inconsistency);
      await prisma.auditLog.create({
        data: {
          action: AuditAction.RECONCILIATION_SKIPPED,
          entityType: "MT5Account",
          entityId: account.id,
          performedBy: performedBy,
          details: { ...inconsistency.details, reason: inconsistency.repairHint },
        },
      });
      continue;
    }

    if (account.status === "AVAILABLE" && activeAssignments.length > 0) {
      const inconsistency: Inconsistency = {
        type: "AVAILABLE_WITH_ASSIGNMENT",
        entityId: account.id,
        entityType: "MT5Account",
        details: {
          accountNumber: account.accountNumber,
          status: account.status,
          assignmentCount: activeAssignments.length,
          assignmentIds: activeAssignments.map(a => a.id),
        },
        repairable: true,
        repairHint: "Update account status to IN_USE",
      };
      inconsistencies.push(inconsistency);

      try {
        await prisma.$transaction(async (tx) => {
          await tx.mT5Account.update({
            where: { id: account.id },
            data: { status: "IN_USE", updatedAt: new Date() },
          });
          await tx.auditLog.create({
            data: {
              action: AuditAction.RECONCILIATION_REPAIRED,
              entityType: "MT5Account",
              entityId: account.id,
              performedBy: performedBy,
              details: {
                ...inconsistency.details,
                previousStatus: "AVAILABLE",
                newStatus: "IN_USE",
              },
            },
          });
        });
        repairs.push({
          inconsistencyId: account.id,
          repaired: true,
          action: AuditAction.RECONCILIATION_REPAIRED,
          details: { previousStatus: "AVAILABLE", newStatus: "IN_USE" },
        });
      } catch (e) {
        repairs.push({
          inconsistencyId: account.id,
          repaired: false,
          action: AuditAction.RECONCILIATION_SKIPPED,
          details: inconsistency.details,
          error: String(e),
        });
      }
      continue;
    }

    if (activeAssignments.length > 1) {
      const inconsistency: Inconsistency = {
        type: "MULTIPLE_ACTIVE_ASSIGNMENTS",
        entityId: account.id,
        entityType: "MT5Account",
        details: {
          accountNumber: account.accountNumber,
          assignmentCount: activeAssignments.length,
          assignmentIds: activeAssignments.map(a => a.id),
        },
        repairable: false,
        repairHint: "Manual intervention required; do not delete records",
      };
      inconsistencies.push(inconsistency);
      await prisma.auditLog.create({
        data: {
          action: AuditAction.RECONCILIATION_REJECTED,
          entityType: "MT5Account",
          entityId: account.id,
          performedBy: performedBy,
          details: { ...inconsistency.details, reason: inconsistency.repairHint },
        },
      });
      continue;
    }
  }

  const allEvaluations = await prisma.evaluation.findMany({
    include: { account: true },
  });

  for (const evaluation of allEvaluations) {
    if (!evaluation.accountId) continue;

    const linkedAccount = await prisma.mT5Account.findUnique({
      where: { id: evaluation.accountId },
    });

    if (!linkedAccount) {
      const inconsistency: Inconsistency = {
        type: "EVAL_LINKED_TO_WRONG_ACCOUNT",
        entityId: evaluation.id,
        entityType: "Evaluation",
        details: {
          evaluationId: evaluation.id,
          linkedAccountId: evaluation.accountId,
          linkedAccountExists: false,
        },
        repairable: true,
        repairHint: "Nullify evaluation.accountId and create repair audit",
      };
      inconsistencies.push(inconsistency);

      try {
        await prisma.$transaction(async (tx) => {
          await tx.evaluation.update({
            where: { id: evaluation.id },
            data: { accountId: null },
          });
          await tx.auditLog.create({
            data: {
              action: AuditAction.RECONCILIATION_REPAIRED,
              entityType: "Evaluation",
              entityId: evaluation.id,
              performedBy: performedBy,
              details: {
                evaluationId: evaluation.id,
                action: "nullified accountId",
                previousAccountId: evaluation.accountId,
                reason: "Linked account no longer exists",
              },
            },
          });
        });
        repairs.push({
          inconsistencyId: evaluation.id,
          repaired: true,
          action: AuditAction.RECONCILIATION_REPAIRED,
          details: { previousAccountId: evaluation.accountId, action: "nullified" },
        });
      } catch (e) {
        repairs.push({
          inconsistencyId: evaluation.id,
          repaired: false,
          action: AuditAction.RECONCILIATION_SKIPPED,
          details: inconsistency.details,
          error: String(e),
        });
      }
      continue;
    }

    const assignment = await prisma.accountAssignment.findFirst({
      where: {
        accountId: evaluation.accountId,
        status: "ASSIGNED",
      },
    });

    if (!assignment || assignment.traderId !== evaluation.traderId) {
      const inconsistency: Inconsistency = {
        type: "EVAL_LINKED_TO_UNOWNED_ACCOUNT",
        entityId: evaluation.id,
        entityType: "Evaluation",
        details: {
          evaluationId: evaluation.id,
          traderId: evaluation.traderId,
          linkedAccountId: evaluation.accountId,
          linkedAccountStatus: linkedAccount.status,
          assignmentExists: !!assignment,
          assignmentTraderId: assignment?.traderId ?? null,
        },
        repairable: true,
        repairHint: "Nullify evaluation.accountId; allocation will reassign correct account",
      };
      inconsistencies.push(inconsistency);

      try {
        await prisma.$transaction(async (tx) => {
          await tx.evaluation.update({
            where: { id: evaluation.id },
            data: { accountId: null },
          });
          await tx.auditLog.create({
            data: {
              action: AuditAction.RECONCILIATION_REPAIRED,
              entityType: "Evaluation",
              entityId: evaluation.id,
              performedBy: performedBy,
              details: {
                evaluationId: evaluation.id,
                action: "nullified accountId",
                reason: "Evaluation linked to account not owned by evaluation trader",
                previousAccountId: evaluation.accountId,
              },
            },
          });
        });
        repairs.push({
          inconsistencyId: evaluation.id,
          repaired: true,
          action: AuditAction.RECONCILIATION_REPAIRED,
          details: { previousAccountId: evaluation.accountId, reason: "unowned" },
        });
      } catch (e) {
        repairs.push({
          inconsistencyId: evaluation.id,
          repaired: false,
          action: AuditAction.RECONCILIATION_SKIPPED,
          details: inconsistency.details,
          error: String(e),
        });
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      action: AuditAction.RECONCILIATION_STARTED,
      entityType: "System",
      entityId: "reconciliation",
      performedBy: performedBy,
      details: {
        totalInconsistencies: inconsistencies.length,
        repairable: inconsistencies.filter(i => i.repairable).length,
        unrepairable: inconsistencies.filter(i => !i.repairable).length,
        repairsAttempted: repairs.length,
        repairsSucceeded: repairs.filter(r => r.repaired).length,
      },
    },
  });

  return {
    inconsistencies,
    repairs,
    unrepairableCount: inconsistencies.filter(i => !i.repairable).length,
  };
}
