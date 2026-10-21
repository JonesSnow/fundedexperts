import { EvaluationStatus, Prisma, RuleType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { encodeCreatedAtCursor, parseCursorPage } from "@/lib/cursor-pagination";


async function getAuthenticatedTrader(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, status: true },
  });
  if (!trader || trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
    return null;
  }
  if (trader.role !== "TRADER") {
    return null;
  }
  return trader;
}

function buildEvaluationWhere(traderId: string, status?: string): Prisma.EvaluationWhereInput {
  const where: Prisma.EvaluationWhereInput = { traderId };
  if (status && Object.values(EvaluationStatus).includes(status as EvaluationStatus)) {
    where.status = status as EvaluationStatus;
  }
  return where;
}

function safeEvaluation(evaluation: {
  id: string;
  traderId: string;
  rulesetVersionId: string;
  rulesetVersion: { id: string; version: string; ruleset: { name: string } } | null;
  productStage: { id: string; stageKey: string; displayName: string; stageOrder: number } | null;
  accountId: string | null;
  account: { id: string; accountNumber: string; broker: string | null; server: string | null; status: string; healthStatus: string } | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  totalPnl: unknown;
  maxDrawdown: unknown;
  startingBalance: unknown;
  ruleEvaluations: { id: string; ruleId: string; result: string; state: string; evaluatedAt?: Date; sourceDataTimestamp?: Date | null; actualValue?: unknown; expectedValue?: unknown; details?: string | null; rule: { ruleType: RuleType; name: string; value?: unknown; isRequired: boolean; calculation?: unknown } }[];
  createdAt: Date;
  updatedAt: Date;
}) {
  const ruleResults = (evaluation.ruleEvaluations ?? []).map((re) => ({
    id: re.id,
    ruleId: re.ruleId,
    ruleType: re.rule?.ruleType ?? "UNKNOWN",
    ruleName: re.rule?.name ?? "",
    ruleValue: re.rule?.value ?? null,
    isRequired: re.rule?.isRequired ?? true,
    evaluationId: evaluation.id,
    rulesetVersionId: evaluation.rulesetVersionId,
    evaluationTimestamp: re.evaluatedAt,
    sourceDataTimestamp: re.sourceDataTimestamp,
    provisional: re.state !== "PASS" && re.state !== "FAIL",
    requiredFollowUp: re.state === "PENDING"
      ? "Wait for the first complete monitoring result."
      : re.state === "INCOMPLETE"
        ? "Continue the evaluation; this requirement is not yet met."
        : re.state === "STALE"
          ? "Wait for fresh source data; this result is not final."
          : re.state === "UNAVAILABLE"
            ? "A required data source or evaluator is unavailable; no pass/fail decision is available."
            : null,
    result: re.result,
    state: re.state,
    calculationVersion: re.rule?.calculation && typeof re.rule.calculation === "object" && "schemaVersion" in re.rule.calculation
      ? (re.rule.calculation as { schemaVersion?: unknown }).schemaVersion ?? null
      : null,
    calculationMethod: re.rule?.calculation && typeof re.rule.calculation === "object" && "method" in re.rule.calculation
      ? (re.rule.calculation as { method?: unknown }).method ?? null
      : null,
    actualValue: re.actualValue,
    expectedValue: re.expectedValue,
    details: re.details,
    evaluatedAt: re.evaluatedAt,
  }));

  return {
    id: evaluation.id,
    rulesetVersionId: evaluation.rulesetVersionId,
    rulesetName: evaluation.rulesetVersion?.ruleset?.name ?? null,
    rulesetVersion: evaluation.rulesetVersion?.version ?? null,
    productStage: evaluation.productStage ? {
      id: evaluation.productStage.id,
      stageKey: evaluation.productStage.stageKey,
      displayName: evaluation.productStage.displayName,
      stageOrder: evaluation.productStage.stageOrder,
    } : null,
    status: evaluation.status as EvaluationStatus,
    account: evaluation.account
      ? {
          id: evaluation.account.id,
          accountNumber: evaluation.account.accountNumber,
          broker: evaluation.account.broker,
          server: evaluation.account.server,
          status: evaluation.account.status,
          healthStatus: evaluation.account.healthStatus,
        }
      : null,
    startedAt: evaluation.startedAt,
    completedAt: evaluation.completedAt,
    totalPnl: evaluation.totalPnl !== null && evaluation.totalPnl !== undefined ? Number(evaluation.totalPnl) : null,
    maxDrawdown: evaluation.maxDrawdown !== null && evaluation.maxDrawdown !== undefined ? Number(evaluation.maxDrawdown) : null,
    startingBalance: evaluation.startingBalance !== null && evaluation.startingBalance !== undefined ? Number(evaluation.startingBalance) : null,
    ruleResults,
    rulePassedCount: evaluation.ruleEvaluations.filter((re) => re.state === "PASS").length,
    ruleFailedCount: evaluation.ruleEvaluations.filter((re) => re.state === "FAIL").length,
    rulePendingCount: evaluation.ruleEvaluations.filter((re) => re.state === "PENDING").length,
    ruleIncompleteCount: evaluation.ruleEvaluations.filter((re) => re.state === "INCOMPLETE").length,
    ruleStaleCount: evaluation.ruleEvaluations.filter((re) => re.state === "STALE").length,
    ruleUnavailableCount: evaluation.ruleEvaluations.filter((re) => re.state === "UNAVAILABLE").length,
    ruleWarningCount: evaluation.ruleEvaluations.filter((re) => !["PASS", "FAIL"].includes(re.state)).length,
    createdAt: evaluation.createdAt,
    updatedAt: evaluation.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const trader = await getAuthenticatedTrader(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const page = parseCursorPage(request.nextUrl.searchParams);
  if (!page.success) {
    return NextResponse.json({ success: false, error: page.error }, { status: 400 });
  }

  try {
    const { status } = Object.fromEntries(request.nextUrl.searchParams) as {
      status?: string;
    };

    const baseWhere = buildEvaluationWhere(trader.id, status);
    const where: Prisma.EvaluationWhereInput = page.cursor
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { createdAt: { lt: page.cursor.createdAt } },
                { createdAt: page.cursor.createdAt, id: { lt: page.cursor.id } },
              ],
            },
          ],
        }
      : baseWhere;

    const [rows, totalCount, groupedStatuses, aggregate] = await prisma.$transaction(
      async (tx) => Promise.all([
        tx.evaluation.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: page.limit + 1,
          include: {
            productStage: { select: { id: true, stageKey: true, displayName: true, stageOrder: true } },
            rulesetVersion: {
              select: {
                id: true,
                version: true,
                ruleset: { select: { name: true } },
              },
            },
            account: {
              select: {
                id: true,
                accountNumber: true,
                broker: true,
                server: true,
                status: true,
                healthStatus: true,
              },
            },
            ruleEvaluations: {
              select: {
                id: true,
                ruleId: true,
                result: true,
                state: true,
                actualValue: true,
                expectedValue: true,
                details: true,
                evaluatedAt: true,
                sourceDataTimestamp: true,
                rule: { select: { ruleType: true, name: true, value: true, isRequired: true, calculation: true } },
              },
              orderBy: { evaluatedAt: "desc" },
            },
          },
        }),
        tx.evaluation.count({ where: baseWhere }),
        tx.evaluation.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
        tx.evaluation.aggregate({ where: baseWhere, _max: { maxDrawdown: true } }),
      ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const hasMore = rows.length > page.limit;
    const evaluations = rows.slice(0, page.limit);
    const safe = evaluations.map(safeEvaluation);
    const lastEvaluation = evaluations.at(-1);
    const statusCounts = Object.fromEntries(
      groupedStatuses.map((group) => [group.status, group._count._all]),
    );

    return NextResponse.json(
      {
        success: true,
        evaluations: safe,
        nextCursor: hasMore && lastEvaluation
          ? encodeCreatedAtCursor({ id: lastEvaluation.id, createdAt: lastEvaluation.createdAt })
          : null,
        summary: {
          totalCount,
          statusCounts,
          largestDrawdown: aggregate._max.maxDrawdown !== null
            ? Number(aggregate._max.maxDrawdown)
            : null,
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to list evaluations" },
      { status: 500 },
    );
  }
}
