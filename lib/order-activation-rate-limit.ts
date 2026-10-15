import { checkRateLimit } from "@/lib/auth/rate-limit";

/**
 * Activation has several historical route aliases. Share one per-trader key
 * so switching URLs cannot multiply the allowed activation attempts.
 */
export function checkOrderActivationRateLimit(traderId: string) {
  return checkRateLimit(`order:activation:${traderId}`);
}
