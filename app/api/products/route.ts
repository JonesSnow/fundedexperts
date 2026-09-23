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

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit("products:list");
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
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
    orderBy: { displayOrder: "asc" },
  });

  return NextResponse.json({ success: true, products }, { status: 200 });
}

export async function POST(request: NextRequest) {
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
      where: { name: body.name },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Product name already exists" },
        { status: 409 }
      );
    }

    const product = await prisma.product.create({
      data: {
        name: body.name,
        description: body.description,
        pricingPlan: body.pricingPlan,
        settings: body.settings,
        isActive: body.isActive ?? true,
        accountSize: body.accountSize,
        price: body.price,
        currency: body.currency ?? "USD",
        rulesetId: body.rulesetId,
        displayOrder: body.displayOrder ?? 0,
      },
    });

    return NextResponse.json(
      { success: true, product },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create product" },
      { status: 500 }
    );
  }
}

function validateProductInput(body: Record<string, unknown>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  if (!body.name || typeof body.name !== "string" || body.name.length > 100) {
    errors.name = "Name is required and must be 100 characters or less";
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
