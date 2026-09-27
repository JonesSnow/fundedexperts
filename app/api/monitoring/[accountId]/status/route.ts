import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";

const prisma = new PrismaClient();
const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

async function getAuthenticatedAdmin(request: NextRequest) {
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
  if (trader.role !== "ADMIN") {
    return null;
  }
  return trader;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const correlationId = generateCorrelationId();
  const { accountId } = await params;

  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const rateLimit = checkRateLimit(`monitoring:status:${admin.id}:${accountId}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    const account = await prisma.mT5Account.findUnique({
      where: { id: accountId },
      include: {
        evaluations: {
          where: { status: "IN_PROGRESS" },
          include: {
            trader: { select: { id: true, email: true, firstName: true } },
            rulesetVersion: {
              include: { ruleset: true, rules: true },
            },
            ruleEvaluations: {
              include: { rule: true },
              orderBy: { evaluatedAt: "desc" },
            },
          },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    const evaluation = account.evaluations[0];

    const monitoringJobs = await prisma.monitoringJob.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (!evaluation) {
      return NextResponse.json({
        success: true,
        account: {
          id: account.id,
          accountNumber: account.accountNumber,
          broker: account.broker,
          server: account.server,
          status: account.status,
          currentMonitoringStatus: account.currentMonitoringStatus,
          currentMonitoringResult: account.currentMonitoringResult,
          lastMonitoringAt: account.lastMonitoringAt?.toISOString() ?? null,
        },
        evaluation: null,
        ruleEvents: [],
        monitoringJobs: monitoringJobs.map((job) => ({
          id: job.id,
          jobId: job.jobId,
          workerId: job.workerId,
          status: job.status,
          attempt: job.attempt,
          timeoutMs: job.timeoutMs,
          retryable: job.retryable,
          errorCode: job.errorCode,
          errorMessage: job.errorMessage,
          startedAt: job.startedAt?.toISOString() ?? null,
          completedAt: job.completedAt?.toISOString() ?? null,
          createdAt: job.createdAt.toISOString(),
        })),
      });
    }

    const ruleEvents = await prisma.ruleEvent.findMany({
      where: { accountId },
      orderBy: { occurredAt: "desc" },
      take: 20,
    });

    logger.info("MONITORING_STATUS_API", "Monitoring status retrieved", {
      correlationId,
      actor: { type: "admin", id: admin.id },
      entity: { type: "MT5Account", id: accountId },
      metadata: { evaluationId: evaluation.id },
    });

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        accountNumber: account.accountNumber,
        broker: account.broker,
        server: account.server,
        status: account.status,
        currentMonitoringStatus: account.currentMonitoringStatus,
        currentMonitoringResult: account.currentMonitoringResult,
        lastMonitoringAt: account.lastMonitoringAt?.toISOString() ?? null,
      },
      evaluation: {
        id: evaluation.id,
        status: evaluation.status,
        startedAt: evaluation.startedAt.toISOString(),
        completedAt: evaluation.completedAt?.toISOString() ?? null,
        totalPnl: evaluation.totalPnl?.toString() ?? null,
        maxDrawdown: evaluation.maxDrawdown?.toString() ?? null,
        trader: {
          id: evaluation.trader.id,
          email: evaluation.trader.email,
          firstName: evaluation.trader.firstName ?? undefined,
        },
        rulesetVersion: {
          id: evaluation.rulesetVersion.id,
          version: evaluation.rulesetVersion.version,
          ruleset: {
            id: evaluation.rulesetVersion.ruleset.id,
            name: evaluation.rulesetVersion.ruleset.name,
          },
        },
        rules: evaluation.rulesetVersion.rules.map((rule) => ({
          id: rule.id,
          ruleType: rule.ruleType,
          name: rule.name,
          isRequired: rule.isRequired,
          value: rule.value,
        })),
      },
      ruleEvaluations: evaluation.ruleEvaluations.map((re) => ({
        id: re.id,
        ruleId: re.ruleId,
        ruleType: re.rule.ruleType,
        ruleName: re.rule.name,
        result: re.result,
        actualValue: re.actualValue,
        expectedValue: re.expectedValue,
        details: re.details,
        evaluatedAt: re.evaluatedAt.toISOString(),
      })),
      ruleEvents: ruleEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        severity: event.severity,
        message: event.message,
        acknowledged: event.acknowledged,
        occurredAt: event.occurredAt.toISOString(),
      })),
      monitoringJobs: monitoringJobs.map((job) => ({
        id: job.id,
        jobId: job.jobId,
        workerId: job.workerId,
        status: job.status,
        attempt: job.attempt,
        timeoutMs: job.timeoutMs,
        retryable: job.retryable,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("MONITORING_STATUS_API", "Failed to retrieve monitoring status", {
      correlationId,
      actor: { type: "admin", id: admin.id },
      entity: { type: "MT5Account", id: accountId },
      error: { code: "STATUS_RETRIEVAL_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to retrieve monitoring status" },
      { status: 500 }
    );
  }
}
