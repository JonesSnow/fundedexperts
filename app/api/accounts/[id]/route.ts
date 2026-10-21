import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { MT5Account } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { buildMt5CredentialUpdateData, prepareMt5Credentials } from "@/lib/mt5-credential-storage";
import { prisma } from "@/lib/db";


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
  return { ...rest, credentialsConfigured: Boolean(credentials) };
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
  if (!isActiveAdministrator(trader)) {
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

    return NextResponse.json(
      { success: true, account: omitCredentials(account) },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch account" },
      { status: 500 }
    );
  }
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
  if (!isActiveAdministrator(trader)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const existing = await prisma.mT5Account.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const errors: Record<string, string> = {};

    if (body.accountNumber !== undefined) {
      if (typeof body.accountNumber !== "string" || body.accountNumber.length > 50) {
        errors.accountNumber = "Account number must be 50 characters or less";
      } else {
        const dup = await prisma.mT5Account.findUnique({
          where: { accountNumber: body.accountNumber },
        });
        if (dup && dup.id !== id) {
          errors.accountNumber = "Account number already in use";
        }
      }
    }
    if (body.broker !== undefined && typeof body.broker !== "string") {
      errors.broker = "Broker must be a string";
    }
    if (body.server !== undefined && typeof body.server !== "string") {
      errors.server = "Server must be a string";
    }
    if (body.login !== undefined && typeof body.login !== "string") {
      errors.login = "Login must be a string";
    }
    if (body.accountSize !== undefined && (typeof body.accountSize !== "number" || body.accountSize <= 0)) {
      errors.accountSize = "Account size must be a positive number";
    }
    if (body.currency !== undefined && typeof body.currency !== "string") {
      errors.currency = "Currency must be a string";
    }
    if (body.purpose !== undefined && body.purpose !== null && !["EVALUATION", "FUNDED", "OTHER"].includes(body.purpose)) {
      errors.purpose = "Purpose must be one of: EVALUATION, FUNDED, OTHER";
    }
    if (body.notes !== undefined && typeof body.notes !== "string") {
      errors.notes = "Notes must be a string";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    let encryptedCredentials: string | null = null;
    if (body.credentials !== undefined) {
      const prepared = prepareMt5Credentials(body.credentials);
      if (!prepared.ok) {
        errors.credentials = prepared.reason === "invalid"
          ? "Credentials must include a positive login, password, and server."
          : "Encryption key not configured — cannot store credentials";
      } else {
        encryptedCredentials = prepared.value ?? null;
      }
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    const account = await prisma.$transaction(async (tx) => {
      const updated = await tx.mT5Account.update({
        where: { id },
        data: {
          accountNumber: body.accountNumber ?? existing.accountNumber,
          broker: body.broker ?? existing.broker,
          server: body.server ?? existing.server,
          login: body.login ?? existing.login,
          accountSize: body.accountSize ?? existing.accountSize,
          currency: body.currency ?? existing.currency,
          purpose: body.purpose ?? existing.purpose,
          ...buildMt5CredentialUpdateData(
            body.credentials !== undefined,
            encryptedCredentials,
          ),
          notes: body.notes ?? existing.notes,
          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_UPDATED",
          entityType: "MT5Account",
          entityId: updated.id,
          performedBy: trader.id,
          details: {
            accountNumber: updated.accountNumber,
            changes: Object.keys(body).filter((k) => k !== "credentials"),
            credentialsChanged: body.credentials !== undefined,
          },
        },
      });

      return updated;
    });

    return NextResponse.json(
      { success: true, account: omitCredentials(account) },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update account" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
  if (!isActiveAdministrator(trader)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const deletion = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "MT5Account" WHERE "id" = ${id} FOR UPDATE
      `;
      if (locked.length === 0) return { kind: "missing" as const };

      const account = await tx.mT5Account.findUnique({
        where: { id },
        select: { id: true, accountNumber: true },
      });
      if (!account) return { kind: "missing" as const };

      const [assignments, evaluations, fundedAccounts, ruleEvents] = await Promise.all([
        tx.accountAssignment.count({ where: { accountId: id } }),
        tx.evaluation.count({ where: { accountId: id } }),
        tx.fundedAccount.count({ where: { accountId: id } }),
        tx.ruleEvent.count({ where: { accountId: id } }),
      ]);
      const hasDependencies = assignments > 0 || evaluations > 0 || fundedAccounts > 0 || ruleEvents > 0;
      if (hasDependencies) return { kind: "dependent" as const };

      await tx.mT5Account.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_UPDATED",
          entityType: "MT5Account",
          entityId: account.id,
          performedBy: trader.id,
          details: {
            accountNumber: account.accountNumber,
            action: "DELETED",
          },
        },
      });

      return { kind: "deleted" as const };
    });

    if (deletion.kind === "missing") {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
    }
    if (deletion.kind === "dependent") {
      return NextResponse.json(
        { success: false, error: "Account has dependent records (assignments, evaluations, funded accounts, or events) and cannot be deleted" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
