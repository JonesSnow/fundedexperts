import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkClientRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { validateProductDraftInput } from "@/lib/product-domain";
import {
  approvedPublicProducts,
  publicApiFailure,
  publicApiStatus,
  PUBLIC_PRODUCT_SELECT,
  PUBLIC_PRODUCT_WHERE,
  safePrismaErrorCode,
  safePrismaErrorTable,
  serializePublicProduct,
} from "@/lib/public-catalog";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const rateLimit = checkClientRateLimit(request, `product:${id}`, 60);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  try {
    const product = await prisma.product.findFirst({
      where: {
        ...PUBLIC_PRODUCT_WHERE,
        id,
      },
      select: PUBLIC_PRODUCT_SELECT,
    });

    if (!product || approvedPublicProducts([product]).length === 0) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, product: serializePublicProduct(product) }, { status: 200 });
  } catch (error) {
    logger.error("PRODUCT", "Public product detail retrieval failed", {
      correlationId,
      metadata: { table: safePrismaErrorTable(error) },
      error: { code: safePrismaErrorCode(error), message: "Unable to query or serialize the approved product" },
    });
    return NextResponse.json(
      publicApiFailure("SERVICE_UNAVAILABLE", "The plan details are temporarily unavailable. Please try again.", correlationId),
      { status: publicApiStatus("SERVICE_UNAVAILABLE") },
    );
  }
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
    const input = body as Record<string, unknown>;
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      );
    }

    if (existing.status !== "DRAFT") {
      return NextResponse.json({ success: false, error: "Only draft products can be edited. Create a new product revision for future terms." }, { status: 409 });
    }

    const mergedInput: Record<string, unknown> = {
      name: input.name ?? existing.name,
      accountSize: Object.prototype.hasOwnProperty.call(input, "accountSize") ? input.accountSize : existing.accountSize?.toString() ?? null,
      price: Object.prototype.hasOwnProperty.call(input, "price") ? input.price : existing.price?.toString() ?? null,
      currency: input.currency ?? existing.currency,
      displayOrder: input.displayOrder ?? existing.displayOrder,
    };
    const optionalValues: Array<[string, unknown]> = [
      ["code", input.code ?? existing.code ?? undefined],
      ["description", Object.prototype.hasOwnProperty.call(input, "description") ? input.description : existing.description],
      ["category", input.category ?? existing.category ?? undefined],
      ["evaluationStructure", input.evaluationStructure ?? existing.evaluationStructure ?? undefined],
      ["denominationCurrency", input.denominationCurrency ?? existing.denominationCurrency ?? undefined],
    ];
    for (const [key, value] of optionalValues) {
      if (value !== undefined) mergedInput[key] = value;
    }
    if (input.status !== undefined) mergedInput.status = input.status;
    if (input.isActive !== undefined) mergedInput.isActive = input.isActive;
    const validation = validateProductDraftInput(mergedInput);
    if (!validation.valid) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    if (!validation.data) {
      return NextResponse.json({ success: false, error: "Invalid product draft" }, { status: 400 });
    }

    const draft = validation.data;
    const updateData: Prisma.ProductUpdateInput = { isActive: false };
    if ("name" in input) updateData.name = draft.name;
    if ("code" in input) updateData.code = draft.code;
    if ("description" in input) updateData.description = draft.description;
    if ("category" in input) updateData.category = draft.category;
    if ("evaluationStructure" in input) updateData.evaluationStructure = draft.evaluationStructure;
    if ("accountSize" in input) updateData.accountSize = draft.accountSize ? new Prisma.Decimal(draft.accountSize) : null;
    if ("price" in input) updateData.price = draft.price ? new Prisma.Decimal(draft.price) : null;
    if ("currency" in input && draft.currency) updateData.currency = draft.currency;
    if ("denominationCurrency" in input) updateData.denominationCurrency = draft.denominationCurrency;
    if ("displayOrder" in input) updateData.displayOrder = draft.displayOrder;

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          action: "PRODUCT_UPDATED",
          entityType: "Product",
          entityId: id,
          performedBy: trader.id,
          details: { status: "DRAFT", fields: Object.keys(input) },
        },
      });
      return updated;
    });

    return NextResponse.json(
      { success: true, product },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ success: false, error: "Product name or code already exists" }, { status: 409 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to update product" },
      { status: 500 }
    );
  }
}
