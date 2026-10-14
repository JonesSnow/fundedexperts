import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, performDummyPasswordVerification } from "@/lib/auth/hash";
import { validateLoginInput } from "@/lib/auth/validation";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { sendLoginSecurityAlertEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/db";


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A login object is required." }, { status: 400 });
    }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const rateLimit = checkRateLimit(`login:${email || "unknown"}`);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    const validation = validateLoginInput({
      email,
      password: body.password,
    });

    // NOTE: the rate-limit counter is deliberately NOT reset here.
    // validateLoginInput fails when either field is malformed, so resetting on
    // validation failure let a caller clear the counter for any target email by
    // sending a valid email with a too-short password, which defeated the
    // brute-force lockout entirely. Malformed requests still consume an attempt
    // (checkRateLimit runs before validation). Only a successful authentication
    // clears the counter.
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 }
      );
    }

    // Only the columns this handler actually reads are fetched. Previously the full
// trader row was loaded, which also pulled the password reset token and the
// email verification token into memory on every login attempt.
const trader = await prisma.trader.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        firstName: true,
        lastName: true,
        status: true,
        emailVerified: true,
      },
    });

    // Each authentication failure below performs the same amount of password work
    // so that response timing cannot be used to discover which email addresses
    // are registered. Status codes and bodies are unchanged from before.
    if (!trader) {
      await performDummyPasswordVerification(body.password);
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    if (trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
      await performDummyPasswordVerification(body.password);
      return NextResponse.json(
        { success: false, error: "Account suspended" },
        { status: 403 }
      );
    }

    const isValid = await verifyPassword(body.password, trader.password);

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    resetRateLimit(`login:${email}`);

    if (!trader.emailVerified) {
      return NextResponse.json(
        { success: false, emailVerified: false, email: trader.email, error: "Verify your email address before signing in." },
        { status: 403 },
      );
    }

    const token = await createSession(trader.id, trader.role);

    sendLoginSecurityAlertEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      new Date().toISOString(),
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown",
    ).catch(() => {});

    const response = NextResponse.json(
      {
        success: true,
        emailVerified: trader.emailVerified,
        trader: {
          id: trader.id,
          email: trader.email,
          role: trader.role,
          firstName: trader.firstName,
          lastName: trader.lastName,
          status: trader.status,
        },
      },
      { status: 200 }
    );

    response.headers.set(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
    );

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Login failed" },
      { status: 500 }
    );
  }
}
