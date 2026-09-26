import { PrismaClient, Prisma, EvaluationStatus, RuleResult, RuleType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";

const prisma = new PrismaClient();

async function getAuthenticatedUser(request: NextRequest) {
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

function safeEvaluation(
  evaluation: {
    id: string;
    traderId: string;
    rulesetVersionId: string;
    rulesetVersion: { id: string; version: string; ruleset: { name: string } } | null;
    accountId: string | null;
    account: { id: string; accountNumber: string; broker: string | null; server: string | null; status: string; healthStatus: string } | null;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    totalPnl: unknown;
    maxDrawdown: unknown;
    ruleEvaluations: { id: string; ruleId: string; result: string; evaluatedAt?: Date; rule: { ruleType: RuleType; name: string } }[];
    createdAt: Date;
    updatedAt: Date;
  },
  isAdmin: boolean
) {
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
          broker: evaluation.account.broker,
          server: evaluation.account.server,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;

  try {
    const where: Prisma.EvaluationWhereInput = { id };
    if (trader.role === "TRADER") {
      where.traderId = trader.id;
    }

    const evaluation = await prisma.evaluation.findFirst({
      where,
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
            evaluatedAt: true,
            rule: { select: { ruleType: true, name: true } },
          },
        },
      },
    });

    if (!evaluation) {
      return NextResponse.json(
        { success: false, error: "Evaluation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, evaluation: safeEvaluation(evaluation, trader.role === "ADMIN") },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch evaluation" },
      { status: 500 }
    );
  }
}