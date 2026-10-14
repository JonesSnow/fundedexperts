import { FundedAccountStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";


async function getAuthenticatedTrader(request: NextRequest) {
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
  if (trader.role !== "TRADER") {
    return null;
  }
  return trader;
}

export async function GET(request: NextRequest) {
  const trader = await getAuthenticatedTrader(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const { status } = Object.fromEntries(request.nextUrl.searchParams) as {
      status?: string;
    };

    const where: Record<string, unknown> = { traderId: trader.id };
    if (status && Object.values(FundedAccountStatus).includes(status as FundedAccountStatus)) {
      where.status = status as FundedAccountStatus;
    }

    const accounts = await prisma.fundedAccount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        evaluation: {
          select: {
            id: true,
            status: true,
            rulesetVersion: {
              select: { id: true, version: true, ruleset: { select: { name: true } } },
            },
          },
        },
        rulesetVersion: { select: { id: true, version: true } },
        account: {
          select: {
            id: true,
            accountNumber: true,
            broker: true,
            server: true,
            status: true,
            healthStatus: true,
            accountSize: true,
            currency: true,
            lastMonitoringAt: true,
            currentMonitoringStatus: true,
            currentMonitoringResult: true,
          },
        },
      },
    });

    return NextResponse.json(
      { success: true, accounts },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to list funded accounts" },
      { status: 500 },
    );
  }
}