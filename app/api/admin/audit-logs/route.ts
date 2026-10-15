import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const MAX_CURSOR_LENGTH = 128;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const rawCursor = searchParams.get("before");

  let limit = DEFAULT_PAGE_SIZE;
  if (rawLimit !== null) {
    if (!/^\d{1,3}$/.test(rawLimit)) return errorResponse(400, "Invalid page size.");
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return errorResponse(400, "Invalid page size.");
    }
  }

  if (rawCursor !== null && (!rawCursor.trim() || rawCursor.length > MAX_CURSOR_LENGTH)) {
    return errorResponse(400, "Invalid page cursor.");
  }

  const token = getSessionCookie(request);
  if (!token) return errorResponse(401, "Sign in is required.");

  const session = await getSession(token);
  if (!session) return errorResponse(401, "Sign in is required.");

  try {
    const actor = await prisma.trader.findUnique({
      where: { id: session.sub },
      select: { id: true, role: true, status: true },
    });

    if (!actor) return errorResponse(401, "Sign in is required.");
    if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") {
      return errorResponse(403, "Administrator access is required.");
    }

    const rows = await prisma.auditLog.findMany({
      ...(rawCursor ? { cursor: { id: rawCursor }, skip: 1 } : {}),
      take: limit + 1,
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        performedBy: true,
        timestamp: true,
      },
    });

    const hasMore = rows.length > limit;
    const events = rows.slice(0, limit).map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      performedBy: row.performedBy,
      timestamp: row.timestamp.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      events,
      nextCursor: hasMore ? events.at(-1)?.id ?? null : null,
    });
  } catch {
    return errorResponse(503, "Audit history is temporarily unavailable.");
  }
}
