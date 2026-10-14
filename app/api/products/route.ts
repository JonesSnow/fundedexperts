import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { hasDuplicateProductCode, validateProductDraftInput, validateProductForPublication } from "@/lib/product-domain";


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

export async function GET() {
  const rateLimit = checkRateLimit("products:list");
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      status: "ACTIVE",
      code: { not: null },
      category: { not: null },
      evaluationStructure: { not: null },
      denominationCurrency: { not: null },
      accountSize: { not: null },
      price: { not: null },
    },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      category: true,
      evaluationStructure: true,
      status: true,
      accountSize: true,
      denominationCurrency: true,
      price: true,
      currency: true,
      displayOrder: true,
      isActive: true,
      ruleset: { select: { name: true } },
      stages: {
        orderBy: { stageOrder: "asc" },
        select: {
          id: true,
          stageKey: true,
          displayName: true,
          stageOrder: true,
          rulesetVersion: {
            select: {
              id: true,
              version: true,
              status: true,
              ruleset: { select: { id: true, name: true } },
              rules: {
                select: {
                  id: true,
                  name: true,
                  ruleType: true,
                  value: true,
                  isRequired: true,
                  disposition: true,
                  calculation: true,
                },
              },
            },
          },
        },
      },
      operatingRulesetVersion: {
        select: {
          id: true,
          version: true,
          status: true,
          ruleset: { select: { id: true, name: true } },
          rules: {
            select: {
              id: true,
              name: true,
              ruleType: true,
              value: true,
              isRequired: true,
              disposition: true,
              calculation: true,
            },
          },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });
  const verifiedProducts = products.filter((product) => validateProductForPublication(product).length === 0);

  return NextResponse.json({ success: true, products: verifiedProducts }, { status: 200 });
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
