import { PrismaClient, MT5AccountPurpose, AccountStatus, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";

const prisma = new PrismaClient();
const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

async function getAuthenticatedAdmin(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, status: true },
  });
  if (!trader || trader.role !== "ADMIN" || trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
    return null;
  }
  return trader;
}

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const purpose = searchParams.get("purpose");

    const where: Record<string, unknown> = {};
    if (status && Object.values(AccountStatus).includes(status as AccountStatus)) {
      where.status = status as AccountStatus;
    }
    if (purpose && Object.values(MT5AccountPurpose).includes(purpose as MT5AccountPurpose)) {
      where.purpose = purpose as MT5AccountPurpose;
    }

    const accounts = await prisma.mT5Account.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        accountNumber: true,
        broker: true,
        server: true,
        accountSize: true,
        currency: true,
        purpose: true,
        status: true,
        healthStatus: true,
        notes: true,
        lastHealthCheck: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { assignments: true, evaluations: true },
        },
      },
    });

    return NextResponse.json({ success: true, accounts }, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to list MT5 accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const rateLimit = checkRateLimit(`admin:mt5:create:${admin.id}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    const body = await request.json();
    const { accountNumber, broker, server, login, accountSize, currency, purpose, notes, credentials } = body as {
      accountNumber: string;
      broker?: string;
      server?: string;
      login?: string;
      accountSize?: number;
      currency?: string;
      purpose?: MT5AccountPurpose;
      notes?: string;
      credentials?: string;
    };

    if (!accountNumber || typeof accountNumber !== "string") {
      return NextResponse.json(
        { success: false, error: "Account number is required" },
        { status: 400 }
      );
    }

    if (accountSize !== undefined && (typeof accountSize !== "number" || accountSize <= 0)) {
      return NextResponse.json(
        { success: false, error: "Account size must be a positive number" },
        { status: 400 }
      );
    }

    const existing = await prisma.mT5Account.findUnique({
      where: { accountNumber },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Account number already exists" },
        { status: 409 }
      );
    }

    const account = await prisma.mT5Account.create({
      data: {
        accountNumber,
        broker: broker ?? null,
        server: server ?? null,
        login: login ?? null,
        accountSize: accountSize ?? null,
        currency: currency ?? "USD",
        purpose: purpose ?? "EVALUATION",
        status: "AVAILABLE",
        notes: notes ?? null,
        credentials: credentials ?? null,
      },
    });

    logger.info("MT5_ACCOUNT", "Demo account created by admin", {
      correlationId,
      actor: { type: "admin", id: admin.id },
      entity: { type: "MT5Account", id: account.id },
      metadata: { accountNumber: account.accountNumber, purpose: account.purpose },
    });

    return NextResponse.json(
      {
        success: true,
        account: {
          id: account.id,
          accountNumber: account.accountNumber,
          broker: account.broker,
          server: account.server,
          accountSize: account.accountSize,
          currency: account.currency,
          purpose: account.purpose,
          status: account.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("MT5_ACCOUNT", "Account creation failed", {
      correlationId,
      actor: { type: "admin", id: admin?.id ?? "unknown" },
      error: { code: "MT5_CREATE_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to create MT5 account" },
      { status: 500 }
    );
  }
}