import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";

const prisma = new PrismaClient();

async function getAuthenticatedUser(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  return prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, role: true, status: true, firstName: true, lastName: true, emailVerified: true },
  });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  return NextResponse.json(
    { success: true, user },
    { status: 200 },
  );
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { firstName, lastName, currentPassword, newPassword } = body as {
      firstName?: string;
      lastName?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    if (currentPassword !== undefined || newPassword !== undefined) {
      if (!currentPassword || !newPassword) {
        return NextResponse.json(
          { success: false, error: "Both currentPassword and newPassword are required" },
          { status: 400 },
        );
      }

      const trader = await prisma.trader.findUnique({ where: { id: user.id } });
      if (!trader) {
        return NextResponse.json(
          { success: false, error: "User not found" },
          { status: 404 },
        );
      }

      const isValid = await verifyPassword(currentPassword, trader.password);
      if (!isValid) {
        return NextResponse.json(
          { success: false, error: "Current password is incorrect" },
          { status: 400 },
        );
      }

      const newHash = await hashPassword(newPassword);
      await prisma.trader.update({
        where: { id: user.id },
        data: { password: newHash },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;

    if (Object.keys(updateData).length > 0) {
      await prisma.trader.update({
        where: { id: user.id },
        data: updateData,
      });
    }

    const updated = await prisma.trader.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, role: true, status: true, firstName: true, lastName: true, emailVerified: true },
    });

    return NextResponse.json(
      { success: true, user: updated },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
