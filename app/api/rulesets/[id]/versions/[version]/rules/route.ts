import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { validateRuleDraftInput } from "@/lib/product-domain";


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

  if (rulesetVersion.status !== "PUBLISHED") {
    const trader = await getAuthenticatedUser(request);
    if (!trader || trader.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Ruleset version not found" }, { status: 404 });
    }
  }

  const rules = await prisma.rule.findMany({
    where: { rulesetVersionId: rulesetVersion.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, ruleType: true, value: true, isRequired: true, disposition: true, calculation: true, effectiveDate: true },
  });

  return NextResponse.json({ success: true, rules }, { status: 200 });
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
  if (trader.role !== "ADMIN") {
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
