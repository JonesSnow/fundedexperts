import { NextRequest, NextResponse } from "next/server";
import { checkAuthClientRateLimit, checkRateLimit } from "@/lib/auth/rate-limit";
import { generateRecoveryProof, hashOtp, isSixDigitOtp } from "@/lib/auth/otp";
import { validateEmail } from "@/lib/auth/validation";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code: unknown = body?.code;
    if (!validateEmail(email).valid || !isSixDigitOtp(code)) {
      return NextResponse.json({ success: false, error: "Enter the email address and six-digit code." }, { status: 400 });
    }

    const clientRateLimit = checkAuthClientRateLimit(request, "reset-password-verify", 30);
    if (!clientRateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many code attempts. Request a new code later." },
        { status: 429, headers: { "Retry-After": String(clientRateLimit.retryAfter) } },
      );
    }
    const rateLimitKey = `reset-password-code:${email}`;
    const rateLimit = checkRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many code attempts. Request a new code later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const codeHash = hashOtp("password-reset", email, code);
    const now = new Date();
    const trader = await prisma.trader.findFirst({
      where: { email, passwordResetToken: codeHash, passwordResetExpires: { gt: now } },
      select: { id: true },
    });
    if (!trader) {
      return NextResponse.json({ success: false, error: "The code is invalid or expired." }, { status: 400 });
    }

    const proof = generateRecoveryProof();
    const proofHash = hashOtp("password-reset-proof", email, proof);
    const consumed = await prisma.trader.updateMany({
      where: {
        id: trader.id,
        passwordResetToken: codeHash,
        passwordResetExpires: { gt: now },
      },
      data: { passwordResetToken: proofHash },
    });
    if (consumed.count !== 1) {
      return NextResponse.json({ success: false, error: "The code is invalid, expired, or already used." }, { status: 400 });
    }

    return NextResponse.json({ success: true, proof }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, error: "Unable to verify this code right now." }, { status: 503 });
  }
}
