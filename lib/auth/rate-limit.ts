interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
}

const attempts = new Map<string, RateLimitEntry>();
const cooldowns = new Map<string, number>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

function pruneExpiredEntries(now: number): void {
  if (attempts.size > 1_000) {
    for (const [key, entry] of attempts) {
      if (now - entry.firstAttempt > WINDOW_MS) attempts.delete(key);
    }
  }
  if (cooldowns.size > 1_000) {
    for (const [key, until] of cooldowns) {
      if (until <= now) cooldowns.delete(key);
    }
  }
}

export function checkRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
} {
  const now = Date.now();
  pruneExpiredEntries(now);
  const entry = attempts.get(key);

  if (!entry) {
    attempts.set(key, { attempts: 1, firstAttempt: now });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  if (now - entry.firstAttempt > WINDOW_MS) {
    attempts.set(key, { attempts: 1, firstAttempt: now });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  entry.attempts++;

  if (entry.attempts > MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(LOCKOUT_MS / 1000),
    };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - entry.attempts };
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

export function checkCooldown(key: string, cooldownMs: number): {
  allowed: boolean;
  retryAfter?: number;
} {
  const now = Date.now();
  pruneExpiredEntries(now);
  const until = cooldowns.get(key);
  if (until && until > now) {
    return { allowed: false, retryAfter: Math.ceil((until - now) / 1000) };
  }
  cooldowns.set(key, now + cooldownMs);
  return { allowed: true };
}

export function resetCooldown(key: string): void {
  cooldowns.delete(key);
}

export function getRateLimitInfo(key: string): RateLimitEntry | undefined {
  return attempts.get(key);
}
