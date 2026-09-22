import { PrismaClient, MT5HealthStatus, MT5Account } from "@prisma/client";
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

function omitCredentials(account: MT5Account) {
  const { credentials: _credentials, ...rest } = account;
  return rest;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  try {
    const account = await prisma.mT5Account.findUnique({
      where: { id },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { healthStatus } = body;

    if (!healthStatus || !Object.values(MT5HealthStatus).includes(healthStatus as MT5HealthStatus)) {
      return NextResponse.json(
        { success: false, error: "Valid healthStatus is required: CONNECTED, DISCONNECTED, ERROR" },
        { status: 400 }
      );
    }

    const updated = await prisma.mT5Account.update({
      where: { id },
      data: {
        healthStatus,
        lastHealthCheck: new Date(),
        updatedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "ACCOUNT_UPDATED",
        entityType: "MT5Account",
        entityId: account.id,
        performedBy: trader.id,
        details: {
          accountNumber: account.accountNumber,
          healthChange: { from: account.healthStatus, to: healthStatus },
        },
      },
    });

    return NextResponse.json(
      { success: true, account: omitCredentials(updated) },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update health status" },
      { status: 500 }
    );
  }
}
