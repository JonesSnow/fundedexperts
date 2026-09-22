import { PrismaClient, AccountStatus, MT5Account } from "@prisma/client";
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

type StatusTransition = Record<AccountStatus, AccountStatus[]>;

const VALID_TRANSITIONS: StatusTransition = {
  AVAILABLE: ["IN_USE", "INACTIVE", "MAINTENANCE"],
  IN_USE: ["INACTIVE", "MAINTENANCE"],
  INACTIVE: ["AVAILABLE", "MAINTENANCE"],
  MAINTENANCE: ["AVAILABLE", "INACTIVE"],
};

function isValidTransition(from: AccountStatus, to: AccountStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
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
    const { status, adminOverride } = body as { status?: AccountStatus; adminOverride?: boolean };

    if (!status || !Object.values(AccountStatus).includes(status as AccountStatus)) {
      return NextResponse.json(
        { success: false, error: "Valid status is required: AVAILABLE, IN_USE, INACTIVE, MAINTENANCE" },
        { status: 400 }
      );
    }

    const newStatus = status as AccountStatus;
    if (newStatus === account.status) {
      return NextResponse.json(
        { success: true, account: omitCredentials(account) },
        { status: 200 }
      );
    }

    if (!isValidTransition(account.status, newStatus)) {
      return NextResponse.json(
        { success: false, error: `Invalid status transition from ${account.status} to ${newStatus}` },
        { status: 400 }
      );
    }

    if (newStatus === "IN_USE") {
      const activeAssignment = await prisma.accountAssignment.findFirst({
        where: { accountId: id, status: "ASSIGNED" },
      });
      if (!activeAssignment) {
        return NextResponse.json(
          { success: false, error: "Cannot set IN_USE: no active assignment exists" },
          { status: 409 }
        );
      }
    }

    if (newStatus === "AVAILABLE") {
      const activeAssignment = await prisma.accountAssignment.findFirst({
        where: { accountId: id, status: "ASSIGNED" },
      });
      if (activeAssignment) {
        if (adminOverride === true) {
          await prisma.auditLog.create({
            data: {
              action: "ACCOUNT_UPDATED",
              entityType: "MT5Account",
              entityId: account.id,
              performedBy: trader.id,
              details: {
                accountNumber: account.accountNumber,
                statusChange: { from: account.status, to: newStatus },
                adminOverride: true,
                reason: "Admin override: AVAILABLE while active assignment exists",
              },
            },
          });
        } else {
          return NextResponse.json(
            { success: false, error: "Cannot set AVAILABLE: active assignment exists. Use adminOverride flag to force." },
            { status: 409 }
          );
        }
      }
    }

    const updated = await prisma.mT5Account.update({
      where: { id },
      data: {
        status: newStatus,
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
          statusChange: { from: account.status, to: newStatus },
          adminOverride: adminOverride === true,
        },
      },
    });

    return NextResponse.json(
      { success: true, account: omitCredentials(updated) },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update account status" },
      { status: 500 }
    );
  }
}
