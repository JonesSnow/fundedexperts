import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import {
  approvedPublicProducts,
  publicApiFailure,
  publicApiStatus,
  publicRulesetsForProducts,
  PUBLIC_PRODUCT_SELECT,
  PUBLIC_PRODUCT_WHERE,
  safePrismaErrorCode,
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
  const { id } = await params;
  const correlationId = generateCorrelationId();
  try {
    const trader = await getAuthenticatedUser(request);
    const versions = isActiveAdministrator(trader)
      ? await prisma.rulesetVersion.findMany({
        where: { rulesetId: id },
        orderBy: { version: "desc" },
      })
      : await (async () => {
        const products = await prisma.product.findMany({
          where: PUBLIC_PRODUCT_WHERE,
          select: PUBLIC_PRODUCT_SELECT,
          orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
        });
        const publicVersions = publicRulesetsForProducts(approvedPublicProducts(products))
          .find((ruleset) => ruleset.id === id)?.versions ?? [];
        return [...publicVersions].sort((left, right) => right.version.localeCompare(left.version));
      })();

    return NextResponse.json({ success: true, versions }, { status: 200 });
  } catch (error) {
    logger.error("RULESET", "Ruleset version retrieval failed", {
      correlationId,
      error: { code: safePrismaErrorCode(error), message: "Unable to query approved product rules" },
    });
    return NextResponse.json(
      publicApiFailure("SERVICE_UNAVAILABLE", "Published plan rules are temporarily unavailable. Please try again.", correlationId),
      { status: publicApiStatus("SERVICE_UNAVAILABLE") },
    );
  }
}

export async function POST(
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
    const body = await request.json();
    const version = body.version;
    if (!version || typeof version !== "string") {
      return NextResponse.json(
        { success: false, error: "Version is required" },
        { status: 400 }
      );
    }

    const ruleset = await prisma.ruleset.findUnique({
      where: { id },
    });
    if (!ruleset) {
      return NextResponse.json(
        { success: false, error: "Ruleset not found" },
        { status: 404 }
      );
    }

    const existing = await prisma.rulesetVersion.findUnique({
      where: { rulesetId_version: { rulesetId: id, version } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Version already exists" },
        { status: 409 }
      );
    }

    if (body.effectiveDate !== undefined && body.effectiveDate !== null && (typeof body.effectiveDate !== "string" || Number.isNaN(Date.parse(body.effectiveDate)))) {
      return NextResponse.json({ success: false, error: "Effective date must be a valid date string" }, { status: 400 });
    }
    const rulesetVersion = await prisma.$transaction(async (tx) => {
      const created = await tx.rulesetVersion.create({
        data: {
          version,
          rulesetId: id,
          status: "DRAFT",
          effectiveDate: typeof body.effectiveDate === "string" ? new Date(body.effectiveDate) : undefined,
        },
      });
      await tx.auditLog.create({
        data: { action: "RULESET_VERSION_CREATED", entityType: "RulesetVersion", entityId: created.id, performedBy: trader.id, details: { rulesetId: id, version } },
      });
      return created;
    });

    return NextResponse.json(
      { success: true, rulesetVersion },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create version" },
      { status: 500 }
    );
  }
}
