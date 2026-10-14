import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { validateProductForPublication } from "@/lib/product-domain";

async function getAdmin(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, status: true },
  });
  if (!trader || trader.role !== "ADMIN" || trader.status === "SUSPENDED" || trader.status === "INACTIVE") return null;
  return trader;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const trader = await getAdmin(request);
  if (!trader) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id, status: "DRAFT" },
      include: {
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
  if (result.kind === "conflict") return NextResponse.json({ success: false, error: "Product changed during publication; reload and validate again" }, { status: 409 });
  return NextResponse.json({ success: true, product: result.product }, { status: 200 });
}
