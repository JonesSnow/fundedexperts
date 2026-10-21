import { Prisma, PrismaClient, AccountAssignment, MT5Account, AccountStatus, EvaluationStatus, FundedAccount } from "@prisma/client";
import { createLogger, generateCorrelationId } from "./logger";
import { sendEvaluationPassedEmail, sendEvaluationFailedEmail } from "./email/templates";
import { createFundedAccountInTransaction } from "./funded-account";
import {
  canonicalAccountSize,
  purchasedStageRulesMatchVersion,
  resolveEvaluationStageProgression,
  resolveEvaluationStageProgressionFromProduct,
  type EvaluationStageProgression,
} from "./evaluation-stage-progression";

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
  stageAdvanced?: boolean;
  nextEvaluationId?: string | null;
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
  let evaluationStageName: string | undefined;
  let evaluationNextStageName: string | undefined;

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
      include: {
        rulesetVersion: { include: { ruleset: true, rules: true } },
        productStage: { select: { id: true, productId: true, stageOrder: true, rulesetVersionId: true } },
        order: { select: { orderItems: { select: { productId: true, productSnapshot: true } } } },
      },
    });
    if (reason === "EVALUATION_COMPLETED" && !evaluation) {
      return { success: false, error: "No active evaluation found to complete for this account" } as ReleaseAccountFailure;
    }

    let evaluationUpdated = false;
    let evaluationStatus: EvaluationStatus | undefined;
    let fundedAccount: FundedAccount | null = null;
    let stageAdvanced = false;
    let nextEvaluationId: string | null = null;
    let updatedAccount: MT5Account | null = null;
    let updatedAssignment: AccountAssignment | null = null;
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
        let stageProgression: EvaluationStageProgression;
        if (evaluation.orderId) {
          stageProgression = resolveEvaluationStageProgression(evaluation.order?.orderItems, evaluation.productStageId);
        } else if (evaluation.productStageId && evaluation.productId) {
          const product = await tx.product.findUnique({
            where: { id: evaluation.productId },
            select: {
              id: true,
              accountSize: true,
              denominationCurrency: true,
              stages: {
                orderBy: { stageOrder: "asc" },
                select: {
                  id: true,
                  stageKey: true,
                  displayName: true,
                  stageOrder: true,
                  rulesetVersionId: true,
                  rulesetVersion: {
                    select: {
                      version: true,
                      rules: { select: { id: true, name: true, ruleType: true, disposition: true, isRequired: true, effectiveDate: true, value: true, calculation: true } },
                    },
                  },
                },
              },
            },
          });
          stageProgression = product
            ? resolveEvaluationStageProgressionFromProduct({
                ...product,
                stages: product.stages.map(({ rulesetVersion, ...stage }) => ({
                  ...stage,
                  rulesetVersion: rulesetVersion.version,
                  rules: rulesetVersion.rules,
                })),
              }, evaluation.productStageId)
            : { kind: "INVALID" as const, reason: "Published product is missing." };
        } else if (evaluation.productStageId) {
          stageProgression = { kind: "INVALID" as const, reason: "Evaluation stage is missing its product identity." };
        } else {
          stageProgression = { kind: "LEGACY_FINAL" as const };
        }
        if (stageProgression.kind === "INVALID") {
          return { success: false, error: "Purchased evaluation stages are inconsistent and require administrator review" } as ReleaseAccountFailure;
        }
        if (stageProgression.kind === "NEXT" || stageProgression.kind === "FINAL") {
          const currentStage = stageProgression.kind === "NEXT" ? stageProgression.currentStage : stageProgression.stage;
          evaluationStageName = currentStage.displayName;
          if (stageProgression.kind === "NEXT") evaluationNextStageName = stageProgression.stage.displayName;
          const expectedSize = canonicalAccountSize(stageProgression.accountSize);
          const currentSize = canonicalAccountSize(account.accountSize);
          const startingBalance = canonicalAccountSize(evaluation.startingBalance);
          if (
            evaluation.productStage?.id !== evaluation.productStageId
            || evaluation.productStage.productId !== stageProgression.productId
            || evaluation.productStage.stageOrder !== currentStage.order
            || evaluation.productStage.rulesetVersionId !== evaluation.rulesetVersionId
            || !purchasedStageRulesMatchVersion(currentStage, evaluation.rulesetVersion)
            || assignment.traderId !== evaluation.traderId
            || expectedSize === null
            || currentSize !== expectedSize
            || startingBalance !== expectedSize
            || account.currency !== stageProgression.denominationCurrency
            || account.purpose !== "EVALUATION"
          ) {
            return { success: false, error: "Current evaluation stage does not match its purchased product" } as ReleaseAccountFailure;
          }
        }

        let nextVersion: Prisma.RulesetVersionGetPayload<{ include: { rules: true } }> | null = null;
        let nextAccount: Array<{ id: string; accountNumber: string }> = [];
        if (stageProgression.kind === "NEXT") {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`trader-activation:${assignment.traderId}`}))`;
          const otherAssignment = await tx.accountAssignment.findFirst({
            where: { traderId: assignment.traderId, status: "ASSIGNED", accountId: { not: accountId } },
            select: { id: true },
          });
          if (otherAssignment) {
            return { success: false, error: "Customer has another active account assignment; administrator review is required" } as ReleaseAccountFailure;
          }

          nextVersion = await tx.rulesetVersion.findUnique({
            where: { id: stageProgression.stage.rulesetVersionId },
            include: { rules: true },
          });
          if (!nextVersion || !purchasedStageRulesMatchVersion(stageProgression.stage, nextVersion)) {
            return { success: false, error: "Next-stage rules do not match the purchased rules snapshot; administrator review is required" } as ReleaseAccountFailure;
          }

          nextAccount = await tx.$queryRaw<Array<{ id: string; accountNumber: string }>>`
            SELECT "id", "accountNumber"
            FROM "MT5Account"
            WHERE "status" = 'AVAILABLE'
              AND "purpose" = 'EVALUATION'::"MT5AccountPurpose"
              AND "accountSize" = ${new Prisma.Decimal(stageProgression.accountSize)}
              AND "currency" = ${stageProgression.denominationCurrency}
              AND "credentials" IS NOT NULL
              AND BTRIM("credentials") <> ''
            ORDER BY "createdAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `;
          if (nextAccount.length === 0) {
            return { success: false, error: "No available evaluation account matches the next purchased stage" } as ReleaseAccountFailure;
          }
        }

        await tx.evaluation.update({
          where: { id: evaluation.id },
          data: { status: "PASSED", completedAt: new Date() },
        });
        if (stageProgression.kind === "NEXT") {
          updatedAccount = await tx.mT5Account.update({
            where: { id: accountId },
            data: { status: "AVAILABLE", updatedAt: new Date() },
          });
          updatedAssignment = await tx.accountAssignment.update({
            where: { id: assignment.id },
            data: { status: "RETURNED", returnedAt: new Date() },
            include: { trader: true },
          });

          const reserved = await tx.mT5Account.updateMany({
            where: { id: nextAccount[0].id, status: "AVAILABLE", credentials: { not: "" } },
            data: { status: "IN_USE", updatedAt: new Date() },
          });
          if (reserved.count !== 1) throw new Error("Next-stage evaluation account is no longer available");

          const nextEvaluation = await tx.evaluation.create({
            data: {
              traderId: evaluation.traderId,
              productId: stageProgression.productId,
              productStageId: stageProgression.stage.id,
              rulesetVersionId: stageProgression.stage.rulesetVersionId,
              accountId: nextAccount[0].id,
              status: "IN_PROGRESS",
              startedAt: new Date(),
              startingBalance: new Prisma.Decimal(stageProgression.accountSize),
            },
          });
          const nextAssignment = await tx.accountAssignment.create({
            data: { traderId: evaluation.traderId, accountId: nextAccount[0].id, status: "ASSIGNED" },
          });
          await tx.ruleEvaluation.createMany({
            data: nextVersion!.rules.map((rule) => ({
              evaluationId: nextEvaluation.id,
              ruleId: rule.id,
              result: "WARNING",
              state: "PENDING",
              actualValue: Prisma.JsonNull,
              expectedValue: Prisma.JsonNull,
              details: "PENDING: awaiting the first complete, fresh monitoring snapshot",
            })),
          });
          await tx.auditLog.create({
            data: {
              action: "EVALUATION_STARTED",
              entityType: "Evaluation",
              entityId: nextEvaluation.id,
              performedBy: "system",
              details: {
                priorEvaluationId: evaluation.id,
                orderId: evaluation.orderId,
                productId: stageProgression.productId,
                productStageId: stageProgression.stage.id,
                rulesetVersionId: stageProgression.stage.rulesetVersionId,
                accountId: nextAccount[0].id,
                assignmentId: nextAssignment.id,
              },
            },
          });
          await tx.auditLog.create({
            data: {
              action: "ACCOUNT_ASSIGNED",
              entityType: "MT5Account",
              entityId: nextAccount[0].id,
              performedBy: "system",
              details: { evaluationId: nextEvaluation.id, priorEvaluationId: evaluation.id, assignmentId: nextAssignment.id },
            },
          });
          nextEvaluationId = nextEvaluation.id;
          stageAdvanced = true;
        } else {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`funded-evaluation:${evaluation.id}`}))`;
          const funded = await createFundedAccountInTransaction(tx, {
            evaluationId: evaluation.id,
            traderId: evaluation.traderId,
            rulesetVersionId: evaluation.rulesetVersionId,
            performedBy: "system",
          });
          fundedAccount = funded.account;
        }
      } else {
        await tx.evaluation.update({ where: { id: evaluation.id }, data: { accountId: null } });
      }

      evaluationUpdated = true;
      const updatedEval = await tx.evaluation.findUnique({ where: { id: evaluation.id } });
      if (!updatedEval) throw new Error("Evaluation disappeared during account release");
      evaluationStatus = updatedEval.status;
    }

    const newStatus: AccountStatus = reason === "ACCOUNT_DEACTIVATED" ? "INACTIVE" : "AVAILABLE";
    updatedAccount ??= await tx.mT5Account.update({
      where: { id: accountId },
      data: { status: newStatus, updatedAt: new Date() },
    });
    updatedAssignment ??= await tx.accountAssignment.update({
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

    return { success: true, assignment: updatedAssignment, account: updatedAccount, evaluationUpdated, evaluationStatus, fundedAccount, stageAdvanced, nextEvaluationId } as ReleaseAccountSuccess;
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
            stageName: evaluationStageName,
            nextStageName: evaluationNextStageName,
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
