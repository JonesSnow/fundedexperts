import { PrismaClient, OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { activateEvaluation } from "@/lib/activation";
import { createMockPaymentProvider } from "@/lib/mock-payment-provider";

const prisma = new PrismaClient();
const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});
const paymentProvider = createMockPaymentProvider();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = generateCorrelationId();
  const token = getSessionCookie(request);
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const session = await getSession(token);
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  try {
    const trader = await prisma.trader.findUnique({
      where: { id: session.sub },
      select: { id: true, role: true, status: true },
    });
    if (
      !trader ||
      trader.status === "SUSPENDED" ||
      trader.status === "INACTIVE"
    ) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 },
      );
    }

    if (order.traderId !== trader.id) {
      logger.error("ACTIVATION", "Unauthorized: trader does not own order", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Order", id },
        error: { code: "FORBIDDEN", message: "Trader does not own this order" },
      });
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { paymentReference } = body;

    const isDemoPayment = paymentReference === "demo-payment";

    if (isDemoPayment && order.status !== OrderStatus.PAID) {
      return NextResponse.json(
        { success: false, error: "Order is not paid" },
        { status: 400 },
      );
    }

    const activationInput = isDemoPayment
      ? { orderId: id, performedBy: trader.id }
      : { orderId: id, performedBy: trader.id, paymentReference };

    const result = await activateEvaluation(prisma, paymentProvider, activationInput);

    if (result.success) {
      logger.info("ACTIVATION", "Activation completed", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Evaluation", id: result.evaluation.id },
        metadata: { wasAlreadyActivated: result.wasAlreadyActivated, isDemoPayment },
      });
      return NextResponse.json(
        { success: true, result, isDemoPayment },
        { status: 200 },
      );
    }

    logger.error("ACTIVATION", "Activation failed", {
      correlationId,
      actor: { type: "trader", id: trader.id },
      entity: { type: "Order", id },
      error: { code: result.errorCategory, message: result.error },
    });
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("ACTIVATION", "Activation request failed", {
      correlationId,
      actor: { type: "trader", id: session.sub },
      entity: { type: "Order", id },
      error: { code: "ACTIVATION_REQUEST_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Activation request failed" },
      { status: 500 },
    );
  }
}
