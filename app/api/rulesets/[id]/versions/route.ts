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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const versions = await prisma.rulesetVersion.findMany({
    where: { rulesetId: id },
    orderBy: { version: "desc" },
  });

  return NextResponse.json(
    { success: true, versions },
    { status: 200 }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const body = await request.json();
    const version = body.version;
    if (!version || typeof version !== "string") {
      return NextResponse.json(
        { success: false, error: "Version is required" },
        { status: 400 }
      );
    }

    const ruleset = await prisma.ruleset.findUnique({
      where: { id },
    });
    if (!ruleset) {
      return NextResponse.json(
        { success: false, error: "Ruleset not found" },
        { status: 404 }
      );
    }

    const existing = await prisma.rulesetVersion.findUnique({
      where: { rulesetId_version: { rulesetId: id, version } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Version already exists" },
        { status: 409 }
      );
    }

    const rulesetVersion = await prisma.rulesetVersion.create({
      data: {
        version,
        rulesetId: id,
        status: "DRAFT",
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
      },
    });

    return NextResponse.json(
      { success: true, rulesetVersion },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create version" },
      { status: 500 }
    );
  }
}
