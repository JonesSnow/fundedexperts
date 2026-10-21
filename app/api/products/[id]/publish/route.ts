import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { validateProductForPublication } from "@/lib/product-domain";
import { isCurrentProductApproval, productTermsFingerprint } from "@/lib/product-approval";

async function getAdmin(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, status: true },
  });
  if (!isActiveAdministrator(trader)) return null;
  return trader;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const trader = await getAdmin(request);
  if (!trader) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const ownerTraderId = process.env.PRODUCT_OWNER_TRADER_ID?.trim();
  if (!ownerTraderId) {
    return NextResponse.json({ success: false, error: "Product owner approval is not configured" }, { status: 503 });
  }

  const { id } = await params;
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id, status: "DRAFT" },
      include: {
        ruleset: { select: { id: true, name: true } },
        stages: {
          orderBy: { stageOrder: "asc" },
          include: { rulesetVersion: { include: { rules: true } } },
        },
        operatingRulesetVersion: { include: { rules: true } },
      },
    });
    if (!product) return { kind: "missing" as const };

    const errors = validateProductForPublication(product);
    if (errors.length > 0) return { kind: "invalid" as const, errors };

    const approval = await tx.auditLog.findFirst({
      where: { entityType: "Product", entityId: id, action: "PRODUCT_UPDATED" },
      orderBy: { timestamp: "desc" },
      select: { performedBy: true, details: true },
    });
    if (!isCurrentProductApproval(approval, ownerTraderId, productTermsFingerprint(product), product.updatedAt)) {
      return { kind: "approval-required" as const };
    }

    const changed = await tx.product.updateMany({
      where: { id, status: "DRAFT", updatedAt: product.updatedAt },
      data: { status: "ACTIVE", isActive: true },
    });
    if (changed.count !== 1) return { kind: "conflict" as const };

    await tx.auditLog.create({
      data: {
        action: "PRODUCT_UPDATED",
        entityType: "Product",
        entityId: id,
        performedBy: trader.id,
        details: {
          event: "PRODUCT_PUBLISHED",
          code: product.code,
          category: product.category,
          evaluationStructure: product.evaluationStructure,
          stageRulesetVersionIds: product.stages.map((stage) => stage.rulesetVersionId),
          operatingRulesetVersionId: product.operatingRulesetVersionId,
        },
      },
    });
    const published = await tx.product.findUnique({ where: { id } });
    return { kind: "published" as const, product: published };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result.kind === "missing") return NextResponse.json({ success: false, error: "Draft product not found" }, { status: 404 });
  if (result.kind === "invalid") return NextResponse.json({ success: false, error: "Product cannot be published", errors: result.errors }, { status: 409 });
  if (result.kind === "approval-required") return NextResponse.json({ success: false, error: "The current saved product terms require approval from the configured product owner" }, { status: 409 });
  if (result.kind === "conflict") return NextResponse.json({ success: false, error: "Product changed during publication; reload and validate again" }, { status: 409 });
  return NextResponse.json({ success: true, product: result.product }, { status: 200 });
}
