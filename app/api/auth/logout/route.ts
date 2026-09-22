import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true }, { status: 200 });
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
  return response;
}
