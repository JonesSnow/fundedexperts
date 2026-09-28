import { Prisma, type PrismaClient, type Rule, type RuleResult, type RuleType, type AuditAction } from "@prisma/client";
import type { MonitoringSnapshot } from "./monitoring/types";
import { createLogger, generateCorrelationId } from "./logger";
import { evaluateAllRules, getOverallResult, type RuleEvaluationOutcome } from "./rule-engine";
import { releaseAccount } from "./release";
import { createFundedAccount } from "./funded-account";
import { sendRuleBreachEmail } from "./email/templates";
import type { TraderRef } from "./email/templates";
import { computeLeaseExpiry } from "./monitoring/repository";

const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

export interface ProcessSnapshotInput {
  accountId: string;
  snapshot: MonitoringSnapshot;
  performedBy?: string;
  sendEmails?: boolean;
}

export interface ProcessSnapshotSuccess {
  success: true;
  evaluationId?: string;
  outcomes: RuleEvaluationOutcome[];
  overallResult: "PASS" | "FAIL" | "WARNING";
  ruleEventsCreated: number;
  evaluationStatus?: string;
  passed?: boolean;
  failed?: boolean;
}

export interface ProcessSnapshotFailure {
  success: false;
  error: string;
  errorCategory: string;
}

export type ProcessSnapshotResult = ProcessSnapshotSuccess | ProcessSnapshotFailure;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeTotalPnl(snapshot: MonitoringSnapshot): number {
  const realizedPnl = snapshot.historySummary?.totalRealizedPnl ?? 0;
  const unrealizedPnl = (snapshot.positions ?? []).reduce((sum, p) => sum + (p.profit ?? 0), 0);
  return round2(realizedPnl + unrealizedPnl);
}

function computeCurrentDrawdown(snapshot: MonitoringSnapshot, startingBalance?: number | null): number {
  const balance = snapshot.balance ?? 0;
  const equity = snapshot.equity ?? 0;

  let peakEquity = Math.max(balance, equity);
  if (startingBalance !== undefined && startingBalance !== null) {
    peakEquity = Math.max(peakEquity, startingBalance);
  }

  return round2(Math.max(0, peakEquity - equity));
}

function getRuleSeverity(ruleType: RuleType): "HIGH" | "MEDIUM" | "LOW" {
  const highSeverityRules: RuleType[] = ["PROFIT_TARGET", "DRAWDOWN_LIMIT", "MAX_DAILY_LOSS", "MAX_OPEN_TRADES"];
  if (highSeverityRules.includes(ruleType)) return "HIGH";
  return "MEDIUM";
}

function isRequiredRule(rules: Rule[], ruleId: string): boolean {
  const rule = rules.find((r) => r.id === ruleId);
  return rule?.isRequired ?? true;
}

function getEventType(ruleType: RuleType): string {
  const eventMap: Partial<Record<RuleType, string>> = {
    PROFIT_TARGET: "PROFIT_TARGET_CHECK",
    DRAWDOWN_LIMIT: "DRAWDOWN_LIMIT_BREACH",
    TRADING_HOURS: "TRADING_HOURS_VIOLATION",
    MIN_TRADES: "MIN_TRADES_CHECK",
    MAX_DAILY_LOSS: "MAX_DAILY_LOSS_BREACH",
    MAX_OPEN_TRADES: "MAX_OPEN_TRADES_VIOLATION",
    MAX_LEVERAGE: "MAX_LEVERAGE_VIOLATION",
    TRADING_SESSION: "TRADING_SESSION_VIOLATION",
  };
  return eventMap[ruleType] ?? `RULE_${ruleType}_CHECK`;
}

