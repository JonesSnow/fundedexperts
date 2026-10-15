import { AccountStatus, MT5Account } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { evaluateMt5AccountStatusChange, type Mt5AccountStatus } from "@/lib/mt5-account-status-policy";


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
  const { credentials, ...rest } = account;
  void credentials;
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
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: "A status transition is required" },
        { status: 400 }
      );
    }
    const status = (body as Record<string, unknown>).status;
    if (typeof status !== "string" || !Object.values(AccountStatus).includes(status as AccountStatus)) {
      return NextResponse.json(
        { success: false, error: "Valid status is required: AVAILABLE, IN_USE, INACTIVE, MAINTENANCE" },
        { status: 400 }
      );
    }
    const newStatus = status as AccountStatus;

    const transition = await prisma.$transaction(async (tx) => {
      // Serialize admin transitions with allocator reservations of this account row.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "MT5Account" WHERE "id" = ${id} FOR UPDATE
      `;
      if (locked.length === 0) return { kind: "missing" as const };

      const account = await tx.mT5Account.findUnique({ where: { id } });
      if (!account) return { kind: "missing" as const };
      const activeAssignment = await tx.accountAssignment.findFirst({
        where: { accountId: id, status: "ASSIGNED" },
      });
      const decision = evaluateMt5AccountStatusChange(
        account.status as Mt5AccountStatus,
        newStatus as Mt5AccountStatus,
        Boolean(activeAssignment),
      );
      if (decision.kind !== "allowed") return decision;
      if (newStatus === account.status) {
        return { kind: "updated" as const, account };
      }

      const changed = await tx.mT5Account.updateMany({
        where: { id, status: account.status },
        data: { status: newStatus, updatedAt: new Date() },
      });
      if (changed.count !== 1) return { kind: "conflict" as const };
      const updated = await tx.mT5Account.findUnique({ where: { id } });
      if (!updated) return { kind: "missing" as const };

      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_UPDATED",
          entityType: "MT5Account",
          entityId: account.id,
          performedBy: trader.id,
          details: {
            accountNumber: account.accountNumber,
            statusChange: { from: account.status, to: newStatus },
          },
        },
      });
      return { kind: "updated" as const, account: updated };
    });

    if (transition.kind === "missing") {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
    }
    if (transition.kind === "invalid-transition") {
      return NextResponse.json(
        { success: false, error: `Invalid status transition from ${transition.from} to ${newStatus}` },
        { status: 400 },
      );
    }
    if (transition.kind === "assignment-conflict") {
      return NextResponse.json({ success: false, error: transition.message }, { status: 409 });
    }
    if (transition.kind === "conflict") {
      return NextResponse.json({ success: false, error: "Account status changed; reload and try again." }, { status: 409 });
    }

    return NextResponse.json(
      { success: true, account: omitCredentials(transition.account) },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update account status" },
      { status: 500 }
    );
  }
}
