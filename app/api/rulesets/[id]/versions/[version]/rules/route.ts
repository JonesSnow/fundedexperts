import { PrismaClient, Rule } from "@prisma/client";
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

async function getRulesetVersionId(
  rulesetId: string,
  version: string
): Promise<string | null> {
  const rv = await prisma.rulesetVersion.findFirst({
    where: { rulesetId, version },
    select: { id: true },
  });
  return rv?.id ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const { id, version } = await params;
  const rulesetVersionId = await getRulesetVersionId(
    id,
    version
  );
  if (!rulesetVersionId) {
    return NextResponse.json(
      { success: false, error: "Ruleset version not found" },
      { status: 404 }
    );
  }

  const rules = await prisma.rule.findMany({
    where: { rulesetVersionId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ success: true, rules }, { status: 200 });
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
    const rulesetVersionId = await getRulesetVersionId(
      id,
      version
    );
    if (!rulesetVersionId) {
      return NextResponse.json(
        { success: false, error: "Ruleset version not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    if (!body.ruleType || !body.name) {
      return NextResponse.json(
        { success: false, error: "ruleType and name are required" },
        { status: 400 }
      );
    }

    const rule = await prisma.rule.create({
      data: {
        rulesetVersionId,
        ruleType: body.ruleType,
        name: body.name,
        value: body.value,
        isRequired: body.isRequired ?? true,
        effectiveDate: body.effectiveDate
          ? new Date(body.effectiveDate)
          : undefined,
      },
    });

    return NextResponse.json(
      { success: true, rule },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create rule" },
      { status: 500 }
    );
  }
}
