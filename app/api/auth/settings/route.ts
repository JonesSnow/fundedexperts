import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";
import { validatePassword } from "@/lib/auth/validation";
import { prisma } from "@/lib/db";


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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A settings object is required." }, { status: 400 });
    }
    const { firstName, lastName, currentPassword, newPassword } = body as {
      firstName?: string;
      lastName?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    if (firstName !== undefined && (typeof firstName !== "string" || firstName.length > 100)) {
      return NextResponse.json({ success: false, error: "First name must be 100 characters or fewer." }, { status: 400 });
    }
    if (lastName !== undefined && (typeof lastName !== "string" || lastName.length > 100)) {
      return NextResponse.json({ success: false, error: "Last name must be 100 characters or fewer." }, { status: 400 });
    }

    if (currentPassword !== undefined || newPassword !== undefined) {
      if (typeof currentPassword !== "string" || !currentPassword || typeof newPassword !== "string" || !newPassword) {
        return NextResponse.json(
          { success: false, error: "Both currentPassword and newPassword are required" },
          { status: 400 },
        );
      }

      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return NextResponse.json({ success: false, error: passwordValidation.error }, { status: 400 });
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
        data: {
          password: newHash,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
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
