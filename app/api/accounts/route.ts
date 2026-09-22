import { PrismaClient, MT5Account, MT5AccountPurpose, AccountStatus, MT5HealthStatus } from "@prisma/client";
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

export async function GET(request: NextRequest) {
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

  try {
    const { search, status, purpose, broker } = Object.fromEntries(request.nextUrl.searchParams) as {
      search?: string;
      status?: string;
      purpose?: string;
      broker?: string;
    };

    const where: Record<string, unknown> = {};
    if (search) {
      where.accountNumber = { contains: search, mode: "insensitive" };
    }
    if (status && Object.values(AccountStatus).includes(status as AccountStatus)) {
      where.status = status as AccountStatus;
    }
    if (purpose && Object.values(MT5AccountPurpose).includes(purpose as MT5AccountPurpose)) {
      where.purpose = purpose as MT5AccountPurpose;
    }
    if (broker) {
      where.broker = { contains: broker, mode: "insensitive" };
    }

    const accounts = await prisma.mT5Account.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      { success: true, accounts: accounts.map(omitCredentials) },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to list accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json();
    const errors: Record<string, string> = {};

    if (!body.accountNumber || typeof body.accountNumber !== "string" || body.accountNumber.length > 50) {
      errors.accountNumber = "Account number is required and must be 50 characters or less";
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
    if (body.purpose !== undefined && !Object.values(MT5AccountPurpose).includes(body.purpose)) {
      errors.purpose = "Purpose must be one of: EVALUATION, FUNDED, OTHER";
    }
    if (body.status !== undefined && !Object.values(AccountStatus).includes(body.status)) {
      errors.status = "Status must be one of: AVAILABLE, IN_USE, INACTIVE, MAINTENANCE";
    }
    if (body.healthStatus !== undefined && !Object.values(MT5HealthStatus).includes(body.healthStatus)) {
      errors.healthStatus = "Health status must be one of: CONNECTED, DISCONNECTED, ERROR";
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

    const existing = await prisma.mT5Account.findUnique({
      where: { accountNumber: body.accountNumber },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Account number already exists" },
        { status: 409 }
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

    const account = await prisma.mT5Account.create({
      data: {
        accountNumber: body.accountNumber,
        broker: body.broker ?? null,
        server: body.server ?? null,
        login: body.login ?? null,
        accountSize: body.accountSize ?? null,
        currency: body.currency ?? "USD",
        purpose: body.purpose ?? null,
        status: body.status ?? "AVAILABLE",
        healthStatus: body.healthStatus ?? "DISCONNECTED",
        credentials: encryptedCredentials,
        notes: body.notes ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "ACCOUNT_CREATED",
        entityType: "MT5Account",
        entityId: account.id,
        performedBy: trader.id,
        details: {
          accountNumber: account.accountNumber,
          broker: account.broker,
          status: account.status,
          credentialsStored: encryptedCredentials !== null,
        },
      },
    });

    return NextResponse.json(
      { success: true, account: omitCredentials(account) },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create account" },
      { status: 500 }
    );
  }
}
