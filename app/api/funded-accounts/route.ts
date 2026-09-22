import {
  PrismaClient,
  FundedAccountStatus,
  AuditAction,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import {
  createFundedAccount,
  approveFundedAccount,
  listFundedAccounts,
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

export async function GET(request: NextRequest) {
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

  try {
    const { search, status, evaluationId } = Object.fromEntries(
      request.nextUrl.searchParams,
    ) as {
      search?: string;
      status?: string;
      evaluationId?: string;
    };

    const where: Record<string, unknown> = {};
    if (status && Object.values(FundedAccountStatus).includes(status as FundedAccountStatus)) {
      where.status = status as FundedAccountStatus;
    }
    if (evaluationId) {
      where.evaluationId = evaluationId;
    }

    const accounts = await prisma.fundedAccount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        evaluation: { select: { id: true, status: true, traderId: true } },
        rulesetVersion: { select: { id: true, version: true } },
        account: { select: { id: true, accountNumber: true, status: true } },
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

export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json();
    const errors: Record<string, string> = {};

    if (!body.evaluationId || typeof body.evaluationId !== "string") {
      errors.evaluationId = "evaluationId is required";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 },
      );
    }

    const result = await createFundedAccount(prisma, {
      evaluationId: body.evaluationId,
      performedBy: trader.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, errorCategory: result.errorCategory },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, account: result.account, wasAlreadyCreated: result.wasAlreadyCreated },
      { status: result.wasAlreadyCreated ? 200 : 201 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create funded account" },
      { status: 500 },
    );
  }
}
