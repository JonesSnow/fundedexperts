import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/hash";
import { validateLoginInput } from "@/lib/auth/validation";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const email = (await request.json()).email as string | undefined;
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

    const body = await request.json();
    const validation = validateLoginInput({
      email: body.email,
      password: body.password,
    });

    if (!validation.valid) {
      resetRateLimit(`login:${body.email || "unknown"}`);
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 }
      );
    }

    const trader = await prisma.trader.findUnique({
      where: { email: body.email },
    });

    if (!trader) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    if (trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
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

    resetRateLimit(`login:${body.email}`);

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
      { status: 200 }
    );

    response.headers.set(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
    );

    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Login failed" },
      { status: 500 }
    );
  }
}
