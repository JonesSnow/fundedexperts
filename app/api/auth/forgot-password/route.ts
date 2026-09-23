import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email as string | undefined;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 },
      );
    }

    const rateLimit = checkRateLimit(`forgot-password:${email}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    const trader = await prisma.trader.findUnique({
      where: { email },
    });

    resetRateLimit(`forgot-password:${email}`);

    if (trader && !trader.emailVerified) {
      return NextResponse.json(
        { success: false, error: "If an account exists, a reset email has been sent" },
        { status: 200 },
      );
    }

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    if (trader) {
      await prisma.trader.update({
        where: { id: trader.id },
        data: {
          passwordResetToken: token,
          passwordResetExpires: expires,
        },
      });
    }

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
