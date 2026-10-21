import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { prisma } from "@/lib/db";
import {
  approvedPublicProducts,
  PUBLIC_PRODUCT_SELECT,
  PUBLIC_PRODUCT_WHERE,
  publicApiFailure,
  publicApiStatus,
  publicRulesetsForProducts,
  safePrismaErrorCode,
} from "@/lib/public-catalog";
import type { PublicRulesetsResponse } from "@/lib/product-experience";

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

export async function GET() {
  const correlationId = generateCorrelationId();
  try {
    const records = await prisma.product.findMany({
      where: PUBLIC_PRODUCT_WHERE,
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });
    const response: PublicRulesetsResponse = {
      success: true,
      rulesets: publicRulesetsForProducts(approvedPublicProducts(records)),
    };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    logger.error("RULESET", "Public ruleset retrieval failed", {
      correlationId,
      error: { code: safePrismaErrorCode(error), message: "Unable to query or serialize approved product rules" },
    });
    return NextResponse.json(
      publicApiFailure("SERVICE_UNAVAILABLE", "Published plan rules are temporarily unavailable. Please try again.", correlationId),
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
      return NextResponse.json(
        { success: false, error: "A ruleset draft object is required" },
        { status: 400 }
      );
    }
    const record = body as Record<string, unknown>;
    const name = record.name;
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.ruleset.findUnique({
      where: { name },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ruleset name already exists" },
        { status: 409 }
      );
    }

    const ruleset = await prisma.$transaction(async (tx) => {
      const created = await tx.ruleset.create({
        data: {
          name,
          description: typeof record.description === "string" ? record.description : undefined,
          isActive: true,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "RULESET_CREATED",
          entityType: "Ruleset",
          entityId: created.id,
          performedBy: trader.id,
          details: { name: created.name },
        },
      });
      return created;
    });

    return NextResponse.json(
      { success: true, ruleset },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ruleset name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to create ruleset" },
      { status: 500 }
    );
  }
}
