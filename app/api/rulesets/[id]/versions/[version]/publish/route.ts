import { PrismaClient, RulesetVersion } from "@prisma/client";
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
      where: {
        rulesetId: id,
        version,
      },
    });

    if (!rulesetVersion) {
      return NextResponse.json(
        { success: false, error: "Ruleset version not found" },
        { status: 404 }
      );
    }

    if (rulesetVersion.status !== "DRAFT") {
      return NextResponse.json(
        { success: false, error: "Only draft versions can be published" },
        { status: 409 }
      );
    }

    const published = await prisma.rulesetVersion.update({
      where: { id: rulesetVersion.id },
      data: {
        status: "PUBLISHED",
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      { success: true, rulesetVersion: published },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to publish version" },
      { status: 500 }
    );
  }
}
