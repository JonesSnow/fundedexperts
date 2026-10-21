import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { validateProductForPublication } from "@/lib/product-domain";
import { productTermsFingerprint } from "@/lib/product-approval";

async function getAdmin(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, status: true },
  });
  return isActiveAdministrator(trader) ? trader : null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const trader = await getAdmin(request);
  if (!trader) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const ownerTraderId = process.env.PRODUCT_OWNER_TRADER_ID?.trim();
  if (!ownerTraderId) {
    return NextResponse.json({ success: false, error: "Product owner approval is not configured" }, { status: 503 });
  }
  if (trader.id !== ownerTraderId) {
    return NextResponse.json({ success: false, error: "Only the configured product owner can approve customer terms" }, { status: 403 });
  }

  const { id } = await params;
  try {
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

      // Touch the draft row conditionally so a concurrent edit cannot be
      // mistaken for the terms the owner just reviewed.
      const locked = await tx.product.updateMany({
        where: { id, status: "DRAFT", updatedAt: product.updatedAt },
        data: { updatedAt: product.updatedAt },
      });
      if (locked.count !== 1) return { kind: "conflict" as const };

      const termsFingerprint = productTermsFingerprint(product);
      await tx.auditLog.create({
        data: {
          action: "PRODUCT_UPDATED",
          entityType: "Product",
          entityId: id,
          performedBy: trader.id,
          details: {
            event: "PRODUCT_TERMS_APPROVED",
            termsFingerprint,
            productCode: product.code,
            productUpdatedAt: product.updatedAt.toISOString(),
          },
        },
      });
      return { kind: "approved" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "missing") return NextResponse.json({ success: false, error: "Draft product not found" }, { status: 404 });
    if (result.kind === "invalid") return NextResponse.json({ success: false, error: "Product terms are not publication-ready", errors: result.errors }, { status: 409 });
    if (result.kind === "conflict") return NextResponse.json({ success: false, error: "Product changed during approval; reload and review it again" }, { status: 409 });
    return NextResponse.json({ success: true, message: "Owner approval recorded for the current saved terms" }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, error: "Unable to record product approval" }, { status: 500 });
  }
}
