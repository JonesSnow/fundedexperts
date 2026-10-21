import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/hash";
import { validatePassword, validateEmail } from "@/lib/auth/validation";
import { checkAuthClientRateLimit, checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { hashOtp } from "@/lib/auth/otp";
import { sendPasswordChangedEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/db";
import { createLogger, generateCorrelationId } from "@/lib/logger";

const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const proof = body?.proof;
    const newPassword = body?.newPassword;
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid || typeof proof !== "string" || proof.length < 32 || proof.length > 128) {
      return NextResponse.json({ success: false, error: "The reset session is invalid or expired." }, { status: 400 });
    }
    if (typeof newPassword !== "string") {
      return NextResponse.json({ success: false, error: "New password is required." }, { status: 400 });
    }

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const clientRateLimit = checkAuthClientRateLimit(request, "reset-password", 20);
    if (!clientRateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Request a new reset code later." },
        { status: 429, headers: { "Retry-After": String(clientRateLimit.retryAfter) } },
      );
    }
    const rateLimitKey = `reset-password:${email}`;
    const rateLimit = checkRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Request a new reset code later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const proofHash = hashOtp("password-reset-proof", email, proof);
    const trader = await prisma.trader.findFirst({
      where: { email, passwordResetToken: proofHash, passwordResetExpires: { gt: new Date() } },
      select: { id: true, email: true, firstName: true },
    });
    if (!trader) {
      return NextResponse.json({ success: false, error: "The reset session is invalid or expired." }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();
    const consumed = await prisma.trader.updateMany({
      where: {
        id: trader.id,
        passwordResetToken: proofHash,
        passwordResetExpires: { gt: now },
      },
      data: {
        password: passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });
    if (consumed.count !== 1) {
      return NextResponse.json({ success: false, error: "The reset session is invalid, expired, or already used." }, { status: 400 });
    }

    resetRateLimit(rateLimitKey);
    void sendPasswordChangedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { changedByAdmin: false },
    ).catch(() => {
      logger.error("AUTH", "Password changed email dispatch failed", {
        correlationId,
        entity: { type: "Trader", id: trader.id },
        error: {
          code: "PASSWORD_CHANGED_EMAIL_DISPATCH_FAILED",
          message: "Email delivery did not return a result",
        },
      });
    });

    return NextResponse.json({ success: true, message: "Password has been reset. Sign in with your new password." }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, error: "Unable to reset the password right now." }, { status: 503 });
  }
}
