import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { validateRuleDraftInput } from "@/lib/product-domain";

async function getAdmin(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({ where: { id: session.sub }, select: { id: true, role: true, status: true } });
  return trader && trader.role === "ADMIN" && trader.status !== "SUSPENDED" && trader.status !== "INACTIVE" ? trader : null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; version: string; ruleId: string }> }) {
  const trader = await getAdmin(request);
  if (!trader) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id, version, ruleId } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Rule configuration is required" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, error: "Rule configuration is required" }, { status: 400 });
  const validation = validateRuleDraftInput(body as Record<string, unknown>);
  if (!validation.valid || !validation.data) return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
  const data = validation.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rulesetVersion = await tx.rulesetVersion.findFirst({ where: { rulesetId: id, version }, select: { id: true, status: true } });
      if (!rulesetVersion) return { kind: "version-missing" as const };
      if (rulesetVersion.status !== "DRAFT") return { kind: "immutable" as const };
      const existing = await tx.rule.findFirst({ where: { id: ruleId, rulesetVersionId: rulesetVersion.id }, select: { id: true } });
      if (!existing) return { kind: "rule-missing" as const };
      const rule = await tx.rule.update({
        where: { id: ruleId },
        data: {
          name: data.name,
          ruleType: data.ruleType,
          disposition: data.disposition,
          isRequired: data.disposition === "REQUIRED",
          value: data.value === null ? Prisma.DbNull : data.value as Prisma.InputJsonValue,
          calculation: data.calculation === null ? Prisma.DbNull : data.calculation as Prisma.InputJsonValue,
          effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : null,
        },
      });
      await tx.auditLog.create({ data: { action: "RULE_UPDATED", entityType: "Rule", entityId: ruleId, performedBy: trader.id, details: { rulesetId: id, version, disposition: data.disposition } } });
      return { kind: "updated" as const, rule };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.kind === "version-missing") return NextResponse.json({ success: false, error: "Ruleset version not found" }, { status: 404 });
    if (result.kind === "immutable") return NextResponse.json({ success: false, error: "Rules can only be changed on a draft version" }, { status: 409 });
    if (result.kind === "rule-missing") return NextResponse.json({ success: false, error: "Rule not found" }, { status: 404 });
    return NextResponse.json({ success: true, rule: result.rule }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update rule" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; version: string; ruleId: string }> }) {
  const trader = await getAdmin(request);
  if (!trader) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id, version, ruleId } = await params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const rulesetVersion = await tx.rulesetVersion.findFirst({ where: { rulesetId: id, version }, select: { id: true, status: true } });
      if (!rulesetVersion) return { kind: "version-missing" as const };
      if (rulesetVersion.status !== "DRAFT") return { kind: "immutable" as const };
      const existing = await tx.rule.findFirst({ where: { id: ruleId, rulesetVersionId: rulesetVersion.id }, select: { id: true } });
      if (!existing) return { kind: "rule-missing" as const };
      await tx.rule.delete({ where: { id: ruleId } });
      await tx.auditLog.create({ data: { action: "RULE_DELETED", entityType: "Rule", entityId: ruleId, performedBy: trader.id, details: { rulesetId: id, version } } });
      return { kind: "deleted" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.kind === "version-missing") return NextResponse.json({ success: false, error: "Ruleset version not found" }, { status: 404 });
    if (result.kind === "immutable") return NextResponse.json({ success: false, error: "Rules can only be changed on a draft version" }, { status: 409 });
    if (result.kind === "rule-missing") return NextResponse.json({ success: false, error: "Rule not found" }, { status: 404 });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete rule" }, { status: 500 });
  }
}
