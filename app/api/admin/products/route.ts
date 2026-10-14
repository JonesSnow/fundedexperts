import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

async function getAdmin(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({ where: { id: session.sub }, select: { id: true, role: true, status: true } });
  return trader && trader.role === "ADMIN" && trader.status !== "SUSPENDED" && trader.status !== "INACTIVE" ? trader : null;
}

export async function GET(request: NextRequest) {
  const trader = await getAdmin(request);
  if (!trader) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const products = await prisma.product.findMany({
    orderBy: [{ status: "asc" }, { displayOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      category: true,
      evaluationStructure: true,
      status: true,
      isActive: true,
      accountSize: true,
      denominationCurrency: true,
      price: true,
      currency: true,
      rulesetId: true,
      operatingRulesetVersionId: true,
      displayOrder: true,
      updatedAt: true,
      stages: {
        orderBy: { stageOrder: "asc" },
        select: {
          id: true,
          stageKey: true,
          displayName: true,
          stageOrder: true,
          rulesetVersion: { select: { id: true, version: true, status: true, ruleset: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  return NextResponse.json({ success: true, products }, { status: 200 });
}
