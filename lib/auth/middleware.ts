import { NextRequest } from "next/server";
import { getSessionCookie, getSession, SessionPayload } from "./session";

export interface AuthenticatedRequest extends NextRequest {
  session: SessionPayload;
}

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<SessionPayload | null> {
  const token = getSessionCookie(request);
  if (!token) return null;
  return getSession(token);
}

export function requireAuth(session: SessionPayload | null): never | SessionPayload {
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export function requireRole(
  session: SessionPayload | null,
  role: string
): never | SessionPayload {
  const user = requireAuth(session);
  if (user.role !== role) {
    throw new Error("Forbidden");
  }
  return user;
}

export { requireAuth as requireTrader };