export async function processMonitoringSnapshot(
  prisma: PrismaClient,
  input: ProcessSnapshotInput,
): Promise<ProcessSnapshotResult> {
  const correlationId = generateCorrelationId();
  const { accountId, snapshot, performedBy = "system", sendEmails = true } = input;

  const account = await prisma.mT5Account.findUnique({
    where: { id: accountId },
    include: {
      evaluations: {
        where: { status: "IN_PROGRESS" },
        include: {
          trader: { select: { id: true, email: true, firstName: true } },
          rulesetVersion: { include: { rules: true } },
        },
      },
    },
  });

  if (!account) {
    logger.error("MONITORING_PIPELINE", "Account not found", {
      correlationId,
      entity: { type: "MT5Account", id: accountId },
      error: { code: "ACCOUNT_NOT_FOUND", message: `Account ${accountId} not found` },
    });
    return {
      success: false,
      error: "Account not found",
      errorCategory: "ACCOUNT_NOT_FOUND",
    };
  }

  if (account.evaluations.length === 0) {
    logger.info("MONITORING_PIPELINE", "No in-progress evaluation for account, skipping rule evaluation", {
      correlationId,
      entity: { type: "MT5Account", id: accountId },
    });
    return {
      success: true,
      evaluationId: undefined,
      outcomes: [],
      overallResult: "PASS",
      ruleEventsCreated: 0,
    };
  }

  const evaluation = account.evaluations[0];
  const rules = evaluation.rulesetVersion?.rules ?? [];

  if (rules.length === 0) {
    logger.info("MONITORING_PIPELINE", "No rules to evaluate", {
      correlationId,
      entity: { type: "Evaluation", id: evaluation.id },
    });
    return {
      success: true,
      evaluationId: evaluation.id,
      outcomes: [],
      overallResult: "PASS",
      ruleEventsCreated: 0,
    };
  }

  const outcomes = evaluateAllRules(rules, snapshot, {
    startingBalance: evaluation.startingBalance ? Number(evaluation.startingBalance) : undefined,
  });
  const overallResult = getOverallResult(outcomes);

  const hasRequiredFailure = outcomes.some(
    (o) => o.result === "FAIL" && isRequiredRule(rules, o.ruleId),
  );

  logger.info("MONITORING_PIPELINE", "Rules evaluated", {
    correlationId,
    actor: { type: "system" as const, id: performedBy },
    entity: { type: "Evaluation", id: evaluation.id },
    metadata: {
      accountId,
      rulesCount: rules.length,
      overallResult,
      hasRequiredFailure,
    },
  });

  const ruleEventsCreated = await prisma.$transaction(async (tx) => {
    for (const outcome of outcomes) {
      await tx.ruleEvaluation.upsert({
        where: {
          evaluationId_ruleId: {
            evaluationId: evaluation.id,
            ruleId: outcome.ruleId,
          },
        },
        update: {
          result: outcome.result as RuleResult,
          actualValue: outcome.actualValue === null ? Prisma.JsonNull : (outcome.actualValue as Prisma.InputJsonValue),
          expectedValue: outcome.expectedValue === null ? Prisma.JsonNull : (outcome.expectedValue as Prisma.InputJsonValue),
          details: outcome.details,
          evaluatedAt: new Date(),
        },
        create: {
          evaluationId: evaluation.id,
          ruleId: outcome.ruleId,
          result: outcome.result as RuleResult,
          actualValue: outcome.actualValue === null ? Prisma.JsonNull : (outcome.actualValue as Prisma.InputJsonValue),
          expectedValue: outcome.expectedValue === null ? Prisma.JsonNull : (outcome.expectedValue as Prisma.InputJsonValue),
          details: outcome.details,
          evaluatedAt: new Date(),
        },
      });

      if (outcome.result === "FAIL") {
        const existingEvent = await tx.ruleEvent.findFirst({
          where: {
            accountId: evaluation.accountId!,
            eventType: getEventType(outcome.ruleType),
            acknowledged: false,
          },
        });

        if (!existingEvent) {
          await tx.ruleEvent.create({
            data: {
              accountId: evaluation.accountId!,
              eventType: getEventType(outcome.ruleType),
              severity: getRuleSeverity(outcome.ruleType),
              message: outcome.details,
            },
          });

          await tx.auditLog.create({
            data: {
              action: "SYSTEM_EVENT" as AuditAction,
              entityType: "RuleEvent",
              entityId: evaluation.id,
              performedBy,
              details: {
                eventType: getEventType(outcome.ruleType),
                ruleType: outcome.ruleType,
                ruleId: outcome.ruleId,
                severity: getRuleSeverity(outcome.ruleType),
                message: outcome.details,
                actualValue: outcome.actualValue as Prisma.InputJsonValue,
                expectedValue: outcome.expectedValue as Prisma.InputJsonValue,
              } as Prisma.InputJsonObject,
            },
          });
        }
      }
    }

    const totalPnl = computeTotalPnl(snapshot);
    const startingBalanceNum = evaluation.startingBalance ? Number(evaluation.startingBalance) : undefined;
    const currentDrawdown = computeCurrentDrawdown(snapshot, startingBalanceNum);
    const maxDrawdown = evaluation.maxDrawdown
      ? round2(Math.max(Number(evaluation.maxDrawdown), currentDrawdown))
      : currentDrawdown;

    await tx.evaluation.update({
      where: { id: evaluation.id },
      data: {
        totalPnl: totalPnl,
        maxDrawdown: maxDrawdown,
      },
    });

    return outcomes.filter((o) => o.result === "FAIL").length;
  });

  await txUpdateMonitoringState(prisma, account, snapshot, overallResult, correlationId);

  let evaluationStatus: string | undefined;
  let passed = false;
  let failed = false;

  if (hasRequiredFailure) {
    const breachRules = outcomes.filter((o) => o.result === "FAIL");
    const primaryViolation = breachRules[0];

    const releaseResult = await releaseAccount(prisma, {
      traderId: evaluation.traderId,
      accountId: evaluation.accountId!,
      reason: "EVALUATION_FAILED",
    });

    if (releaseResult.success) {
      evaluationStatus = releaseResult.evaluationStatus ?? "FAILED";
      failed = true;
      logger.info("MONITORING_PIPELINE", "Evaluation failed via releaseAccount", {
        correlationId,
        entity: { type: "Evaluation", id: evaluation.id },
        metadata: { accountNumber: account.accountNumber },
      });

      await prisma.auditLog.create({
        data: {
          action: "SYSTEM_EVENT" as AuditAction,
          entityType: "Evaluation",
          entityId: evaluation.id,
          performedBy,
          details: {
            event: "EVALUATION_FAILED",
            accountId: evaluation.accountId,
            accountNumber: account.accountNumber,
            breachRules: breachRules.map((o) => ({
              ruleType: o.ruleType,
              details: o.details,
              actualValue: o.actualValue as Prisma.InputJsonValue,
              expectedValue: o.expectedValue as Prisma.InputJsonValue,
            })),
          } as Prisma.InputJsonObject,
        },
      });

      if (sendEmails && evaluation.trader) {
        try {
          await sendRuleBreachEmail(
            account.accountNumber,
            {
              id: evaluation.trader.id,
              email: evaluation.trader.email,
              firstName: evaluation.trader.firstName ?? undefined,
            } as TraderRef,
            {
              violationType: primaryViolation.ruleType,
              detectedAt: new Date().toISOString(),
              currentStatus: "FAILED",
            },
          );
        } catch {
          logger.error("MONITORING_PIPELINE", "Rule breach email failed", {
            correlationId,
            entity: { type: "Evaluation", id: evaluation.id },
            error: { code: "EMAIL_FAILED", message: "Failed to send rule breach email" },
          });
        }
      }
    } else {
      logger.error("MONITORING_PIPELINE", "Failed to release account after evaluation failure", {
        correlationId,
        entity: { type: "Evaluation", id: evaluation.id },
        error: { code: "RELEASE_FAILED", message: releaseResult.error },
      });
      failed = true;
      evaluationStatus = "FAILED";
      await prisma.evaluation.update({
        where: { id: evaluation.id },
        data: { status: "FAILED", completedAt: new Date() },
      });
      await prisma.auditLog.create({
        data: {
          action: "SYSTEM_EVENT" as AuditAction,
          entityType: "Evaluation",
          entityId: evaluation.id,
          performedBy,
          details: {
            event: "EVALUATION_FAILED",
            accountId: evaluation.accountId,
            accountNumber: account.accountNumber,
            breachRules: breachRules.map((o) => ({
              ruleType: o.ruleType,
              details: o.details,
              actualValue: o.actualValue as Prisma.InputJsonValue,
              expectedValue: o.expectedValue as Prisma.InputJsonValue,
            })),
            reason: "RELEASE_FAILED",
          } as Prisma.InputJsonObject,
        },
      });
      if (sendEmails && evaluation.trader) {
        try {
          await sendRuleBreachEmail(
            account.accountNumber,
            {
              id: evaluation.traderId,
              email: evaluation.trader.email,
              firstName: evaluation.trader.firstName ?? undefined,
            } as TraderRef,
            {
              violationType: primaryViolation.ruleType,
              detectedAt: new Date().toISOString(),
              currentStatus: "FAILED",
            },
          );
        } catch {
          logger.error("MONITORING_PIPELINE", "Rule breach email failed", {
            correlationId,
            entity: { type: "Evaluation", id: evaluation.id },
            error: { code: "EMAIL_FAILED", message: "Failed to send rule breach email" },
          });
        }
      }
    }
  } else if (overallResult === "PASS") {
    const profitTargetOutcome = outcomes.find((o) => o.ruleType === "PROFIT_TARGET");
    const profitTargetMet = profitTargetOutcome && profitTargetOutcome.result === "PASS";

    if (profitTargetMet) {
      const releaseResult = await releaseAccount(prisma, {
        traderId: evaluation.traderId,
        accountId: evaluation.accountId!,
        reason: "EVALUATION_COMPLETED",
      });

      if (releaseResult.success) {
        evaluationStatus = releaseResult.evaluationStatus ?? "PASSED";
        passed = true;
        logger.info("MONITORING_PIPELINE", "Evaluation passed via releaseAccount", {
          correlationId,
          entity: { type: "Evaluation", id: evaluation.id },
          metadata: { accountNumber: account.accountNumber },
        });

        await prisma.auditLog.create({
          data: {
            action: "SYSTEM_EVENT" as AuditAction,
            entityType: "Evaluation",
            entityId: evaluation.id,
            performedBy,
            details: {
              event: "EVALUATION_PASSED",
              accountId: evaluation.accountId,
              accountNumber: account.accountNumber,
              totalPnl: computeTotalPnl(snapshot),
              ruleResults: outcomes.map((o) => ({
                ruleType: o.ruleType,
                result: o.result,
                actualValue: o.actualValue as Prisma.InputJsonValue,
                expectedValue: o.expectedValue as Prisma.InputJsonValue,
              })),
            } as Prisma.InputJsonObject,
          },
        });

        await createFundedAccount(prisma, {
          evaluationId: evaluation.id,
          performedBy: "system",
        });
      } else {
        logger.error("MONITORING_PIPELINE", "Failed to release account after evaluation pass", {
          correlationId,
          entity: { type: "Evaluation", id: evaluation.id },
          error: { code: "RELEASE_FAILED", message: releaseResult.error },
        });
      }
    }
  }

  return {
    success: true,
    evaluationId: evaluation.id,
    outcomes,
    overallResult,
    ruleEventsCreated,
    evaluationStatus,
    passed,
    failed,
  } as ProcessSnapshotSuccess;
}

