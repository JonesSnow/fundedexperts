import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      status: true,
      emailVerified: true,
    },
  });

  if (!trader || trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  return NextResponse.json({
    authenticated: true,
    trader: {
      id: trader.id,
      email: trader.email,
      role: trader.role,
      firstName: trader.firstName,
      lastName: trader.lastName,
      status: trader.status,
    },
  });
}
