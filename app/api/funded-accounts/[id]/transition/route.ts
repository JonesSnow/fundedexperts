import { PrismaClient, FundedAccountStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { transitionFundedAccountStatus } from "@/lib/funded-account";

const prisma = new PrismaClient();
const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
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
  if (!trader || trader.role !== "ADMIN" || trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
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
  const admin = await getAuthenticatedAdmin(request);

  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const rateLimit = checkRateLimit(`funded:transition:${admin.id}:${id}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    const body = await request.json();
    const { status, reason } = body as { status?: FundedAccountStatus; reason?: string };

    if (!status || !Object.values(FundedAccountStatus).includes(status)) {
      return NextResponse.json(
        { success: false, error: "Invalid status" },
        { status: 400 }
      );
    }

    const result = await transitionFundedAccountStatus(prisma, { id, status, reason, performedBy: admin.id });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, errorCategory: result.errorCategory },
        { status: result.errorCategory === "NOT_FOUND" ? 404 : 400 },
      );
    }

    logger.info("FUNDED_ACCOUNT", "Funded account transitioned via API", {
      correlationId,
      actor: { type: "admin", id: admin.id },
      entity: { type: "FundedAccount", id: result.account.id },
      metadata: { from: "previous", to: status, reason },
    });

    return NextResponse.json(
      { success: true, account: result.account },
      { status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("FUNDED_ACCOUNT", "Transition failed", {
      correlationId,
      actor: { type: "admin", id: admin?.id ?? "unknown" },
      entity: { type: "FundedAccount", id: id },
      error: { code: "TRANSITION_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to transition funded account" },
      { status: 500 }
    );
  }
}