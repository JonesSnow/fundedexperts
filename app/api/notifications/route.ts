import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { encodeCreatedAtCursor, parseCursorPage } from "@/lib/cursor-pagination";


async function getAuthenticatedTrader(request: NextRequest) {
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

async function getAuthenticatedAdmin(request: NextRequest) {
  const trader = await getAuthenticatedTrader(request);
  if (!trader || !isActiveAdministrator(trader)) return null;
  return trader;
}

export async function GET(request: NextRequest) {
  const trader = await getAuthenticatedTrader(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const page = parseCursorPage(request.nextUrl.searchParams);
  if (!page.success) {
    return NextResponse.json({ success: false, error: page.error }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const traderIdParam = searchParams.get("traderId");

    let baseWhere: Prisma.NotificationWhereInput;
    if (traderIdParam && isActiveAdministrator(trader)) {
      const target = await prisma.trader.findUnique({
        where: { id: traderIdParam },
        select: { id: true },
      });
      if (!target) {
        return NextResponse.json(
          { success: false, error: "Trader not found" },
          { status: 404 },
        );
      }
      baseWhere = { traderId: traderIdParam };
    } else {
      baseWhere = { traderId: trader.id };
    }

    const where: Prisma.NotificationWhereInput = page.cursor
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { createdAt: { lt: page.cursor.createdAt } },
                { createdAt: page.cursor.createdAt, id: { lt: page.cursor.id } },
              ],
            },
          ],
        }
      : baseWhere;
    const includeTraderDetails = Boolean(traderIdParam && isActiveAdministrator(trader));

    const [rows, unreadCount] = await prisma.$transaction(
      async (tx) => Promise.all([
        tx.notification.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: page.limit + 1,
          ...(includeTraderDetails ? {
            include: {
              trader: { select: { email: true, firstName: true, lastName: true } },
            },
          } : {}),
        }),
        tx.notification.count({ where: { ...baseWhere, read: false } }),
      ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const hasMore = rows.length > page.limit;
    const notifications = rows.slice(0, page.limit);
    const lastNotification = notifications.at(-1);

    return NextResponse.json(
      {
        success: true,
        notifications,
        unreadCount,
        nextCursor: hasMore && lastNotification
          ? encodeCreatedAtCursor({ id: lastNotification.id, createdAt: lastNotification.createdAt })
          : null,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load notifications" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { title, message, traderId, type, relatedEntityType, relatedEntityId } = body as {
      title: string;
      message: string;
      traderId?: string;
      type?: string;
      relatedEntityType?: string;
      relatedEntityId?: string;
    };

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { success: false, error: "Title is required" },
        { status: 400 },
      );
    }
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { success: false, error: "Message is required" },
        { status: 400 },
      );
    }

    let recipients: Array<{ id: string }>;
    if (traderId) {
      const target = await prisma.trader.findUnique({
        where: { id: traderId },
        select: { id: true },
      });
      if (!target) {
        return NextResponse.json(
          { success: false, error: "Target trader not found" },
          { status: 404 },
        );
      }
      recipients = [target];
    } else {
      recipients = await prisma.trader.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
    }

    const created = await prisma.notification.createMany({
      data: recipients.map((r) => ({
        traderId: r.id,
        title,
        message,
        type: type ?? "SYSTEM",
        relatedEntityType: relatedEntityType ?? null,
        relatedEntityId: relatedEntityId ?? null,
      })),
    });

    return NextResponse.json(
      { success: true, count: created.count },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create notification" },
      { status: 500 },
    );
  }
}
