import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/hash";
import { validateRegisterInput } from "@/lib/auth/validation";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rateLimit = checkRateLimit(`register:${body.email || "unknown"}`);

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
      email: body.email,
      password: body.password,
      firstName: body.firstName,
      lastName: body.lastName,
    });

    if (!validation.valid) {
      resetRateLimit(`register:${body.email || "unknown"}`);
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 }
      );
    }

    const existing = await prisma.trader.findUnique({
      where: { email: body.email },
    });

    if (existing) {
      resetRateLimit(`register:${body.email}`);
      return NextResponse.json(
        { success: false, error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(body.password);

    const trader = await prisma.trader.create({
      data: {
        email: body.email,
        password: passwordHash,
        role: "TRADER",
        firstName: body.firstName,
        lastName: body.lastName,
      },
    });

    resetRateLimit(`register:${body.email}`);

    const token = await createSession(trader.id, trader.role);

    const response = NextResponse.json(
      {
        success: true,
        trader: {
          id: trader.id,
          email: trader.email,
          role: trader.role,
          firstName: trader.firstName,
          lastName: trader.lastName,
          status: trader.status,
        },
      },
      { status: 201 }
    );

    response.headers.set(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
    );

    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Registration failed" },
      { status: 500 }
    );
  }
}
