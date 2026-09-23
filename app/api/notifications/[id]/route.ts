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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const trader = await getAuthenticatedTrader(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  try {
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        ...(trader.role === "TRADER" ? { traderId: trader.id } : {}),
      },
    });

    if (!notification) {
      return NextResponse.json(
        { success: false, error: "Notification not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, notification }, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch notification" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const trader = await getAuthenticatedTrader(request);
  if (!trader || trader.role !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const notification = await prisma.notification.findFirst({
      where: { id },
    });

    if (!notification) {
      return NextResponse.json(
        { success: false, error: "Notification not found" },
        { status: 404 },
      );
    }

    await prisma.notification.delete({
      where: { id },
    });

    return NextResponse.json(
      { success: true, message: "Notification deleted" },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to delete notification" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const trader = await getAuthenticatedTrader(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { read } = body as { read?: boolean };

    if (read === undefined || typeof read !== "boolean") {
      return NextResponse.json(
        { success: false, error: "read field is required and must be boolean" },
        { status: 400 },
      );
    }

    const notification = await prisma.notification.findFirst({
      where: {
        id,
        ...(trader.role === "TRADER" ? { traderId: trader.id } : {}),
      },
    });

    if (!notification) {
      return NextResponse.json(
        { success: false, error: "Notification not found" },
        { status: 404 },
      );
    }

    await prisma.notification.update({
      where: { id },
      data: { read },
    });

    return NextResponse.json(
      { success: true, message: read ? "Notification marked as read" : "Notification marked as unread" },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update notification" },
      { status: 500 },
    );
  }
}
