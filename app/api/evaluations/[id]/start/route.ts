import { PrismaClient, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";

const prisma = new PrismaClient();
const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const trader = await getAuthenticatedUser(request);

  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const rateLimit = checkRateLimit(`evaluation:start:${trader.id}:${id}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    const where: Prisma.EvaluationWhereInput = { id };
    if (trader.role === "TRADER") {
      where.traderId = trader.id;
    }

    const evaluation = await prisma.evaluation.findFirst({
      where,
      include: {
        account: true,
        rulesetVersion: { include: { ruleset: true, rules: true } },
      },
    });

    if (!evaluation) {
      return NextResponse.json(
        { success: false, error: "Evaluation not found" },
        { status: 404 }
      );
    }

    if (evaluation.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { success: false, error: `Cannot start evaluation in ${evaluation.status} status` },
        { status: 400 }
      );
    }

    if (!evaluation.accountId) {
      return NextResponse.json(
        { success: false, error: "No MT5 account assigned to this evaluation" },
        { status: 400 }
      );
    }

    if (!evaluation.account) {
      return NextResponse.json(
        { success: false, error: "Assigned MT5 account not found" },
        { status: 400 }
      );
    }

    if (evaluation.account.status !== "IN_USE") {
      return NextResponse.json(
        { success: false, error: "Assigned account is not in IN_USE status" },
        { status: 400 }
      );
    }

    const rules = evaluation.rulesetVersion?.rules ?? [];
    const ruleEvaluations = await prisma.ruleEvaluation.findMany({
      where: { evaluationId: evaluation.id },
    });

    if (ruleEvaluations.length === 0 && rules.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const rule of rules) {
          await tx.ruleEvaluation.create({
            data: {
              evaluationId: evaluation.id,
              ruleId: rule.id,
              result: "PASS",
              actualValue: Prisma.JsonNull,
              expectedValue: Prisma.JsonNull,
              details: "Initial state - awaiting monitoring",
              evaluatedAt: new Date(),
            },
          });
        }
      });
    }

    const startedEvaluation = await prisma.evaluation.update({
      where: { id },
      data: {
        startedAt: new Date(),
        status: "IN_PROGRESS",
        updatedAt: new Date(),
      },
      include: {
        rulesetVersion: {
          select: { id: true, version: true, ruleset: { select: { name: true } } },
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
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "EVALUATION_STARTED",
        entityType: "Evaluation",
        entityId: evaluation.id,
        performedBy: trader.id,
        details: {
          accountId: evaluation.accountId,
          accountNumber: evaluation.account?.accountNumber,
          rulesetVersionId: evaluation.rulesetVersionId,
          rulesCount: rules.length,
        },
      },
    });

    logger.info("EVALUATION", "Evaluation started", {
      correlationId,
      actor: { type: "trader", id: trader.id },
      entity: { type: "Evaluation", id: evaluation.id },
      metadata: { accountNumber: evaluation.account?.accountNumber },
    });

    return NextResponse.json(
      {
        success: true,
        evaluation: {
          id: startedEvaluation.id,
          status: startedEvaluation.status,
          startedAt: startedEvaluation.startedAt,
          rulesetVersionId: startedEvaluation.rulesetVersionId,
          account: startedEvaluation.account,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("EVALUATION", "Start evaluation failed", {
      correlationId,
      actor: { type: "trader", id: trader?.id ?? "unknown" },
      entity: { type: "Evaluation", id: id },
      error: { code: "EVALUATION_START_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to start evaluation" },
      { status: 500 }
    );
  }
}