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

export async function GET(request: NextRequest) {
  const rulesets = await prisma.ruleset.findMany({
    where: { isActive: true },
    include: { versions: { orderBy: { version: "desc" } } },
  });

  return NextResponse.json({ success: true, rulesets }, { status: 200 });
}

export async function POST(request: NextRequest) {
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
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.ruleset.findUnique({
      where: { name: body.name },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ruleset name already exists" },
        { status: 409 }
      );
    }

    const ruleset = await prisma.ruleset.create({
      data: {
        name: body.name,
        description: body.description,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json(
      { success: true, ruleset },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create ruleset" },
      { status: 500 }
    );
  }
}
