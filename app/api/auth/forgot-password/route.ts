import { NextRequest, NextResponse } from "next/server";
import { checkCooldown, checkRateLimit } from "@/lib/auth/rate-limit";
import { generateOtp, hashOtp, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "@/lib/auth/otp";
import { validateEmail } from "@/lib/auth/validation";
import { sendPasswordResetEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/db";
import { createLogger, generateCorrelationId } from "@/lib/logger";

const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

const GENERIC_RESPONSE = {
  success: true,
  message: "If an account exists for that address, a password reset code will be sent.",
};

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const validation = validateEmail(email);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const rateLimit = checkRateLimit(`forgot-password:${email}`);
    const cooldown = checkCooldown(`forgot-password-request:${email}`, OTP_RESEND_COOLDOWN_MS);
    if (!rateLimit.allowed || !cooldown.allowed) {
      const retryAfter = Math.max(rateLimit.retryAfter ?? 0, cooldown.retryAfter ?? 0);
      return NextResponse.json(GENERIC_RESPONSE, {
        status: 200,
        headers: retryAfter > 0 ? { "Retry-After": String(retryAfter) } : undefined,
      });
    }

    const trader = await prisma.trader.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true },
    });

    if (trader) {
      const code = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_MS);
      await prisma.trader.update({
        where: { id: trader.id },
        data: {
          passwordResetToken: hashOtp("password-reset", email, code),
          passwordResetExpires: expiresAt,
        },
      });

      await sendPasswordResetEmail(
        { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
        code,
        expiresAt,
      ).catch(() => {
        logger.error("AUTH", "Password reset email dispatch failed", {
          correlationId,
          entity: { type: "Trader", id: trader.id },
          error: {
            code: "PASSWORD_RESET_EMAIL_DISPATCH_FAILED",
            message: "Email delivery did not return a result",
          },
        });
      });
    }

    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, error: "Unable to process this request right now." }, { status: 503 });
  }
}
