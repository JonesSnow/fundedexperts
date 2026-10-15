import { AccountStatus, MT5AccountPurpose } from "@prisma/client";
import type { MT5Account, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { prepareMt5Credentials } from "@/lib/mt5-credential-storage";
import { evaluateMt5AccountStatusChange, type Mt5AccountStatus } from "@/lib/mt5-account-status-policy";

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

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "An account update object is required" }, { status: 400 });
    }
    const { status, purpose, notes, broker, server, login, credentials } = body as {
      status?: unknown;
      purpose?: MT5AccountPurpose;
      notes?: string;
      broker?: string;
      server?: string;
      login?: string;
      credentials?: string | null;
    };

    if (status !== undefined && (typeof status !== "string" || !Object.values(AccountStatus).includes(status as AccountStatus))) {
      return NextResponse.json(
        { success: false, error: "Valid status is required: AVAILABLE, IN_USE, INACTIVE, MAINTENANCE" },
        { status: 400 },
      );
    }

    const preparedCredentials = prepareMt5Credentials(credentials);
    if (!preparedCredentials.ok) {
      const invalidValue = preparedCredentials.reason === "invalid";
      return NextResponse.json(
        { success: false, error: invalidValue ? "Credentials must be a string" : "Credential encryption is unavailable" },
        { status: invalidValue ? 400 : 503 },
      );
    }

    const account = await prisma.mT5Account.findUnique({ where: { id } });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "MT5 account not found" },
        { status: 404 }
      );
    }

    const updateData: Prisma.MT5AccountUpdateManyMutationInput = {};
    if (status !== undefined) updateData.status = status as AccountStatus;
    if (purpose !== undefined) updateData.purpose = purpose;
    if (notes !== undefined) updateData.notes = notes;
    if (broker !== undefined) updateData.broker = broker;
    if (server !== undefined) updateData.server = server;
    if (login !== undefined) updateData.login = login;
    if (credentials !== undefined) updateData.credentials = preparedCredentials.value ?? null;
    updateData.updatedAt = new Date();

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    let updated: Pick<
      MT5Account,
      "id" | "accountNumber" | "broker" | "server" | "accountSize" | "currency" | "purpose" | "status" | "healthStatus" | "notes" | "updatedAt"
    >;
    if (status !== undefined) {
      const newStatus = status as AccountStatus;
      const transition = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "MT5Account" WHERE "id" = ${id} FOR UPDATE
        `;
        if (locked.length === 0) return { kind: "missing" as const };

        const current = await tx.mT5Account.findUnique({ where: { id } });
        if (!current) return { kind: "missing" as const };
        const activeAssignment = await tx.accountAssignment.findFirst({
          where: { accountId: id, status: "ASSIGNED" },
        });
        const decision = evaluateMt5AccountStatusChange(
          current.status as Mt5AccountStatus,
          newStatus as Mt5AccountStatus,
          Boolean(activeAssignment),
        );
        if (decision.kind !== "allowed") return decision;

        const changed = await tx.mT5Account.updateMany({
          where: { id, status: current.status },
          data: updateData,
        });
        if (changed.count !== 1) return { kind: "conflict" as const };

        const updatedAccount = await tx.mT5Account.findUnique({
          where: { id },
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
        if (!updatedAccount) return { kind: "missing" as const };

        if (current.status !== newStatus) {
          await tx.auditLog.create({
            data: {
              action: "ACCOUNT_UPDATED",
              entityType: "MT5Account",
              entityId: current.id,
              performedBy: admin.id,
              details: {
                accountNumber: current.accountNumber,
                statusChange: { from: current.status, to: newStatus },
              },
            },
          });
        }
        return { kind: "updated" as const, account: updatedAccount };
      });

      if (transition.kind === "missing") {
        return NextResponse.json({ success: false, error: "MT5 account not found" }, { status: 404 });
      }
      if (transition.kind === "assignment-conflict") {
        return NextResponse.json({ success: false, error: transition.message }, { status: 409 });
      }
      if (transition.kind === "invalid-transition") {
        return NextResponse.json(
          { success: false, error: `Invalid status transition from ${transition.from} to ${newStatus}` },
          { status: 400 },
        );
      }
      if (transition.kind === "conflict") {
        return NextResponse.json({ success: false, error: "Account status changed; reload and try again." }, { status: 409 });
      }
      updated = transition.account;
    } else {
      updated = await prisma.mT5Account.update({
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
    }

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
