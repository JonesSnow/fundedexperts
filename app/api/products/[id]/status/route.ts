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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const trader = await getAdmin(request);
  if (!trader) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "A status transition is required" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || !["UNAVAILABLE", "RETIRED"].includes(String((body as Record<string, unknown>).status))) {
    return NextResponse.json({ success: false, error: "Status must be UNAVAILABLE or RETIRED" }, { status: 400 });
  }
  const targetStatus = (body as { status: "UNAVAILABLE" | "RETIRED" }).status;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id }, select: { id: true, code: true, status: true } });
      if (!current) return { kind: "missing" as const };
      if (current.status === "RETIRED") return { kind: "conflict" as const };
      if (targetStatus === "UNAVAILABLE" && current.status !== "ACTIVE") return { kind: "conflict" as const };
      const updated = await tx.product.update({
        where: { id },
        data: { status: targetStatus, isActive: false },
      });
      await tx.auditLog.create({
        data: {
          action: "PRODUCT_UPDATED",
          entityType: "Product",
          entityId: id,
          performedBy: trader.id,
          details: { event: targetStatus === "RETIRED" ? "PRODUCT_RETIRED" : "PRODUCT_UNAVAILABLE", code: current.code, from: current.status, to: targetStatus },
        },
      });
      return { kind: "updated" as const, product: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.kind === "missing") return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    if (result.kind === "conflict") return NextResponse.json({ success: false, error: "Invalid product status transition" }, { status: 409 });
    return NextResponse.json({ success: true, product: result.product }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update product status" }, { status: 500 });
  }
}
