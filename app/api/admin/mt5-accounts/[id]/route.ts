import { PrismaClient, AccountStatus, MT5AccountPurpose } from "@prisma/client";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const account = await prisma.mT5Account.findUnique({
      where: { id },
      select: {
        id: true,
        accountNumber: true,
        broker: true,
        server: true,
        login: true,
        accountSize: true,
        currency: true,
        purpose: true,
        status: true,
        healthStatus: true,
        notes: true,
        lastHealthCheck: true,
        lastMonitoringAt: true,
        currentMonitoringStatus: true,
        currentMonitoringResult: true,
        createdAt: true,
        updatedAt: true,
        assignments: {
          select: {
            id: true,
            traderId: true,
            trader: { select: { id: true, email: true, firstName: true, lastName: true } },
            status: true,
            assignedAt: true,
            returnedAt: true,
          },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: "MT5 account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, account }, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch MT5 account" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const rateLimit = checkRateLimit(`admin:mt5:update:${admin.id}`);
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
    const { status, purpose, notes, broker, server, login, credentials } = body as {
      status?: AccountStatus;
      purpose?: MT5AccountPurpose;
      notes?: string;
      broker?: string;
      server?: string;
      login?: string;
      credentials?: string;
    };

    const account = await prisma.mT5Account.findUnique({ where: { id } });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "MT5 account not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (purpose !== undefined) updateData.purpose = purpose;
    if (notes !== undefined) updateData.notes = notes;
    if (broker !== undefined) updateData.broker = broker;
    if (server !== undefined) updateData.server = server;
    if (login !== undefined) updateData.login = login;
    if (credentials !== undefined) updateData.credentials = credentials;
    updateData.updatedAt = new Date();

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.mT5Account.update({
      where: { id },
      data: updateData,
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
        updatedAt: true,
      },
    });

    logger.info("MT5_ACCOUNT", "Demo account updated by admin", {
      correlationId,
      actor: { type: "admin", id: admin.id },
      entity: { type: "MT5Account", id: account.id },
      metadata: { updatedFields: Object.keys(updateData).filter((k) => k !== "updatedAt") },
    });

    return NextResponse.json({ success: true, account: updated }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("MT5_ACCOUNT", "Account update failed", {
      correlationId,
      actor: { type: "admin", id: admin?.id ?? "unknown" },
      error: { code: "MT5_UPDATE_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Failed to update MT5 account" },
      { status: 500 }
    );
  }
}