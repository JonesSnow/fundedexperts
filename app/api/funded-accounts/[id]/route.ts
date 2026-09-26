import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { getFundedAccount } from "@/lib/funded-account";

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
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;

  try {
    const where: Record<string, unknown> = { id };
    if (trader.role === "TRADER") {
      where.traderId = trader.id;
    }

    const result = await getFundedAccount(prisma, id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, errorCategory: result.errorCategory },
        { status: 404 }
      );
    }

    const account = result.account;

    return NextResponse.json(
      {
        success: true,
        account: {
          id: account.id,
          status: account.status,
          traderId: account.traderId,
          evaluationId: account.evaluationId,
          rulesetVersionId: account.rulesetVersionId,
          accountId: account.accountId,
          allocatedAt: account.allocatedAt,
          activatedAt: account.activatedAt,
          closedAt: account.closedAt,
          totalPnl: Number(account.totalPnl ?? 0),
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch funded account" },
      { status: 500 }
    );
  }
}