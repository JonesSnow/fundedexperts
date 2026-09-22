import { PrismaClient, EvaluationStatus, RuleResult, RuleType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";

const prisma = new PrismaClient();

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
  return trader;
}

function buildEvaluationWhere(traderId: string, role: string, status?: string) {
  const where: Record<string, unknown> = {};
  if (role === "TRADER") {
    where.traderId = traderId;
  }
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
  accountId: string | null;
  account: { id: string; accountNumber: string; status: string; healthStatus: string } | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  totalPnl: unknown;
  maxDrawdown: unknown;
  ruleEvaluations: { id: string; ruleId: string; result: string; evaluatedAt?: Date; rule: { ruleType: RuleType; name: string } }[];
  createdAt: Date;
  updatedAt: Date;
}, isAdmin: boolean) {
  const ruleResults = (evaluation.ruleEvaluations ?? []).map((re) => ({
    ruleType: re.rule?.ruleType ?? "UNKNOWN",
    ruleName: re.rule?.name ?? "",
    result: re.result,
    evaluatedAt: re.evaluatedAt,
  }));

  return {
    id: evaluation.id,
    ...(isAdmin ? { traderId: evaluation.traderId } : {}),
    rulesetVersionId: evaluation.rulesetVersionId,
    rulesetName: evaluation.rulesetVersion?.ruleset?.name ?? null,
    rulesetVersion: evaluation.rulesetVersion?.version ?? null,
    status: evaluation.status as EvaluationStatus,
    account: evaluation.account
      ? {
          id: evaluation.account.id,
          accountNumber: evaluation.account.accountNumber,
          status: evaluation.account.status,
          healthStatus: evaluation.account.healthStatus,
        }
      : null,
    startedAt: evaluation.startedAt,
    completedAt: evaluation.completedAt,
    totalPnl: Number(evaluation.totalPnl),
    maxDrawdown: Number(evaluation.maxDrawdown),
    ruleResults,
    rulePassedCount: evaluation.ruleEvaluations.filter((re) => re.result === RuleResult.PASS).length,
    ruleFailedCount: evaluation.ruleEvaluations.filter((re) => re.result === RuleResult.FAIL).length,
    ruleWarningCount: evaluation.ruleEvaluations.filter((re) => re.result === RuleResult.WARNING).length,
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

  try {
    const { status } = Object.fromEntries(request.nextUrl.searchParams) as {
      status?: string;
    };

    const where = buildEvaluationWhere(trader.id, trader.role, status);

    const evaluations = await prisma.evaluation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
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
            status: true,
            healthStatus: true,
          },
        },
        ruleEvaluations: {
          select: {
            id: true,
            ruleId: true,
            result: true,
            evaluatedAt: true,
            rule: { select: { ruleType: true, name: true } },
          },
        },
      },
    });

    const safe = evaluations.map((e) => safeEvaluation(e, trader.role === "ADMIN"));

    return NextResponse.json(
      { success: true, evaluations: safe },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to list evaluations" },
      { status: 500 },
    );
  }
}
