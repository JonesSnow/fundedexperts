import { NextRequest, NextResponse } from "next/server";
import { checkAuthClientRateLimit, checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { hashOtp, isSixDigitOtp } from "@/lib/auth/otp";
import { sendWelcomeEmail } from "@/lib/email/templates";
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
    const code: unknown = body?.code;
    if (!email || email.length > 255 || !isSixDigitOtp(code)) {
      return NextResponse.json({ success: false, error: "Enter the email address and six-digit code." }, { status: 400 });
    }

    const clientRateLimit = checkAuthClientRateLimit(request, "verify-email-confirm", 30);
    if (!clientRateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many code attempts. Request a new code later." },
        { status: 429, headers: { "Retry-After": String(clientRateLimit.retryAfter) } },
      );
    }
    const rateLimitKey = `verify-email-code:${email}`;
    const rateLimit = checkRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many code attempts. Request a new code later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const account = await prisma.trader.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });
    if (!account || account.emailVerified) {
      return NextResponse.json({ success: false, error: "The code is invalid or expired." }, { status: 400 });
    }

    const now = new Date();
    const codeHash = hashOtp("email-verification", account.id, code);
    const trader = await prisma.trader.findFirst({
      where: {
        id: account.id,
        emailVerified: false,
        emailVerificationToken: codeHash,
        emailVerificationExpires: { gt: now },
      },
      select: { id: true, email: true, firstName: true },
    });

    if (!trader) {
      return NextResponse.json({ success: false, error: "The code is invalid or expired." }, { status: 400 });
    }

    const consumed = await prisma.trader.updateMany({
      where: {
        id: trader.id,
        emailVerified: false,
        emailVerificationToken: codeHash,
        emailVerificationExpires: { gt: now },
      },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });
    if (consumed.count !== 1) {
      return NextResponse.json({ success: false, error: "The code is invalid, expired, or already used." }, { status: 400 });
    }

    resetRateLimit(rateLimitKey);
    void sendWelcomeEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { isVerified: true },
    ).catch(() => {
      logger.error("AUTH", "Welcome email dispatch failed after verification", {
        correlationId,
        entity: { type: "Trader", id: trader.id },
        error: {
          code: "WELCOME_EMAIL_DISPATCH_FAILED",
          message: "Email delivery did not return a result",
        },
      });
    });

    return NextResponse.json({ success: true, message: "Email verified. You can now sign in." }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, error: "Unable to verify this code right now." }, { status: 503 });
  }
}
