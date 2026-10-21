import { PrismaClient, AuditAction } from "@prisma/client";

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
        const repair = await prisma.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<Array<{ id: string; credentialsConfigured: boolean }>>`
            SELECT "id", ("credentials" IS NOT NULL AND BTRIM("credentials") <> '') AS "credentialsConfigured"
            FROM "MT5Account" WHERE "id" = ${account.id} FOR UPDATE
          `;
          if (locked.length === 0) return { repaired: false, reason: "Account no longer exists" };
          if (locked[0]?.credentialsConfigured !== true) {
            const reason = "Encrypted MT5 credentials are missing; IN_USE repair skipped";
            await tx.auditLog.create({
              data: {
                action: AuditAction.RECONCILIATION_SKIPPED,
                entityType: "MT5Account",
                entityId: account.id,
                performedBy,
                details: { ...inconsistency.details, reason },
              },
            });
            return { repaired: false, reason };
          }

          const current = await tx.mT5Account.findUnique({
            where: { id: account.id },
            select: { status: true },
          });
          if (!current || current.status !== "AVAILABLE") {
            return { repaired: false, reason: "Account state changed; repair skipped" };
          }

          const activeAssignments = await tx.accountAssignment.findMany({
            where: { accountId: account.id, status: "ASSIGNED" },
            select: { id: true },
          });
          if (activeAssignments.length === 0) {
            return { repaired: false, reason: "Active assignment no longer exists; repair skipped" };
          }

          const updated = await tx.mT5Account.updateMany({
            where: { id: account.id, status: "AVAILABLE" },
            data: { status: "IN_USE", updatedAt: new Date() },
          });
          if (updated.count !== 1) return { repaired: false, reason: "Account state changed; repair skipped" };

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
          return { repaired: true as const };
        });
        if (!repair.repaired && repair.reason === "Encrypted MT5 credentials are missing; IN_USE repair skipped") {
          inconsistency.repairable = false;
          inconsistency.repairHint = "Configure encrypted MT5 credentials before retrying this repair";
        }
        repairs.push(repair.repaired
          ? {
              inconsistencyId: account.id,
              repaired: true,
              action: AuditAction.RECONCILIATION_REPAIRED,
              details: { previousStatus: "AVAILABLE", newStatus: "IN_USE" },
            }
          : {
              inconsistencyId: account.id,
              repaired: false,
              action: AuditAction.RECONCILIATION_SKIPPED,
              details: { ...inconsistency.details, reason: repair.reason },
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
