import { PrismaClient, MT5Account } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { encryptIfEnabled } from "@/lib/encryption";

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
  if (trader.role !== "ADMIN") {
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
      if (body.credentials !== null && typeof body.credentials !== "string") {
        errors.credentials = "Credentials must be a string";
      } else if (body.credentials !== null) {
        try {
          encryptedCredentials = encryptIfEnabled(body.credentials);
        } catch {
          errors.credentials = "Encryption key not configured — cannot store credentials";
        }
      } else {
        encryptedCredentials = null;
      }
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    const account = await prisma.mT5Account.update({
      where: { id },
      data: {
        accountNumber: body.accountNumber ?? existing.accountNumber,
        broker: body.broker ?? existing.broker,
        server: body.server ?? existing.server,
        login: body.login ?? existing.login,
        accountSize: body.accountSize ?? existing.accountSize,
        currency: body.currency ?? existing.currency,
        purpose: body.purpose ?? existing.purpose,
        credentials: encryptedCredentials ?? existing.credentials,
        notes: body.notes ?? existing.notes,
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
          changes: Object.keys(body).filter((k) => k !== "credentials"),
          credentialsChanged: body.credentials !== undefined,
        },
      },
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

    const dependencies = await prisma.$transaction(async (tx) => {
      const [assignments, evaluations, fundedAccounts, ruleEvents] = await Promise.all([
        tx.accountAssignment.count({ where: { accountId: id } }),
        tx.evaluation.count({ where: { accountId: id } }),
        tx.fundedAccount.count({ where: { accountId: id } }),
        tx.ruleEvent.count({ where: { accountId: id } }),
      ]);
      return { assignments, evaluations, fundedAccounts, ruleEvents };
    });

    const hasDependencies = Object.values(dependencies).some((count) => count > 0);
    if (hasDependencies) {
      return NextResponse.json(
        { success: false, error: "Account has dependent records (assignments, evaluations, funded accounts, or events) and cannot be deleted" },
        { status: 409 }
      );
    }

    await prisma.mT5Account.delete({
      where: { id },
    });

    await prisma.auditLog.create({
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
