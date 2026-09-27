import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { MockMT5Adapter } from "@/lib/monitoring/mock-adapter";
import { normalizeSnapshot } from "@/lib/monitoring/normalize";
import { processMonitoringSnapshot, type ProcessSnapshotInput } from "@/lib/monitoring-pipeline";
import { evaluateEligibility } from "@/lib/monitoring/eligibility";
import type { MonitoringSnapshot } from "@/lib/monitoring/types";

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
  { params }: { params: Promise<{ accountId: string }> }
) {
  const correlationId = generateCorrelationId();
  const { accountId } = await params;
  const trader = await getAuthenticatedUser(request);

  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (trader.role !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const rateLimit = checkRateLimit(`monitoring:process:${trader.id}:${accountId}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    const body = await request.json();
    const { snapshot: rawSnapshot, useMock, mockAccount, sendEmails } = body as {
      snapshot?: Partial<MonitoringSnapshot>;
      useMock?: boolean;
      mockAccount?: {
        accountNumber?: string;
        balance?: number;
        equity?: number;
        freeMargin?: number;
        margin?: number;
        currency?: string;
        login?: number;
        server?: string;
        broker?: string;
        isDemo?: boolean;
        positions?: Array<{
          symbol?: string | null;
          type?: number | null;
          volume?: number | null;
          price?: number | null;
          sl?: number | null;
          tp?: number | null;
          profit?: number | null;
          swap?: number | null;
          openTime?: Date | null;
          comment?: string | null;
        }>;
        orders?: Array<{
          ticket?: number | null;
          symbol?: string | null;
          type?: number | null;
          volume?: number | null;
          price?: number | null;
          sl?: number | null;
          tp?: number | null;
          state?: number | null;
          time?: Date | null;
          comment?: string | null;
        }>;
        history?: Array<{
          ticket?: number | null;
          symbol?: string | null;
          type?: number | null;
          volume?: number | null;
          price?: number | null;
          profit?: number | null;
          swap?: number | null;
          commission?: number | null;
          time?: Date | null;
          reason?: number | null;
          comment?: string | null;
        }>;
      };
      sendEmails?: boolean;
    };

    let pipelineInput: ProcessSnapshotInput;

    if (useMock && mockAccount) {
      const accountNumber = mockAccount.accountNumber ?? `MOCK-${Date.now()}`;
      const mockAdapter = new MockMT5Adapter({
        accounts: [
          {
            accountId: accountId,
            accountNumber,
            balance: mockAccount.balance ?? 100000,
            equity: mockAccount.equity ?? 100000,
            freeMargin: mockAccount.freeMargin ?? 95000,
            margin: mockAccount.margin ?? 5000,
            currency: mockAccount.currency,
            login: mockAccount.login ?? 12345678,
            server: mockAccount.server,
            broker: mockAccount.broker,
            positions: mockAccount.positions ?? [],
            orders: mockAccount.orders ?? [],
            history: mockAccount.history ?? [],
          },
        ],
      });

      const providerSnapshot = await mockAdapter.fetchSnapshot({
        accountId: accountId,
        accountNumber,
        provider: "MT5",
        credentials: "mock-creds",
      });

      const normalizeResult = normalizeSnapshot(
        accountId,
        accountNumber,
        providerSnapshot.provider ?? "MT5",
        providerSnapshot
      );

      if (!normalizeResult.snapshot) {
        return NextResponse.json(
          { success: false, error: "Failed to normalize monitoring data" },
          { status: 400 }
        );
      }

      const eligibilityInput = {
        accountId: accountId,
        status: normalizeResult.snapshot.terminalConnected === false ? "INACTIVE" : "ACTIVE",
        isDemo: normalizeResult.snapshot.isDemo ?? true,
        hasOpenPositions: (normalizeResult.snapshot.positions ?? []).length > 0,
        isSuspended: false,
        leverage: normalizeResult.snapshot.leverage ?? undefined,
      };

      const eligibility = evaluateEligibility(eligibilityInput);
      if (!eligibility.eligible) {
        logger.warn("MONITORING_API", "Account not eligible for monitoring", {
          correlationId,
          entity: { type: "MT5Account", id: accountId },
          metadata: { reasons: eligibility.reasons.map(r => r.code) },
        });
        return NextResponse.json(
          { success: false, error: "Account not eligible for monitoring", reasons: eligibility.reasons },
          { status: 400 }
        );
      }

      pipelineInput = {
        accountId: accountId,
        snapshot: normalizeResult.snapshot,
        performedBy: trader.id,
        sendEmails: sendEmails ?? false,
      };
    } else if (rawSnapshot) {
      pipelineInput = {
        accountId: accountId,
        snapshot: rawSnapshot as MonitoringSnapshot,
        performedBy: trader.id,
        sendEmails: sendEmails ?? false,
      };
    } else {
      return NextResponse.json(
        { success: false, error: "Either snapshot or useMock with mockAccount config is required" },
        { status: 400 }
      );
    }

    const result = await processMonitoringSnapshot(prisma, pipelineInput);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    logger.info("MONITORING_API", "Monitoring snapshot processed", {
      correlationId,
      actor: { type: "admin", id: trader.id },
      entity: { type: "MT5Account", id: accountId },
      metadata: { evaluationId: result.evaluationId, overallResult: result.overallResult },
    });

    return NextResponse.json(
      {
        success: true,
        evaluationId: result.evaluationId,
        overallResult: result.overallResult,
        ruleEventsCreated: result.ruleEventsCreated,
        evaluationStatus: result.evaluationStatus ?? null,
        passed: result.passed ?? null,
        failed: result.failed ?? null,
        outcomes: result.outcomes.map(o => ({
          ruleId: o.ruleId,
          ruleType: o.ruleType,
          result: o.result,
          actualValue: o.actualValue,
          expectedValue: o.expectedValue,
          details: o.details,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("MONITORING_API", "Monitoring process failed", {
      correlationId,
      actor: { type: "admin", id: trader?.id ?? "unknown" },
      entity: { type: "MT5Account", id: accountId },
      error: { code: "MONITORING_PROCESS_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to process monitoring snapshot" },
      { status: 500 }
    );
  }
}
