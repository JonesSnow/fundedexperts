import { PrismaClient, Order, Prisma } from "@prisma/client";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const where: Prisma.OrderWhereInput = { id };
    if (trader.role === "TRADER") {
      where.traderId = trader.id;
    }

    const order = await prisma.order.findFirst({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        currency: true,
        subtotal: true,
        taxAmount: true,
        totalAmount: true,
        idempotencyKey: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        trader: { select: { id: true, email: true, firstName: true, lastName: true } },
        rulesetVersion: { select: { id: true, version: true, status: true } },
        orderItems: {
          select: {
            id: true,
            unitPrice: true,
            currency: true,
            quantity: true,
            status: true,
            product: { select: { id: true, name: true, accountSize: true } },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, order }, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch order" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { action } = body as { action?: string };

    if (action !== "cancel") {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
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

    if (order.status !== "CREATED" && order.status !== "PENDING_PAYMENT") {
      return NextResponse.json(
        { success: false, error: `Cannot cancel order in ${order.status} status` },
        { status: 400 }
      );
    }

    const cancelledOrder = await prisma.order.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json(
      { success: true, order: cancelledOrder, message: "Order cancelled" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to cancel order" },
      { status: 500 }
    );
  }
}