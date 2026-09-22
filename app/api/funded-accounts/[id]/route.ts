import {
  PrismaClient,
  FundedAccountStatus,
  AuditAction,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import {
  approveFundedAccount,
  linkAccount,
  transitionFundedAccountStatus,
  getFundedAccount,
} from "@/lib/funded-account";

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
  { params }: { params: Promise<{ id: string }> },
) {
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  try {
    const result = await getFundedAccount(prisma, id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 404 },
      );
    }

    const account = result.account;

    if (trader.role !== "ADMIN" && account.traderId !== trader.id) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { success: true, account },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch funded account" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  if (trader.role !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { status, reason, accountId } = body as {
      status?: FundedAccountStatus;
      reason?: string;
      accountId?: string;
    };

    if (!status || !Object.values(FundedAccountStatus).includes(status)) {
      return NextResponse.json(
        { success: false, error: "Valid status is required" },
        { status: 400 },
      );
    }

    if (accountId) {
      const linkResult = await linkAccount(prisma, {
        fundedAccountId: id,
        accountId: accountId,
        performedBy: trader.id,
      });

      if (!linkResult.success) {
        return NextResponse.json(
          { success: false, error: linkResult.error },
          { status: linkResult.errorCategory === "NOT_FOUND" ? 404 : 400 },
        );
      }

      return NextResponse.json(
        { success: true, account: linkResult.account },
        { status: 200 },
      );
    }

    const result = await transitionFundedAccountStatus(prisma, {
      id,
      status,
      reason,
      performedBy: trader.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.errorCategory === "NOT_FOUND" ? 404 : 400 },
      );
    }

    return NextResponse.json(
      { success: true, account: result.account },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update funded account" },
      { status: 500 },
    );
  }
}