async function txUpdateMonitoringState(
  prisma: PrismaClient,
  account: { id: string; lastMonitoringAt: Date | null; currentMonitoringStatus: string | null; currentMonitoringResult: string | null },
  snapshot: MonitoringSnapshot,
  overallResult: "PASS" | "FAIL" | "WARNING",
  correlationId: string,
): Promise<void> {
  const now = new Date();
  const status = overallResult === "FAIL" ? "UNHEALTHY" : overallResult === "WARNING" ? "DEGRADED" : "HEALTHY";
  const result = overallResult === "FAIL" ? "FAILED" : overallResult === "WARNING" ? "WARNING" : "SUCCEEDED";

  try {
    await prisma.mT5Account.update({
      where: { id: account.id },
      data: {
        lastMonitoringAt: now,
        currentMonitoringStatus: status,
        currentMonitoringResult: result,
        healthStatus: overallResult === "FAIL" ? "ERROR" : overallResult === "WARNING" ? "DISCONNECTED" : "CONNECTED",
      },
    });
    logger.info("MONITORING_PIPELINE", "Monitoring state updated", {
      correlationId,
      entity: { type: "MT5Account", id: account.id },
      metadata: { status, result },
    });
  } catch (e) {
    logger.error("MONITORING_PIPELINE", "Failed to update monitoring state", {
      correlationId,
      entity: { type: "MT5Account", id: account.id },
      error: { code: "STATE_UPDATE_FAILED", message: e instanceof Error ? e.message : "Unknown error" },
    });
  }
}

export async function scheduleMonitoringJob(
  prisma: PrismaClient,
  accountId: string,
  workerId: string = "monitoring-worker",
  timeoutMs: number = 10000,
): Promise<{ jobId: string; duplicate: boolean }> {
  const existing = await prisma.monitoringJob.findFirst({
    where: {
      accountId,
      status: { in: ["PENDING", "RUNNING"] as const },
    },
  });

  if (existing) {
    return { jobId: existing.jobId, duplicate: true };
  }

  const now = new Date();
  const jobId = `job-${accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await prisma.monitoringJob.create({
    data: {
      jobId,
      accountId,
      workerId,
      timeoutMs,
      leaseExpiry: computeLeaseExpiry(now, timeoutMs),
    },
  });

  return { jobId, duplicate: false };
}
