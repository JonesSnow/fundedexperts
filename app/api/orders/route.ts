import {
  PrismaClient,
  OrderStatus,
  Product,
  RulesetVersion,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";

const prisma = new PrismaClient();
const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const trader = await getAuthenticatedUser(request, correlationId);
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

    const body = await request.json();
    const validation = validateOrderInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 },
      );
    }

    const { productId, rulesetVersionId, idempotencyKey, notes } = body;

    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
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

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || !product.isActive) {
      return NextResponse.json(
        { success: false, error: "Product not found or inactive" },
        { status: 404 },
      );
    }

    let rulesetVersion: RulesetVersion | null = null;
    if (rulesetVersionId) {
      rulesetVersion = await prisma.rulesetVersion.findUnique({
        where: { id: rulesetVersionId },
      });
      if (!rulesetVersion) {
        return NextResponse.json(
          { success: false, error: "Ruleset version not found" },
          { status: 404 },
        );
      }
      if (rulesetVersion.status !== "PUBLISHED") {
        return NextResponse.json(
          { success: false, error: "Ruleset version is not published" },
          { status: 400 },
        );
      }
    } else if (product.rulesetId) {
      rulesetVersion = await prisma.rulesetVersion.findFirst({
        where: { rulesetId: product.rulesetId, status: "PUBLISHED" },
        orderBy: { version: "desc" },
      });
    }

    const orderNumber = `ORD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        traderId: trader.id,
        rulesetVersionId: rulesetVersion?.id ?? null,
        subtotal: product.price ?? 0,
        taxAmount: 0,
        totalAmount: product.price ?? 0,
        currency: product.currency ?? "USD",
        idempotencyKey: idempotencyKey ?? null,
        notes: notes ?? null,
      },
    });

    logger.info("ORDER", "Order created", {
      correlationId,
      actor: { type: "trader", id: trader.id },
      entity: { type: "Order", id: order.id },
      metadata: {
        orderNumber: order.orderNumber,
        productId: product.id,
        totalAmount: order.totalAmount,
        currency: order.currency,
        rulesetVersionId: order.rulesetVersionId,
      },
    });

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (error) {
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
    });
    return NextResponse.json({ success: true, orders }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to list orders" },
      { status: 500 },
    );
  }
}

async function getAuthenticatedUser(
  request: NextRequest,
  correlationId?: string,
) {
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

function validateOrderInput(body: Record<string, unknown>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  if (!body.productId || typeof body.productId !== "string") {
    errors.productId = "Product ID is required";
  }
  if (
    body.idempotencyKey !== undefined &&
    typeof body.idempotencyKey !== "string"
  ) {
    errors.idempotencyKey = "Idempotency key must be a string";
  }
  if (body.notes !== undefined && typeof body.notes !== "string") {
    errors.notes = "Notes must be a string";
  }
  if (
    body.rulesetVersionId !== undefined &&
    typeof body.rulesetVersionId !== "string"
  ) {
    errors.rulesetVersionId = "Ruleset version ID must be a string";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
