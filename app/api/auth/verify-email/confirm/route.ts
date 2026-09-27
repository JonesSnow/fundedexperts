import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { sendWelcomeEmail } from "@/lib/email/templates";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body as { token: string };

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { success: false, error: "Token is required" },
        { status: 400 },
      );
    }

    const existing = await prisma.trader.findFirst({
      where: { emailVerificationToken: token },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid verification token",
          alreadyVerified: false,
          canResend: true,
        },
        { status: 400 },
      );
    }

    if (existing.emailVerified) {
      return NextResponse.json(
        {
          success: true,
          message: "Email already verified. You can log in.",
          alreadyVerified: true,
        },
        { status: 200 },
      );
    }

    if (!existing.emailVerificationExpires || existing.emailVerificationExpires < new Date()) {
      return NextResponse.json(
        {
          success: false,
          error: "Verification link has expired",
          alreadyVerified: false,
          canResend: true,
        },
        { status: 410 },
      );
    }

    await prisma.trader.update({
      where: { id: existing.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    sendWelcomeEmail(
      { id: existing.id, email: existing.email, firstName: existing.firstName ?? undefined },
      { isVerified: true },
    ).catch(() => {});

    return NextResponse.json(
      { success: true, message: "Email verified successfully" },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to verify email" },
      { status: 500 },
    );
  }
}
