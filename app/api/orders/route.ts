import { Prisma, type Coupon } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { sendOrderCreatedEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/db";
import { validateCreateOrderInput } from "@/lib/order-validation";
import { resolveOrderTerms } from "@/lib/order-domain";
import { attemptOrderCreatedNotification } from "@/lib/order-notification";
import { redeemableCouponWhere } from "@/lib/coupon-redemption";

const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const rateLimit = checkRateLimit(`orders:create:${trader.id}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Order request must be an object" }, { status: 400 });
    }
    const orderInput = body as Record<string, unknown>;
    const validation = validateCreateOrderInput(orderInput);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 },
      );
    }

    const productId = orderInput.productId;
    const idempotencyKey = typeof orderInput.idempotencyKey === "string" ? orderInput.idempotencyKey : undefined;
    const notes = typeof orderInput.notes === "string" ? orderInput.notes : undefined;
    const couponCode = typeof orderInput.couponCode === "string" ? orderInput.couponCode : undefined;

    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        if (existing.traderId !== trader.id) {
          return NextResponse.json({ success: false, error: "Idempotency key is already in use" }, { status: 409 });
        }
        logger.info("ORDER", "Duplicate order request ignored (idempotency)", {
          correlationId,
          actor: { type: "trader", id: trader.id },
          entity: { type: "Order", id: existing.id },
          metadata: { idempotencyKey, existingStatus: existing.status },
        });
        return NextResponse.json(
          { success: true, order: existing, duplicate: true },
          { status: 200 },
        );
      }
    }

    if (typeof productId !== "string") return NextResponse.json({ success: false, errors: { productId: "Product ID is required" } }, { status: 400 });
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        stages: {
          orderBy: { stageOrder: "asc" },
          include: { rulesetVersion: { include: { rules: true } } },
        },
        operatingRulesetVersion: { include: { rules: true } },
      },
    });
    if (!product || product.status !== "ACTIVE" || !product.isActive) {
      return NextResponse.json(
        { success: false, error: "Product not found or inactive" },
        { status: 404 },
      );
    }

    const terms = resolveOrderTerms(product);
    if (!terms.valid) {
      return NextResponse.json({ success: false, error: "Product is not currently purchasable", details: terms.errors }, { status: 409 });
    }
    const rulesetVersionId = terms.rulesetVersionId;

    let coupon: Coupon | null = null;
    let discountAmount = new Prisma.Decimal(0);
    if (couponCode && typeof couponCode === "string") {
      coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
      if (!coupon) {
        return NextResponse.json(
          { success: false, error: "Invalid coupon code" },
          { status: 400 },
        );
      }
      if (!coupon.isActive) {
        return NextResponse.json(
          { success: false, error: "Coupon is inactive" },
          { status: 400 },
        );
      }
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        return NextResponse.json(
          { success: false, error: "Coupon has expired" },
          { status: 400 },
        );
      }
      if (coupon.totalUsageLimit !== null && coupon.totalUsageLimit !== undefined && coupon.usedCount >= coupon.totalUsageLimit) {
        return NextResponse.json(
          { success: false, error: "Coupon usage limit reached" },
          { status: 400 },
        );
      }
      if (!product.price) return NextResponse.json({ success: false, error: "Product price is not configured" }, { status: 409 });
      discountAmount = new Prisma.Decimal(terms.price).mul(coupon.discountPercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    }

    const subtotal = new Prisma.Decimal(terms.price);
    const totalAmount = subtotal.sub(discountAmount).gt(0) ? subtotal.sub(discountAmount) : new Prisma.Decimal(0);

    const orderNumber = `ORD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const order = await prisma.$transaction(async (tx) => {
      if (coupon) {
        const reservation = await tx.coupon.updateMany({
          where: redeemableCouponWhere(coupon, new Date()),
          data: { usedCount: { increment: 1 } },
        });
        if (reservation.count !== 1) {
          throw new Error("COUPON_NO_LONGER_REDEEMABLE");
        }
      }

      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          traderId: trader.id,
          rulesetVersionId,
          status: "PENDING_PAYMENT",
          subtotal,
          taxAmount: new Prisma.Decimal(0),
          totalAmount,
          currency: terms.currency,
          idempotencyKey: idempotencyKey ?? null,
          notes: notes ?? null,
          orderItems: {
            create: {
              productId: product.id,
              unitPrice: subtotal,
              currency: terms.currency,
              quantity: 1,
              status: "PENDING",
              productSnapshot: terms.productSnapshot as Prisma.InputJsonValue,
            },
          },
        },
        include: { orderItems: true },
      });

      if (coupon) {
        await tx.couponUsage.create({
          data: {
            couponId: coupon.id,
            traderId: trader.id,
            orderId: createdOrder.id,
          },
        });
      }

      return createdOrder;
    });

    logger.info("ORDER", "Order created", {
      correlationId,
      actor: { type: "trader", id: trader.id },
      entity: { type: "Order", id: order.id },
      metadata: {
        orderNumber,
        productId: product.id,
        totalAmount: order.totalAmount,
        currency: order.currency,
        rulesetVersionId: order.rulesetVersionId,
        couponCode: coupon?.code ?? null,
        discountAmount,
      },
    });

    await attemptOrderCreatedNotification(
      () => sendOrderCreatedEmail(
        { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          productName: product.name,
          totalAmount: Number(order.totalAmount),
          currency: order.currency,
          orderStatus: order.status,
        },
      ),
      () => logger.warn("ORDER", "Order created but confirmation email delivery failed", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Order", id: order.id },
      }),
    );

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "COUPON_NO_LONGER_REDEEMABLE") {
      return NextResponse.json(
        { success: false, error: "Coupon is no longer available. Review the coupon and try again." },
        { status: 409 },
      );
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("ORDER", "Order creation failed", {
      correlationId,
      actor: { type: "trader", id: trader?.id ?? "unknown" },
      error: { code: "ORDER_CREATE_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to create order" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const orders = await prisma.order.findMany({
      where: trader.role === "TRADER" ? { traderId: trader.id } : {},
      orderBy: { createdAt: "desc" },
      include: {
        orderItems: {
          select: {
            id: true,
            productId: true,
            unitPrice: true,
            currency: true,
            quantity: true,
            status: true,
            productSnapshot: true,
          },
        },
      },
    });
    return NextResponse.json({ success: true, orders }, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to list orders" },
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
      select: { id: true, role: true, status: true, email: true, firstName: true, lastName: true },
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
