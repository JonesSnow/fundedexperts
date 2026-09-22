import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "./lib/auth/session";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin") && !pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const token = getSessionCookie(request);
  if (!token) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  const session = await getSession(token);
  if (!session) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  try {
    const trader = await prisma.trader.findUnique({
      where: { id: session.sub },
      select: { id: true, status: true },
    });

    if (!trader || trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
      const url = new URL("/login", request.url);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  } catch {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};