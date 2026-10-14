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
  const rulesets = await prisma.ruleset.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      versions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          version: true,
          status: true,
          effectiveDate: true,
          rules: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              ruleType: true,
              value: true,
              isRequired: true,
              disposition: true,
              calculation: true,
              effectiveDate: true,
            },
          },
        },
      },
    },
  });
  return NextResponse.json({ success: true, rulesets }, { status: 200 });
}
