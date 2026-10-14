import { NextRequest, NextResponse } from "next/server";
import { checkCooldown, checkRateLimit } from "@/lib/auth/rate-limit";
import { generateOtp, hashOtp, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "@/lib/auth/otp";
import { sendVerificationEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/db";

const GENERIC_RESPONSE = {
  success: true,
  message: "If an unverified account exists for this address, a new code will be sent.",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: "Enter a valid email address." }, { status: 400 });
    }

    const limit = checkRateLimit(`verify-email:${email}`);
    const cooldown = checkCooldown(`verify-email-resend:${email}`, OTP_RESEND_COOLDOWN_MS);
    if (!limit.allowed || !cooldown.allowed) {
      const retryAfter = Math.max(limit.retryAfter ?? 0, cooldown.retryAfter ?? 0);
      return NextResponse.json(GENERIC_RESPONSE, {
        status: 200,
        headers: retryAfter > 0 ? { "Retry-After": String(retryAfter) } : undefined,
      });
    }

    const trader = await prisma.trader.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, emailVerified: true },
    });
    if (!trader || trader.emailVerified) {
      return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await prisma.trader.update({
      where: { id: trader.id },
      data: {
        emailVerificationToken: hashOtp("email-verification", trader.id, code),
        emailVerificationExpires: expiresAt,
      },
    });
    await sendVerificationEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      code,
      expiresAt,
    ).catch(() => undefined);

    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to process this request right now. Try again later." },
      { status: 503 },
    );
  }
}
