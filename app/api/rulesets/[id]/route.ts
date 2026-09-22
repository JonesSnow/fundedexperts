import { PrismaClient, Ruleset } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";

const prisma = new PrismaClient();

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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ruleset = await prisma.ruleset.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { version: "desc" } },
    },
  });

  if (!ruleset) {
    return NextResponse.json(
      { success: false, error: "Ruleset not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, ruleset }, { status: 200 });
}
