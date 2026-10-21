import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { checkClientRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { hasDuplicateProductCode, validateProductDraftInput } from "@/lib/product-domain";
import {
  approvedPublicProducts,
  publicApiStatus,
  PUBLIC_PRODUCT_SELECT,
  PUBLIC_PRODUCT_WHERE,
  publicApiFailure,
  safePrismaErrorCode,
  safePrismaErrorTable,
  serializePublicProduct,
} from "@/lib/public-catalog";
import type { PublicProductsResponse } from "@/lib/product-experience";

const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

async function getAuthenticatedUser(request: NextRequest) {
  const { getSessionCookie, getSession } = await import("@/lib/auth/session");
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
  const correlationId = generateCorrelationId();
  const rateLimit = checkClientRateLimit(request, "products:list", 60);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      publicApiFailure("RATE_LIMITED", "Too many attempts. Please try again later.", correlationId),
      { status: publicApiStatus("RATE_LIMITED"), headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  try {
    const records = await prisma.product.findMany({
      where: PUBLIC_PRODUCT_WHERE,
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });
    const products = approvedPublicProducts(records).map(serializePublicProduct);
    const response: PublicProductsResponse = { success: true, products };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    logger.error("PRODUCT", "Public product catalog retrieval failed", {
      correlationId,
      metadata: { table: safePrismaErrorTable(error) },
      error: { code: safePrismaErrorCode(error), message: "Unable to query or serialize approved products" },
    });
    return NextResponse.json(
      publicApiFailure("SERVICE_UNAVAILABLE", "The plan catalog is temporarily unavailable. Please try again.", correlationId),
      { status: publicApiStatus("SERVICE_UNAVAILABLE") },
    );
  }
}

export async function POST(request: NextRequest) {
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!isActiveAdministrator(trader)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A product draft object is required" }, { status: 400 });
    }
    const validation = validateProductDraftInput(body as Record<string, unknown>);
    if (!validation.valid || !validation.data) {
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 }
      );
    }

    const data = validation.data;
    const duplicateName = await prisma.product.findUnique({ where: { name: data.name }, select: { id: true } });
    const duplicateCode = data.code
      ? await prisma.product.findUnique({ where: { code: data.code }, select: { code: true } })
      : null;
    if (duplicateName || hasDuplicateProductCode(data.code ?? null, duplicateCode ? [duplicateCode.code] : [])) {
      return NextResponse.json(
        { success: false, error: "Product name or code already exists" },
        { status: 409 }
      );
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: data.name,
          code: data.code ?? null,
          description: data.description ?? null,
          category: data.category,
          evaluationStructure: data.evaluationStructure,
          status: "DRAFT",
          isActive: false,
          accountSize: data.accountSize ? new Prisma.Decimal(data.accountSize) : null,
          price: data.price ? new Prisma.Decimal(data.price) : null,
          currency: data.currency ?? "USD",
          denominationCurrency: data.denominationCurrency ?? null,
          displayOrder: data.displayOrder ?? 0,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "PRODUCT_CREATED",
          entityType: "Product",
          entityId: created.id,
          performedBy: trader.id,
          details: { code: created.code, status: "DRAFT" },
        },
      });
      return created;
    });

    return NextResponse.json(
      { success: true, product },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ success: false, error: "Product name or code already exists" }, { status: 409 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to create product" },
      { status: 500 }
    );
  }
}
