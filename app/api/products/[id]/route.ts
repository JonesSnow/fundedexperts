import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";

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
  const rateLimit = checkRateLimit(`product:${id}`);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  const product = await prisma.product.findUnique({
    where: {
      id,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      accountSize: true,
      price: true,
      currency: true,
      displayOrder: true,
      isActive: true,
      ruleset: { select: { name: true } },
    },
  });

  if (!product) {
    return NextResponse.json(
      { success: false, error: "Product not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, product }, { status: 200 });
}

export async function PUT(
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
  if (trader.role !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const validation = validateProductInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 }
      );
    }

    const existing = await prisma.product.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      );
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        pricingPlan: body.pricingPlan ?? existing.pricingPlan,
        settings: body.settings ?? existing.settings,
        isActive: body.isActive ?? existing.isActive,
        accountSize: body.accountSize ?? existing.accountSize,
        price: body.price ?? existing.price,
        currency: body.currency ?? existing.currency,
        rulesetId: body.rulesetId ?? existing.rulesetId,
        displayOrder: body.displayOrder ?? existing.displayOrder,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      { success: true, product },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update product" },
      { status: 500 }
    );
  }
}

function validateProductInput(body: Record<string, unknown>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.length > 100) {
      errors.name = "Name must be 100 characters or less";
    }
  }
  if (body.accountSize !== undefined) {
    if (typeof body.accountSize !== "number" || body.accountSize <= 0) {
      errors.accountSize = "Account size must be a positive number";
    }
  }
  if (body.price !== undefined) {
    if (typeof body.price !== "number" || body.price < 0) {
      errors.price = "Price must be a non-negative number";
    }
  }
  if (body.currency !== undefined && typeof body.currency !== "string") {
    errors.currency = "Currency must be a string";
  }
  if (body.displayOrder !== undefined && typeof body.displayOrder !== "number") {
    errors.displayOrder = "Display order must be a number";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
