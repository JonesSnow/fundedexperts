import { PrismaClient, Prisma, OrderStatus, MT5AccountPurpose } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { allocateAccount, AllocateAccountResult } from "@/lib/allocation";

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
    const rateLimit = checkRateLimit(`order:allocate:${trader.id}:${id}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    const where: Prisma.OrderWhereInput = { id };
    if (trader.role === "TRADER") {
      where.traderId = trader.id;
    }

    const order = await prisma.order.findFirst({
      where,
      include: { orderItems: { include: { product: true } } },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    if (order.status !== "PAID") {
      return NextResponse.json(
        { success: false, error: "Order must be paid before allocation" },
        { status: 400 }
      );
    }

    if (order.rulesetVersionId) {
      const rulesetVersion = await prisma.rulesetVersion.findUnique({
        where: { id: order.rulesetVersionId },
        include: { ruleset: true },
      });
      if (rulesetVersion && rulesetVersion.status !== "PUBLISHED") {
        return NextResponse.json(
          { success: false, error: "Ruleset version is not published" },
          { status: 400 }
        );
      }
    }

    const existingAssignment = await prisma.accountAssignment.findFirst({
      where: { traderId: trader.id, status: "ASSIGNED" },
    });
    if (existingAssignment) {
      return NextResponse.json(
        { success: false, error: "Trader already has an active account assignment" },
        { status: 400 }
      );
    }

    const product = order.orderItems[0]?.product;
    const minAccountSize = product?.accountSize ? Number(product.accountSize) : undefined;

    const allocationResult: AllocateAccountResult = await allocateAccount(prisma, {
      traderId: trader.id,
      minAccountSize,
      purpose: "EVALUATION",
    });

    if (!allocationResult.success) {
      logger.warn("ALLOCATION", "Account allocation failed", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Order", id: order.id },
        metadata: {
          error: { code: "ALLOCATION_FAILED", message: allocationResult.error },
        },
      });
      return NextResponse.json(
        { success: false, error: allocationResult.error },
        { status: 400 }
      );
    }

    const { account, assignment, evaluationLinked } = allocationResult;

    let evaluation = null;
    if (evaluationLinked && order.rulesetVersionId) {
      evaluation = await prisma.evaluation.findFirst({
        where: {
          traderId: trader.id,
          rulesetVersionId: order.rulesetVersionId,
          status: "IN_PROGRESS",
        },
        orderBy: { startedAt: "desc" },
      });
    }

    logger.info("ALLOCATION", "Account allocated to order", {
      correlationId,
      actor: { type: "trader", id: trader.id },
      entity: { type: "Order", id: order.id },
      metadata: {
        accountId: account.id,
        accountNumber: account.accountNumber,
        assignmentId: assignment.id,
        evaluationLinked,
      },
    });

    return NextResponse.json(
      {
        success: true,
        allocation: {
          account: {
            id: account.id,
            accountNumber: account.accountNumber,
            broker: account.broker,
            server: account.server,
            login: account.login,
            accountSize: account.accountSize,
            currency: account.currency,
            purpose: account.purpose,
            status: account.status,
          },
          assignment: {
            id: assignment.id,
            status: assignment.status,
            assignedAt: assignment.assignedAt,
          },
          evaluationLinked,
          evaluation: evaluation
            ? {
                id: evaluation.id,
                status: evaluation.status,
                rulesetVersionId: evaluation.rulesetVersionId,
              }
            : null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("ALLOCATION", "Allocation failed", {
      correlationId,
      actor: { type: "trader", id: trader?.id ?? "unknown" },
      entity: { type: "Order", id: id },
      error: { code: "ALLOCATION_ERROR", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to allocate account" },
      { status: 500 }
    );
  }
}