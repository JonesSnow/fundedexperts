import { isActiveAdministrator } from "@/lib/auth/admin-policy";
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
import { encodeCreatedAtCursor, parseCursorPage } from "@/lib/cursor-pagination";
import { isOrderCreationEnabled } from "@/lib/order-availability";
import { isSameOrderRequest, type OrderRequestIdentity } from "@/lib/order-idempotency";

const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

export async function POST(request: NextRequest) {
  if (!isOrderCreationEnabled()) {
    return NextResponse.json(
      { success: false, error: "Purchases are not available yet" },
      { status: 503 },
    );
  }

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

    if (typeof productId !== "string") return NextResponse.json({ success: false, errors: { productId: "Product ID is required" } }, { status: 400 });

    if (idempotencyKey) {
      const existingResponse = await findExistingOrderResponse(idempotencyKey, trader.id, {
        traderId: trader.id,
        productId,
        notes,
        couponCode,
      });
      if (existingResponse) return existingResponse;
    }

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

    const orderResult = await (async () => {
      try {
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
        return { kind: "created" as const, order };
      } catch (error) {
        if (isPrismaUniqueConstraintError(error) && idempotencyKey) {
          try {
            const duplicateResponse = await findExistingOrderResponse(idempotencyKey, trader.id, {
              traderId: trader.id,
              productId,
              notes,
              couponCode,
            });
            if (duplicateResponse) return { kind: "response" as const, response: duplicateResponse };
          } catch {
            // Preserve the transaction failure if the concurrent retry lookup fails.
          }
        }
        throw error;
      }
    })();
    if (orderResult.kind === "response") return orderResult.response;
    const order = orderResult.order;

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

async function findExistingOrderResponse(
  idempotencyKey: string,
  traderId: string,
  requestIdentity: OrderRequestIdentity,
) {
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
    include: { orderItems: { select: { productId: true, quantity: true } } },
  });
  if (!existing) return null;
  if (existing.traderId !== traderId) {
    return NextResponse.json({ success: false, error: "Idempotency key is already in use" }, { status: 409 });
  }

  const couponUsages = await prisma.couponUsage.findMany({
    where: { orderId: existing.id, traderId },
    select: { coupon: { select: { code: true } } },
  });
  const couponCodes = couponUsages.map((usage) => usage.coupon.code);
  if (!isSameOrderRequest(existing, requestIdentity, couponCodes)) {
    return NextResponse.json({ success: false, error: "Idempotency key is already in use" }, { status: 409 });
  }

  logger.info("ORDER", "Duplicate order request ignored (idempotency)", {
    actor: { type: "trader", id: traderId },
    entity: { type: "Order", id: existing.id },
    metadata: { idempotencyKey, existingStatus: existing.status },
  });
  return NextResponse.json({ success: true, order: existing, duplicate: true }, { status: 200 });
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

export async function GET(request: NextRequest) {
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const page = parseCursorPage(request.nextUrl.searchParams);
  if (!page.success) {
    return NextResponse.json({ success: false, error: page.error }, { status: 400 });
  }

  try {
    const baseWhere: Prisma.OrderWhereInput = !isActiveAdministrator(trader) ? { traderId: trader.id } : {};
    const where: Prisma.OrderWhereInput = page.cursor
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { createdAt: { lt: page.cursor.createdAt } },
                { createdAt: page.cursor.createdAt, id: { lt: page.cursor.id } },
              ],
            },
          ],
        }
      : baseWhere;

    const [rows, totalCount, groupedStatuses] = await prisma.$transaction(
      async (tx) => Promise.all([
        tx.order.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: page.limit + 1,
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
        }),
        tx.order.count({ where: baseWhere }),
        tx.order.groupBy({
          by: ["status"],
          where: baseWhere,
          _count: { _all: true },
        }),
      ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const hasMore = rows.length > page.limit;
    const orders = rows.slice(0, page.limit);
    const lastOrder = orders.at(-1);
    const statusCounts = Object.fromEntries(
      groupedStatuses.map((group) => [group.status, group._count._all]),
    );
    return NextResponse.json(
      {
        success: true,
        orders,
        nextCursor: hasMore && lastOrder
          ? encodeCreatedAtCursor({ id: lastOrder.id, createdAt: lastOrder.createdAt })
          : null,
        summary: { totalCount, statusCounts },
      },
      { status: 200 },
    );
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
