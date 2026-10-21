import { isIP } from "node:net";
import { createHash } from "node:crypto";

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
}

const attempts = new Map<string, RateLimitEntry>();
const cooldowns = new Map<string, number>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
export const RATE_LIMIT_KEY_CAPACITY = 20_000;
const MAX_RATE_LIMIT_SUBJECT_LENGTH = 255;
const MAX_RATE_LIMIT_KEY_LENGTH = 512;
const PRUNE_INTERVAL_MS = 60 * 1000;
let lastPrunedAt = 0;

export function createBoundedRateLimitKey(scope: string, subject: string): string {
  const boundedSubject = subject.length > MAX_RATE_LIMIT_SUBJECT_LENGTH
    ? "oversized"
    : subject || "unknown";
  return normalizeRateLimitKey(`${scope}:${boundedSubject}`);
}

/** Keep attacker-controlled route parameters from becoming large map keys. */
export function normalizeRateLimitKey(key: string): string {
  if (key.length <= MAX_RATE_LIMIT_KEY_LENGTH) return key;
  return `sha256:${createHash("sha256").update(key).digest("hex")}`;
}

function pruneExpiredEntries(now: number): void {
  if (now - lastPrunedAt < PRUNE_INTERVAL_MS) return;
  lastPrunedAt = now;

  for (const [key, entry] of attempts) {
    if (now - entry.firstAttempt > WINDOW_MS) attempts.delete(key);
  }
  for (const [key, until] of cooldowns) {
    if (until <= now) cooldowns.delete(key);
  }
}

export function checkRateLimit(key: string, maxAttempts = MAX_ATTEMPTS): {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
} {
  const now = Date.now();
  pruneExpiredEntries(now);
  const boundedKey = normalizeRateLimitKey(key);
  const entry = attempts.get(boundedKey);

  if (!entry) {
    if (attempts.size >= RATE_LIMIT_KEY_CAPACITY) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil(PRUNE_INTERVAL_MS / 1000),
      };
    }
    attempts.set(boundedKey, { attempts: 1, firstAttempt: now });
    return { allowed: true, remaining: Math.max(0, maxAttempts - 1) };
  }

  if (now - entry.firstAttempt > WINDOW_MS) {
    attempts.set(boundedKey, { attempts: 1, firstAttempt: now });
    return { allowed: true, remaining: Math.max(0, maxAttempts - 1) };
  }

  entry.attempts++;

  if (entry.attempts > maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(LOCKOUT_MS / 1000),
    };
  }

  return { allowed: true, remaining: Math.max(0, maxAttempts - entry.attempts) };
}

/**
 * Scope public read limits to the visitor instead of making one visitor's
 * requests exhaust the shared route quota for everyone on this process.
 * Vercel provides x-vercel-forwarded-for from its edge; outside production,
 * forwarded headers are also useful for local proxy-based verification.
 */
export function checkClientRateLimit(
  request: { headers: Headers },
  scope: string,
  maxAttempts: number,
  runtimeEnvironment: string | undefined = process.env.NODE_ENV,
): ReturnType<typeof checkRateLimit> {
  const clientAddress = getClientAddress(request, runtimeEnvironment);
  return checkRateLimit(`${scope}:${clientAddress}`, maxAttempts);
}

/**
 * Add an IP-level budget to authentication endpoints without making every
 * caller share one global "unknown" bucket when a trusted client IP is absent.
 * The per-subject limit remains mandatory in that case.
 */
export function checkAuthClientRateLimit(
  request: { headers: Headers },
  scope: string,
  maxAttempts: number,
  runtimeEnvironment: string | undefined = process.env.NODE_ENV,
): ReturnType<typeof checkRateLimit> {
  const clientAddress = getClientAddress(request, runtimeEnvironment);
  if (clientAddress === "unknown") {
    return { allowed: true, remaining: maxAttempts };
  }
  return checkRateLimit(`auth-client:${scope}:${clientAddress}`, maxAttempts);
}

function getClientAddress(
  request: { headers: Headers },
  runtimeEnvironment: string | undefined,
): string {
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  const forwardedFor = runtimeEnvironment === "production"
    ? vercelForwardedFor
    : vercelForwardedFor ?? request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  const candidate = forwardedFor?.split(",", 1)[0]?.trim() ?? "";
  return isIP(candidate) ? candidate : "unknown";
}

export function resetRateLimit(key: string): void {
  attempts.delete(normalizeRateLimitKey(key));
}

export function checkCooldown(key: string, cooldownMs: number): {
  allowed: boolean;
  retryAfter?: number;
} {
  const now = Date.now();
  pruneExpiredEntries(now);
  const boundedKey = normalizeRateLimitKey(key);
  const until = cooldowns.get(boundedKey);
  if (until && until > now) {
    return { allowed: false, retryAfter: Math.ceil((until - now) / 1000) };
  }
  if (!until && cooldowns.size >= RATE_LIMIT_KEY_CAPACITY) {
    return { allowed: false, retryAfter: Math.ceil(PRUNE_INTERVAL_MS / 1000) };
  }
  cooldowns.set(boundedKey, now + cooldownMs);
  return { allowed: true };
}

export function resetCooldown(key: string): void {
  cooldowns.delete(normalizeRateLimitKey(key));
}

export function getRateLimitInfo(key: string): RateLimitEntry | undefined {
  return attempts.get(normalizeRateLimitKey(key));
}
