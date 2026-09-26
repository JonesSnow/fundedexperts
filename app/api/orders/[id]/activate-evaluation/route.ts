import { PrismaClient, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { allocateAccount } from "@/lib/allocation";
import { linkEvaluation } from "@/lib/evaluation-link";
import { createLedgerEntry } from "@/lib/ledger/service";

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
    const rateLimit = checkRateLimit(`order:activate:${trader.id}:${id}`);
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
        { success: false, error: "Order must be paid before activating evaluation" },
        { status: 400 }
      );
    }

    if (!order.rulesetVersionId) {
      return NextResponse.json(
        { success: false, error: "No ruleset version available for this order" },
        { status: 400 }
      );
    }

    const rulesetVersion = await prisma.rulesetVersion.findUnique({
      where: { id: order.rulesetVersionId },
      include: { ruleset: true, rules: true },
    });

    if (!rulesetVersion || rulesetVersion.status !== "PUBLISHED") {
      return NextResponse.json(
        { success: false, error: "Ruleset version is not published" },
        { status: 400 }
      );
    }

    let evaluation = await prisma.evaluation.findFirst({
      where: {
        traderId: trader.id,
        rulesetVersionId: order.rulesetVersionId,
        status: { in: ["IN_PROGRESS", "PASSED", "FAILED"] },
      },
      orderBy: { startedAt: "desc" },
    });

    let wasAlreadyActivated = false;
    let account = null;
    let assignment = null;

    if (evaluation && evaluation.accountId) {
      wasAlreadyActivated = true;
      account = await prisma.mT5Account.findUnique({ where: { id: evaluation.accountId } });
      if (account) {
        assignment = await prisma.accountAssignment.findFirst({
          where: { accountId: account.id, status: "ASSIGNED" },
        });
      }
    } else {
      if (!evaluation) {
        evaluation = await prisma.evaluation.create({
          data: {
            traderId: trader.id,
            rulesetVersionId: order.rulesetVersionId,
            status: "IN_PROGRESS",
            startedAt: new Date(),
          },
        });

        await prisma.auditLog.create({
          data: {
            action: "EVALUATION_STARTED",
            entityType: "Evaluation",
            entityId: evaluation.id,
            performedBy: trader.id,
            details: { orderId: order.id, rulesetVersionId: order.rulesetVersionId },
          },
        });
      }

      const allocationResult = await allocateAccount(prisma, {
        traderId: trader.id,
        minAccountSize: order.orderItems[0]?.product?.accountSize
          ? Number(order.orderItems[0].product.accountSize)
          : undefined,
        purpose: "EVALUATION",
      });

      if (!allocationResult.success) {
        logger.error("ACTIVATION", "Account allocation failed", {
          correlationId,
          actor: { type: "trader", id: trader.id },
          entity: { type: "Evaluation", id: evaluation.id },
          error: { code: "ALLOCATION_FAILED", message: allocationResult.error },
        });
        return NextResponse.json(
          { success: false, error: `Account allocation failed: ${allocationResult.error}` },
          { status: 400 }
        );
      }

      account = allocationResult.account;
      assignment = allocationResult.assignment;

      const linkResult = await linkEvaluation(prisma, {
        evaluationId: evaluation.id,
        accountId: account.id,
        performedBy: trader.id,
      });

      if (!linkResult.success) {
        logger.error("ACTIVATION", "Evaluation linking failed", {
          correlationId,
          actor: { type: "trader", id: trader.id },
          entity: { type: "Evaluation", id: evaluation.id },
          error: { code: "LINK_FAILED", message: linkResult.error },
        });
        return NextResponse.json(
          { success: false, error: `Evaluation linking failed: ${linkResult.error}` },
          { status: 400 }
        );
      }

      if (rulesetVersion.rules.length > 0) {
        const existingRules = await prisma.ruleEvaluation.findMany({
          where: { evaluationId: evaluation.id },
        });
        if (existingRules.length === 0) {
          const evaluationId = evaluation.id;
          await prisma.$transaction(async (tx) => {
            for (const rule of rulesetVersion.rules) {
              await tx.ruleEvaluation.create({
                data: {
                  evaluationId,
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
      }
    }

    const referenceId = `payment-${order.id}`;
    const ledgerResult = await createLedgerEntry({
      traderId: trader.id,
      orderId: order.id,
      entryType: "CUSTOMER_PAYMENT",
      amount: order.totalAmount,
      direction: "CREDIT",
      currency: order.currency,
      referenceId,
      metadata: { paymentMethod: "SIMULATED", orderNumber: order.orderNumber },
      createdBy: trader.id,
    });

    if (!ledgerResult.success) {
      logger.warn("ACTIVATION", "Ledger entry creation failed", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Order", id: order.id },
        metadata: {
          error: { code: "LEDGER_CREATE_FAILED", message: ledgerResult.error ?? "Unknown" },
        },
      });
    }

    logger.info("ACTIVATION", "Evaluation activated", {
      correlationId,
      actor: { type: "trader", id: trader.id },
      entity: { type: "Evaluation", id: evaluation.id },
      metadata: { accountId: account?.id, wasAlreadyActivated },
    });

    return NextResponse.json(
      {
        success: true,
        evaluation: {
          id: evaluation.id,
          status: evaluation.status,
          startedAt: evaluation.startedAt,
          rulesetVersionId: evaluation.rulesetVersionId,
          account: account
            ? {
                id: account.id,
                accountNumber: account.accountNumber,
                broker: account.broker,
                server: account.server,
                login: account.login,
                accountSize: account.accountSize,
                currency: account.currency,
                purpose: account.purpose,
                status: account.status,
              }
            : null,
          assignment: assignment
            ? {
                id: assignment.id,
                status: assignment.status,
                assignedAt: assignment.assignedAt,
              }
            : null,
          wasAlreadyActivated,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("ACTIVATION", "Evaluation activation failed", {
      correlationId,
      actor: { type: "trader", id: trader?.id ?? "unknown" },
      entity: { type: "Order", id: id },
      error: { code: "ACTIVATION_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to activate evaluation" },
      { status: 500 }
    );
  }
}