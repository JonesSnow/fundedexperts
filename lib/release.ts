import { PrismaClient, AccountAssignment, MT5Account, AccountStatus, EvaluationStatus, FundedAccount } from "@prisma/client";
import { createLogger, generateCorrelationId } from "./logger";
import { sendEvaluationPassedEmail, sendEvaluationFailedEmail } from "./email/templates";
import { createFundedAccountInTransaction } from "./funded-account";

const logger = createLogger({ environment: process.env.NODE_ENV as "development" | "production" | "test" });

function makeActor(id: string): { type: "trader"; id: string } {
  return { type: "trader", id };
}

function makeEntity(type: string, id?: string): { type: string; id?: string } {
  return { type, id };
}

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
  fundedAccount: FundedAccount | null;
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
  const correlationId = generateCorrelationId();
  const { traderId, accountId, reason, isAdminOverride } = input;

  let evaluationChallengeName: string | undefined;
  let evaluationTotalPnl: string | undefined;
  let evaluationIdRef: string | undefined;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`release-account:${accountId}`}))`;
    const assignment = await tx.accountAssignment.findFirst({
      where: { accountId, status: "ASSIGNED" },
      include: { trader: true, account: true },
    });

    if (!assignment) return { success: false, error: "No active assignment found for this account" } as ReleaseAccountFailure;
    if (assignment.traderId !== traderId && !isAdminOverride) {
      return { success: false, error: "Not authorized to release another trader's assignment" } as ReleaseAccountFailure;
    }

    const account = assignment.account as MT5Account;
    const evaluation = await tx.evaluation.findFirst({
      where: { accountId, status: { in: ["IN_PROGRESS", "PASSED"] } },
      include: { rulesetVersion: { include: { ruleset: true } } },
    });
    if (reason === "EVALUATION_COMPLETED" && !evaluation) {
      return { success: false, error: "No active evaluation found to complete for this account" } as ReleaseAccountFailure;
    }

    let evaluationUpdated = false;
    let evaluationStatus: EvaluationStatus | undefined;
    let fundedAccount: FundedAccount | null = null;
    if (evaluation) {
      evaluationChallengeName = evaluation.rulesetVersion?.ruleset?.name ?? undefined;
      evaluationTotalPnl = evaluation.totalPnl ? String(evaluation.totalPnl) : undefined;
      evaluationIdRef = evaluation.id;

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
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`funded-evaluation:${evaluation.id}`}))`;
        const funded = await createFundedAccountInTransaction(tx, {
          evaluationId: evaluation.id,
          traderId: evaluation.traderId,
          rulesetVersionId: evaluation.rulesetVersionId,
          performedBy: "system",
        });
        fundedAccount = funded.account;
      } else {
        await tx.evaluation.update({ where: { id: evaluation.id }, data: { accountId: null } });
      }

      evaluationUpdated = true;
      const updatedEval = await tx.evaluation.findUnique({ where: { id: evaluation.id } });
      if (!updatedEval) throw new Error("Evaluation disappeared during account release");
      evaluationStatus = updatedEval.status;
    }

    const newStatus: AccountStatus = reason === "ACCOUNT_DEACTIVATED" ? "INACTIVE" : "AVAILABLE";
    const updatedAccount = await tx.mT5Account.update({
      where: { id: accountId },
      data: { status: newStatus, updatedAt: new Date() },
    });
    const updatedAssignment = await tx.accountAssignment.update({
      where: { id: assignment.id },
      data: { status: "RETURNED", returnedAt: new Date() },
      include: { trader: true },
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
          reason,
          adminOverride: isAdminOverride ?? false,
          evaluationUpdated,
          newStatus,
          fundedAccountId: fundedAccount?.id ?? null,
        },
      },
    });

    return { success: true, assignment: updatedAssignment, account: updatedAccount, evaluationUpdated, evaluationStatus, fundedAccount } as ReleaseAccountSuccess;
  });
  if (result.success && result.evaluationUpdated && result.evaluationStatus) {
    const assignment = result.assignment as AccountAssignment & { trader?: { id: string; email: string; firstName?: string | null } };
    const trader = assignment.trader;
    if (trader) {
      const traderRef = { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined };
      const productName = evaluationChallengeName ?? "Challenge";
      try {
        if (result.evaluationStatus === "PASSED") {
          await sendEvaluationPassedEmail(traderRef, {
            evaluationId: evaluationIdRef ?? "",
            productName,
            totalPnl: evaluationTotalPnl,
          });
        } else if (result.evaluationStatus === "FAILED") {
          await sendEvaluationFailedEmail(traderRef, {
            evaluationId: evaluationIdRef ?? "",
            productName,
            failureReason: reason,
          });
        }
      } catch {
        logger.error("RELEASE", "Evaluation notification email failed", {
          correlationId,
          actor: makeActor(traderId),
          entity: makeEntity("Evaluation"),
          error: { code: "EMAIL_FAILED", message: "Failed to send evaluation notification email" },
        });
      }
    }
  }

  return result;
}
