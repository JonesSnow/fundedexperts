import { PrismaClient, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";

const prisma = new PrismaClient();
const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
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
    const rateLimit = checkRateLimit(`order:pay:${trader.id}:${id}`);
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

    const order = await prisma.order.findFirst({ where });
    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    if (order.status === "PAID") {
      return NextResponse.json(
        { success: false, error: "Order already paid" },
        { status: 400 }
      );
    }

    if (order.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: "Cannot pay for cancelled order" },
        { status: 400 }
      );
    }

    if (order.status === "EXPIRED") {
      return NextResponse.json(
        { success: false, error: "Order has expired" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { paymentMethod, simulateSuccess = true } = body as {
      paymentMethod?: string;
      simulateSuccess?: boolean;
    };

    const validMethods = ["SIMULATED_CARD", "SIMULATED_CRYPTO", "SIMULATED_BANK_TRANSFER"];
    if (paymentMethod && !validMethods.includes(paymentMethod)) {
      return NextResponse.json(
        { success: false, error: "Invalid payment method. Use SIMULATED_CARD, SIMULATED_CRYPTO, or SIMULATED_BANK_TRANSFER" },
        { status: 400 }
      );
    }

    const method = paymentMethod ?? "SIMULATED_CARD";

    if (!simulateSuccess) {
      const failedOrder = await prisma.order.update({
        where: { id },
        data: { status: "FAILED" },
      });

      logger.warn("PAYMENT", "Simulated payment failed", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Order", id: order.id },
        metadata: { paymentMethod: method, orderNumber: order.orderNumber },
      });

      return NextResponse.json(
        { success: false, error: "Payment failed", order: failedOrder },
        { status: 400 }
      );
    }

    const paidOrder = await prisma.order.update({
      where: { id },
      data: { status: "PAID" },
    });

    logger.info("PAYMENT", "Simulated payment completed", {
      correlationId,
      actor: { type: "trader", id: trader.id },
      entity: { type: "Order", id: order.id },
      metadata: {
        paymentMethod: method,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        currency: order.currency,
      },
    });

    return NextResponse.json(
      { success: true, order: paidOrder, message: "Payment completed (simulated)" },
      { status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("PAYMENT", "Payment processing failed", {
      correlationId,
      actor: { type: "trader", id: trader?.id ?? "unknown" },
      error: { code: "PAYMENT_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to process payment" },
      { status: 500 }
    );
  }
}