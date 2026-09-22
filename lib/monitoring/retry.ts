import { MonitoringResult, RetryPolicyConfig } from "./result";

const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  maxAttempts: 3,
  baseTimeoutMs: 5000,
  maxTimeoutMs: 30000,
  backoffMultiplier: 2,
  retryableCodes: [
    "PROVIDER_TIMEOUT",
    "CONNECTION_RESET",
    "PROVIDER_UNAVAILABLE",
    "RATE_LIMIT_EXCEEDED",
    "TEMPORARY_UNAVAILABLE",
  ],
  nonRetryableCodes: [
    "INVALID_CREDENTIALS",
    "AUTHENTICATION_FAILED",
    "ACCOUNT_NOT_FOUND",
    "ACCOUNT_DISABLED",
    "INVALID_SNAPSHOT",
    "VALIDATION_FAILURE",
  ],
};

export function isRetryable(result: MonitoringResult, policy: RetryPolicyConfig = DEFAULT_RETRY_POLICY): boolean {
  if (!result.error) return false;
  const code = result.error.code;
  if (policy.nonRetryableCodes.includes(code)) return false;
  if (policy.retryableCodes.includes(code)) return true;
  if (result.error.category === "CONNECTION" || result.error.category === "TIMEOUT" || result.error.category === "PROVIDER") {
    return true;
  }
  return result.error.retryable === "RETRYABLE";
}

export function getTimeoutMs(attempt: number, policy: RetryPolicyConfig = DEFAULT_RETRY_POLICY): number {
  const timeout = Math.min(policy.baseTimeoutMs * Math.pow(policy.backoffMultiplier, attempt - 1), policy.maxTimeoutMs);
  return timeout;
}

export function shouldRetry(attempt: number, result: MonitoringResult, policy: RetryPolicyConfig = DEFAULT_RETRY_POLICY): boolean {
  if (attempt >= policy.maxAttempts) return false;
  if (!isRetryable(result, policy)) return false;
  return true;
}
