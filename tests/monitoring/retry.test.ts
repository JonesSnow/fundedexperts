import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRetryable, shouldRetry, getTimeoutMs } from "../../lib/monitoring/retry";
import { MonitoringResult } from "../../lib/monitoring/result";

function makeResult(overrides: Partial<MonitoringResult>): MonitoringResult {
  return {
    success: false,
    status: "PROVIDER_FAILURE",
    message: "Error",
    timestamp: new Date(),
    accountId: "acc-1",
    accountLoginMasked: "[MASKED-12***]",
    ...overrides,
  };
}

describe("Retry/Timeout Policy", () => {
  describe("isRetryable", () => {
    it("returns true for retryable error codes", () => {
      const result = makeResult({
        error: { code: "PROVIDER_TIMEOUT", message: "Timeout", severity: "HIGH", category: "TIMEOUT", retryable: "RETRYABLE" },
      });
      assert.strictEqual(isRetryable(result), true);
    });

    it("returns false for non-retryable error codes", () => {
      const result = makeResult({
        error: { code: "INVALID_CREDENTIALS", message: "Auth failed", severity: "CRITICAL", category: "AUTHENTICATION", retryable: "NON_RETRYABLE" },
      });
      assert.strictEqual(isRetryable(result), false);
    });

    it("returns true for connection errors", () => {
      const result = makeResult({
        error: { code: "CONNECTION_RESET", message: "Reset", severity: "HIGH", category: "CONNECTION", retryable: "RETRYABLE" },
      });
      assert.strictEqual(isRetryable(result), true);
    });

    it("returns false when no error", () => {
      const result = makeResult({ error: undefined });
      assert.strictEqual(isRetryable(result), false);
    });
  });

  describe("shouldRetry", () => {
    it("returns true when not exhausted and retryable", () => {
      const result = makeResult({
        error: { code: "PROVIDER_TIMEOUT", message: "Timeout", severity: "HIGH", category: "TIMEOUT", retryable: "RETRYABLE" },
      });
      assert.strictEqual(shouldRetry(0, result), true);
    });

    it("returns false when attempts exhausted", () => {
      const result = makeResult({
        error: { code: "PROVIDER_TIMEOUT", message: "Timeout", severity: "HIGH", category: "TIMEOUT", retryable: "RETRYABLE" },
      });
      assert.strictEqual(shouldRetry(3, result), false);
    });

    it("returns false for non-retryable", () => {
      const result = makeResult({
        error: { code: "INVALID_CREDENTIALS", message: "Auth failed", severity: "CRITICAL", category: "AUTHENTICATION", retryable: "NON_RETRYABLE" },
      });
      assert.strictEqual(shouldRetry(0, result), false);
    });
  });

  describe("getTimeoutMs", () => {
    it("returns increasing timeout with backoff", () => {
      const t1 = getTimeoutMs(0);
      const t2 = getTimeoutMs(1);
      const t3 = getTimeoutMs(2);
      assert.ok(t2 > t1);
      assert.ok(t3 > t2);
    });

    it("caps at maxTimeoutMs", () => {
      const t = getTimeoutMs(100);
      assert.ok(t <= 30000);
    });
  });
});
