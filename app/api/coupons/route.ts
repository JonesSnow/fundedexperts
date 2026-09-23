import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";

const prisma = new PrismaClient();

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
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code || typeof code !== "string") {
    return NextResponse.json(
      { success: false, error: "Coupon code is required" },
      { status: 400 },
    );
  }

  try {
    const coupon = await prisma.coupon.findUnique({
      where: { code },
    });

    if (!coupon) {
      return NextResponse.json(
        { success: false, error: "Invalid coupon" },
        { status: 404 },
      );
    }

    if (!coupon.isActive) {
      return NextResponse.json(
        { success: false, error: "Coupon is inactive" },
        { status: 400 },
      );
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: "Coupon has expired" },
        { status: 400 },
      );
    }

    if (coupon.totalUsageLimit !== null && coupon.totalUsageLimit !== undefined && coupon.usedCount >= coupon.totalUsageLimit) {
      return NextResponse.json(
        { success: false, error: "Coupon usage limit reached" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: true, coupon },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to validate coupon" },
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
    const { code, discountPercent, expiresAt, totalUsageLimit } = body as {
      code: string;
      discountPercent: number;
      expiresAt?: string;
      totalUsageLimit?: number;
    };

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { success: false, error: "Code is required" },
        { status: 400 },
      );
    }
    if (typeof discountPercent !== "number" || discountPercent < 1 || discountPercent > 100) {
      return NextResponse.json(
        { success: false, error: "Discount percent must be between 1 and 100" },
        { status: 400 },
      );
    }

    const existing = await prisma.coupon.findUnique({
      where: { code },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Coupon code already exists" },
        { status: 409 },
      );
    }

    const coupon = await prisma.coupon.create({
      data: {
        code,
        discountPercent,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        totalUsageLimit: totalUsageLimit ?? null,
        createdById: admin.id,
      },
    });

    return NextResponse.json(
      { success: true, coupon },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create coupon" },
      { status: 500 },
    );
  }
}
