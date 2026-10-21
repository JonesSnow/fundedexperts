import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { Prisma } from "@prisma/client";
import { getRuleCapability } from "@/lib/rule-capabilities";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { validateRuleDraftInput } from "@/lib/product-domain";
import {
  approvedPublicProducts,
  isValidPublicRulesetIdentifier,
  publicApiFailure,
  publicApiStatus,
  publicRulesForVersion,
  PUBLIC_PRODUCT_SELECT,
  PUBLIC_PRODUCT_WHERE,
  safePrismaErrorCode,
} from "@/lib/public-catalog";
import type { PublicRulesResponse } from "@/lib/product-experience";

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
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const { id, version } = await params;
  const correlationId = generateCorrelationId();
  if (!isValidPublicRulesetIdentifier(id, version)) {
    return NextResponse.json(
      publicApiFailure("INVALID_IDENTIFIER", "The requested ruleset identifier is invalid.", correlationId),
      { status: publicApiStatus("INVALID_IDENTIFIER") },
    );
  }

  try {
    const records = await prisma.product.findMany({
      where: PUBLIC_PRODUCT_WHERE,
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });
    const publicRules = publicRulesForVersion(approvedPublicProducts(records), id, version);
    if (publicRules) {
      const response: PublicRulesResponse = { success: true, rules: publicRules };
      return NextResponse.json(response, { status: 200 });
    }

    const trader = await getAuthenticatedUser(request);
    if (!isActiveAdministrator(trader)) {
      return NextResponse.json(
        publicApiFailure("NOT_FOUND", "Published rules for this plan were not found.", correlationId),
        { status: publicApiStatus("NOT_FOUND") },
      );
    }
    const rulesetVersion = await prisma.rulesetVersion.findFirst({
      where: { rulesetId: id, version },
      select: { id: true },
    });
    if (!rulesetVersion) {
      return NextResponse.json(
        publicApiFailure("NOT_FOUND", "Ruleset version was not found.", correlationId),
        { status: publicApiStatus("NOT_FOUND") },
      );
    }
    const draftRules = await prisma.rule.findMany({
      where: { rulesetVersionId: rulesetVersion.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, ruleType: true, value: true, isRequired: true, disposition: true, calculation: true },
    });
    const rules = draftRules.map((rule) => {
      const capability = getRuleCapability(rule.ruleType);
      return {
        ...rule,
        enforcement: {
          status: capability?.status ?? "UNSUPPORTED" as const,
          details: capability?.reason ?? "No evaluator capability is registered for this rule type.",
        },
      };
    });
    const response: PublicRulesResponse = { success: true, rules };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    logger.error("RULESET", "Published rules retrieval failed", {
      correlationId,
      error: { code: safePrismaErrorCode(error), message: "Unable to query or serialize approved product rules" },
    });
    return NextResponse.json(
      publicApiFailure("SERVICE_UNAVAILABLE", "Published plan rules are temporarily unavailable. Please try again.", correlationId),
      { status: publicApiStatus("SERVICE_UNAVAILABLE") },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const { id, version } = await params;
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
    const rulesetVersion = await prisma.rulesetVersion.findFirst({
      where: { rulesetId: id, version },
      select: { id: true, status: true },
    });
    if (!rulesetVersion) {
      return NextResponse.json(
        { success: false, error: "Ruleset version not found" },
        { status: 404 }
      );
    }
    if (rulesetVersion.status !== "DRAFT") {
      return NextResponse.json({ success: false, error: "Rules can only be changed on a draft version" }, { status: 409 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A rule draft object is required" }, { status: 400 });
    }
    const validation = validateRuleDraftInput(body as Record<string, unknown>);
    if (!validation.valid || !validation.data) return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    const data = validation.data;

    const rule = await prisma.$transaction(async (tx) => {
      const current = await tx.rulesetVersion.findUnique({ where: { id: rulesetVersion.id }, select: { status: true } });
      if (current?.status !== "DRAFT") throw new Error("RULESET_VERSION_IMMUTABLE");
      const created = await tx.rule.create({
        data: {
          rulesetVersionId: rulesetVersion.id,
          ruleType: data.ruleType,
          name: data.name,
          value: data.value === null ? Prisma.DbNull : data.value as Prisma.InputJsonValue,
          isRequired: data.disposition === "REQUIRED",
          disposition: data.disposition,
          calculation: data.calculation === null ? Prisma.DbNull : data.calculation as Prisma.InputJsonValue,
          effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "RULE_CREATED",
          entityType: "Rule",
          entityId: created.id,
          performedBy: trader.id,
          details: { rulesetId: id, version, disposition: data.disposition },
        },
      });
      return created;
    }, { isolationLevel: "Serializable" });

    return NextResponse.json(
      { success: true, rule },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "RULESET_VERSION_IMMUTABLE") {
      return NextResponse.json({ success: false, error: "Rules can only be changed on a draft version" }, { status: 409 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to create rule" },
      { status: 500 }
    );
  }
}
