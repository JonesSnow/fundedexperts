import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET_VALUE = process.env.JWT_SECRET;

if (!JWT_SECRET_VALUE || JWT_SECRET_VALUE === "change-me-in-production") {
  throw new Error(
    "JWT_SECRET is required and must not be the default value. Set it in .env.local."
  );
}

const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_VALUE);

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export interface SessionPayload {
  sub: string;
  role: string;
}

export async function createSession(traderId: string, role: string): Promise<string> {
  const token = await new SignJWT({ sub: traderId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(JWT_SECRET);
  return token;
}

export async function getSession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function getSessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  path: string;
  maxAge: number;
} {
  const isDev = process.env.NODE_ENV !== "production";
  return {
    httpOnly: true,
    secure: !isDev,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export { SESSION_COOKIE };
