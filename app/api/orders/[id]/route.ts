import { PrismaClient, OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { createLogger, generateCorrelationId } from "@/lib/logger";

const prisma = new PrismaClient();
const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["PAID", "FAILED", "CANCELLED", "EXPIRED"],
  PAID: ["FAILED", "CANCELLED"],
  FAILED: ["PENDING_PAYMENT", "CANCELLED"],
  CANCELLED: [],
  EXPIRED: ["PENDING_PAYMENT", "CANCELLED"],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 },
      );
    }
    if (trader.role === "TRADER" && order.traderId !== trader.id) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    return NextResponse.json({ success: true, order }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch order" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = generateCorrelationId();
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  if (trader.role !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (
      !status ||
      !Object.values(OrderStatus).includes(status as OrderStatus)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid status" },
        { status: 400 },
      );
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 },
      );
    }

    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed.includes(status as OrderStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot transition from ${order.status} to ${status}`,
        },
        { status: 400 },
      );
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: status as OrderStatus, updatedAt: new Date() },
    });

    logger.info("ORDER", "Order status changed", {
      correlationId,
      actor: { type: "admin", id: trader.id },
      entity: { type: "Order", id: order.id },
      metadata: { from: order.status, to: status },
    });

    return NextResponse.json(
      { success: true, order: updated },
      { status: 200 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("ORDER", "Order status update failed", {
      correlationId,
      error: { code: "ORDER_STATUS_UPDATE_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to update order" },
      { status: 500 },
    );
  }
}

async function getAuthenticatedUser(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, status: true },
  });
  if (
    !trader ||
    trader.status === "SUSPENDED" ||
    trader.status === "INACTIVE"
  ) {
    return null;
  }
  return trader;
}
