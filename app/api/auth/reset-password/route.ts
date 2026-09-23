import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/hash";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, newPassword } = body as { token: string; newPassword: string };

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { success: false, error: "Token is required" },
        { status: 400 },
      );
    }
    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json(
        { success: false, error: "New password is required" },
        { status: 400 },
      );
    }

    const trader = await prisma.trader.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!trader) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token" },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.trader.update({
      where: { id: trader.id },
      data: {
        password: passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    return NextResponse.json(
      { success: true, message: "Password has been reset" },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to reset password" },
      { status: 500 },
    );
  }
}
