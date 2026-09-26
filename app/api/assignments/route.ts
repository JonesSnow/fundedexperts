import { PrismaClient, AccountAssignmentStatus } from "@prisma/client";
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
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const where: Record<string, unknown> = {};
    if (trader.role === "TRADER") {
      where.traderId = trader.id;
    }

    const assignments = await prisma.accountAssignment.findMany({
      where,
      orderBy: { assignedAt: "desc" },
      include: {
        account: {
          select: {
            id: true,
            accountNumber: true,
            broker: true,
            server: true,
            login: true,
            accountSize: true,
            currency: true,
            purpose: true,
            status: true,
            healthStatus: true,
          },
        },
        trader: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, assignments }, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch assignments" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // This endpoint is not needed for now - release is handled via admin or evaluation lifecycle
  return NextResponse.json(
    { success: false, error: "Not implemented" },
    { status: 501 }
  );
}