import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";

const prisma = new PrismaClient();

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
  if (!trader || trader.role !== "ADMIN") return null;
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

  try {
    const { searchParams } = new URL(request.url);
    const traderIdParam = searchParams.get("traderId");

    let where: { traderId: string };
    if (traderIdParam && trader.role === "ADMIN") {
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
      where = { traderId: traderIdParam };
    } else {
      where = { traderId: trader.id };
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      { success: true, notifications },
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
