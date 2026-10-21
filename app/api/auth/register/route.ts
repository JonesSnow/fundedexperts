import { Prisma } from "@prisma/client";
import { after, NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/hash";
import { validateRegisterInput } from "@/lib/auth/validation";
import { checkAuthClientRateLimit, checkRateLimit, createBoundedRateLimitKey } from "@/lib/auth/rate-limit";
import { generateOtp, hashOtp, OTP_TTL_MS } from "@/lib/auth/otp";
import { sendVerificationEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/db";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { registrationAcceptedPayload } from "@/lib/auth/registration-response";

const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  let normalizedEmail = "";
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A registration object is required." }, { status: 400 });
    }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    normalizedEmail = email;
    const clientRateLimit = checkAuthClientRateLimit(request, "register", 20);
    if (!clientRateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(clientRateLimit.retryAfter) } },
      );
    }
    const rateLimit = checkRateLimit(createBoundedRateLimitKey("register", email));

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
      select: { id: true },
    });
    if (existing) {
      // Keep the response cost close to the account-creation path so the
      // existence check is not exposed through an obvious timing difference.
      await hashPassword(body.password);
      return NextResponse.json(registrationAcceptedPayload(email), { status: 202 });
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

    const verificationCode = generateOtp();
    const verificationExpires = new Date(Date.now() + OTP_TTL_MS);
    await prisma.trader.update({
      where: { id: trader.id },
      data: {
        emailVerificationToken: hashOtp("email-verification", trader.id, verificationCode),
        emailVerificationExpires: verificationExpires,
      },
    });

    const logEmailDispatchFailure = () => logger.error(
      "AUTH",
      "Verification email dispatch failed after registration",
      {
        correlationId,
        entity: { type: "Trader", id: trader.id },
        error: {
          code: "VERIFICATION_EMAIL_DISPATCH_FAILED",
          message: "Email delivery did not return a result",
        },
      },
    );
    try {
      after(async () => {
        let emailDelivered = false;
        try {
          const result = await sendVerificationEmail(
            { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
            verificationCode,
            verificationExpires,
          );
          emailDelivered = result.success;
        } catch {
          emailDelivered = false;
        }
        if (!emailDelivered) logEmailDispatchFailure();
      });
    } catch {
      logEmailDispatchFailure();
    }
    return NextResponse.json(registrationAcceptedPayload(email), { status: 202 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      normalizedEmail
    ) {
      return NextResponse.json(registrationAcceptedPayload(normalizedEmail), { status: 202 });
    }
    return NextResponse.json(
      { success: false, error: "Registration failed" },
      { status: 500 }
    );
  }
}
