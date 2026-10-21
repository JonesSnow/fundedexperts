import { NextRequest, NextResponse } from "next/server";
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  try {
    const products = await prisma.product.findMany({
      where: PUBLIC_PRODUCT_WHERE,
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });
    const publicRuleset = publicRulesetsForProducts(approvedPublicProducts(products))
      .find((candidate) => candidate.id === id);
    const ruleset = publicRuleset
      ? { ...publicRuleset, versions: [...publicRuleset.versions].sort((left, right) => right.version.localeCompare(left.version)) }
      : null;

    if (!ruleset) {
      return NextResponse.json(
        { success: false, error: "Ruleset not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, ruleset }, { status: 200 });
  } catch (error) {
    logger.error("RULESET", "Public ruleset detail retrieval failed", {
      correlationId,
      error: { code: safePrismaErrorCode(error), message: "Unable to query approved product rules" },
    });
    return NextResponse.json(
      publicApiFailure("SERVICE_UNAVAILABLE", "Published plan rules are temporarily unavailable. Please try again.", correlationId),
      { status: publicApiStatus("SERVICE_UNAVAILABLE") },
    );
  }
}
