import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "./lib/auth/session";
import { prisma } from "@/lib/db";


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
      select: { id: true, status: true, role: true, emailVerified: true, email: true },
    });

    if (!trader || trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
      const url = new URL("/login", request.url);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/dashboard") && !trader.emailVerified) {
      const url = new URL("/verify-email-pending", request.url);
      url.searchParams.set("email", trader.email);
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/admin") && trader.role !== "ADMIN") {
      const url = new URL("/login", request.url);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  } catch (error) {
    // A database/service failure is NOT an expired session. Reporting it as one
    // bounced every dashboard and admin user to /login during a database blip,
    // and discarded the real cause. The request is still denied (this never falls
    // through to NextResponse.next()), but the client is told the truth: the
    // service is temporarily unavailable, so it can retry rather than
    // re-authenticate. Only the error's name is surfaced; no database detail
    // reaches the client.
    console.error("[middleware] authorization lookup failed", {
      pathname,
      errorName: error instanceof Error ? error.name : typeof error,
    });

    return new NextResponse(
      "Service temporarily unavailable. Please retry.",
      {
        status: 503,
        headers: { "Retry-After": "30" },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};

export const runtime = "nodejs";