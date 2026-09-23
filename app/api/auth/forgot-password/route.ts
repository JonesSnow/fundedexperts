import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionCookie, getSession } from "@/lib/auth/session";

const prisma = new PrismaClient();

async function getAuthenticatedUser(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  return prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, role: true, status: true },
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.trader.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: expires,
      },
    });

    return NextResponse.json(
      { success: true, message: "If an account exists, a reset email has been sent" },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to process request" },
      { status: 500 },
    );
  }
}
