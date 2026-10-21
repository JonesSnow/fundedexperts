import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

async function getAdmin(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({ where: { id: session.sub }, select: { id: true, role: true, status: true } });
  return isActiveAdministrator(trader) ? trader : null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  const trader = await getAdmin(request);
  if (!trader) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id, stageId } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Stage configuration is required" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, error: "Stage configuration is required" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const stageKey = input.stageKey;
  const displayName = input.displayName;
  const stageOrder = input.stageOrder;
  const rulesetVersionId = input.rulesetVersionId;
  if (typeof stageKey !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stageKey) ||
      typeof displayName !== "string" || displayName.trim().length < 1 || displayName.length > 80 ||
      typeof stageOrder !== "number" || !Number.isInteger(stageOrder) || stageOrder < 1 ||
      typeof rulesetVersionId !== "string" || rulesetVersionId.length < 1) {
    return NextResponse.json({ success: false, error: "Stage requires a stable key, name, positive order, and ruleset version" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const stage = await tx.productStage.findFirst({ where: { id: stageId, productId: id }, include: { product: { select: { status: true } } } });
      if (!stage) return { kind: "missing" as const };
      if (stage.product.status !== "DRAFT") return { kind: "conflict" as const };
      const version = await tx.rulesetVersion.findUnique({ where: { id: rulesetVersionId }, select: { id: true } });
      if (!version) return { kind: "version-missing" as const };
      const updated = await tx.productStage.update({
        where: { id: stageId },
        data: { stageKey, displayName: displayName.trim(), stageOrder, rulesetVersionId: version.id },
        include: { rulesetVersion: { select: { id: true, version: true, status: true } } },
      });
      await tx.product.update({ where: { id }, data: { updatedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          action: "PRODUCT_UPDATED",
          entityType: "Product",
          entityId: id,
          performedBy: trader.id,
          details: { event: "PRODUCT_STAGE_UPDATED", stageId, stageKey, rulesetVersionId: version.id },
        },
      });
      return { kind: "updated" as const, stage: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.kind === "missing") return NextResponse.json({ success: false, error: "Product stage not found" }, { status: 404 });
    if (result.kind === "conflict") return NextResponse.json({ success: false, error: "Stages can only be changed while the product is a draft" }, { status: 409 });
    if (result.kind === "version-missing") return NextResponse.json({ success: false, error: "Ruleset version not found" }, { status: 404 });
    return NextResponse.json({ success: true, stage: result.stage }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ success: false, error: "Stage key or order already exists for this product" }, { status: 409 });
    return NextResponse.json({ success: false, error: "Failed to update product stage" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  const trader = await getAdmin(request);
  if (!trader) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id, stageId } = await params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const stage = await tx.productStage.findFirst({ where: { id: stageId, productId: id }, include: { product: { select: { status: true } } } });
      if (!stage) return { kind: "missing" as const };
      if (stage.product.status !== "DRAFT") return { kind: "conflict" as const };
      await tx.productStage.delete({ where: { id: stageId } });
      await tx.product.update({ where: { id }, data: { updatedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          action: "PRODUCT_UPDATED",
          entityType: "Product",
          entityId: id,
          performedBy: trader.id,
          details: { event: "PRODUCT_STAGE_REMOVED", stageId, stageKey: stage.stageKey },
        },
      });
      return { kind: "deleted" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.kind === "missing") return NextResponse.json({ success: false, error: "Product stage not found" }, { status: 404 });
    if (result.kind === "conflict") return NextResponse.json({ success: false, error: "Stages can only be changed while the product is a draft" }, { status: 409 });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return NextResponse.json({ success: false, error: "This stage is already referenced by an evaluation and cannot be removed" }, { status: 409 });
    return NextResponse.json({ success: false, error: "Failed to remove product stage" }, { status: 500 });
  }
}
