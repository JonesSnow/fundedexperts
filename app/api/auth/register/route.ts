import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/hash";
import { validateRegisterInput } from "@/lib/auth/validation";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { generateOtp, hashOtp, OTP_TTL_MS } from "@/lib/auth/otp";
import { sendVerificationEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/db";
import { createLogger, generateCorrelationId } from "@/lib/logger";

const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A registration object is required." }, { status: 400 });
    }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const rateLimit = checkRateLimit(`register:${email || "unknown"}`);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    const validation = validateRegisterInput({
      email,
      password: body.password,
      firstName: body.firstName,
      lastName: body.lastName,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 }
      );
    }

    const existing = await prisma.trader.findUnique({
      where: { email },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(body.password);

    const trader = await prisma.trader.create({
      data: {
        email,
        password: passwordHash,
        role: "TRADER",
        firstName: body.firstName,
        lastName: body.lastName,
      },
    });

    resetRateLimit(`register:${email}`);

    const verificationCode = generateOtp();
    const verificationExpires = new Date(Date.now() + OTP_TTL_MS);
    await prisma.trader.update({
      where: { id: trader.id },
      data: {
        emailVerificationToken: hashOtp("email-verification", trader.id, verificationCode),
        emailVerificationExpires: verificationExpires,
      },
    });

    const emailResult = await sendVerificationEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      verificationCode,
      verificationExpires,
    ).catch(() => {
      logger.error("AUTH", "Verification email dispatch failed after registration", {
        correlationId,
        entity: { type: "Trader", id: trader.id },
        error: {
          code: "VERIFICATION_EMAIL_DISPATCH_FAILED",
          message: "Email delivery did not return a result",
        },
      });
      return { success: false as const, error: "email_delivery_unavailable" };
    });

    const response = NextResponse.json(
      {
        success: true,
        emailSent: emailResult.success,
        emailError: emailResult.success ? undefined : "The current email mode did not deliver the verification message. Check the server mail configuration or request a new code.",
        trader: {
          id: trader.id,
          email: trader.email,
          role: trader.role,
          firstName: trader.firstName,
          lastName: trader.lastName,
          status: trader.status,
          emailVerified: trader.emailVerified,
        },
      },
      { status: 201 }
    );

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Registration failed" },
      { status: 500 }
    );
  }
}
