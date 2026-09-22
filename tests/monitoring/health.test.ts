import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth } from "../../lib/monitoring/health";
import { MonitoringResult } from "../../lib/monitoring/result";
import { MonitoringSnapshot, ProviderName } from "../../lib/monitoring/types";

function makeResult(overrides: Partial<MonitoringResult>): MonitoringResult {
  return {
    success: true,
    status: "SUCCESS",
    message: "OK",
    timestamp: new Date(),
    accountId: "acc-1",
    accountLoginMasked: "[MASKED-12***]",
    ...overrides,
  };
}

function makeSnapshot(overrides?: Partial<MonitoringSnapshot>): MonitoringSnapshot {
  return {
    accountId: "acc-1",
    accountLoginMasked: "[MASKED-12***]",
    accountNumber: "ACCT-001",
    server: "Server-XM",
    broker: "XM",
    balance: 100000,
    equity: 95000,
    freeMargin: 90000,
    margin: 5000,
    marginLevel: 1900,
    currency: "USD",
    leverage: 100,
    isDemo: true,
    positions: [],
    orders: [],
    historySummary: { dealCount: 0, totalRealizedPnl: null, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
    terminalConnected: true,
    terminalVersion: "1.2.3",
    dataTimestamp: new Date(),
    provider: "MT5" as ProviderName,
    snapshotTimestamp: new Date(),
    ...overrides,
  };
}

describe("evaluateHealth", () => {
  describe("Healthy", () => {
    it("returns HEALTHY for fresh valid snapshot", () => {
      const result = makeResult({ snapshot: makeSnapshot() });
      const health = evaluateHealth(result);
      assert.strictEqual(health.health, "HEALTHY");
      assert.strictEqual(health.snapshotAvailable, true);
    });
  });

  describe("Degraded", () => {
    it("returns DEGRADED for partial data", () => {
      const result = makeResult({
        success: true,
        status: "PARTIAL",
        snapshot: makeSnapshot(),
        error: { code: "PARTIAL_DATA", message: "Some data missing", severity: "MEDIUM", category: "PROVIDER", retryable: "RETRYABLE" },
      });
      const health = evaluateHealth(result);
      assert.strictEqual(health.health, "DEGRADED");
    });

    it("returns DEGRADED for stale data", () => {
      const result = makeResult({
        snapshot: makeSnapshot({ dataTimestamp: new Date(Date.now() - 600000) }),
      });
      const health = evaluateHealth(result, { staleDataThresholdMs: 300000, missingAccountThresholdMs: 600000 });
      assert.strictEqual(health.health, "DEGRADED");
    });
  });

  describe("Disconnected", () => {
    it("returns DISCONNECTED for terminal disconnected", () => {
      const result = makeResult({ status: "DISCONNECTED", snapshot: makeSnapshot({ terminalConnected: false }) });
      const health = evaluateHealth(result);
      assert.strictEqual(health.health, "DISCONNECTED");
    });
  });

  describe("Error", () => {
    it("returns ERROR for timeout", () => {
      const result = makeResult({ status: "TIMEOUT", snapshot: makeSnapshot() });
      const health = evaluateHealth(result);
      assert.strictEqual(health.health, "ERROR");
    });

    it("returns ERROR for provider failure", () => {
      const result = makeResult({ status: "PROVIDER_FAILURE", snapshot: makeSnapshot() });
      const health = evaluateHealth(result);
      assert.strictEqual(health.health, "ERROR");
    });

    it("returns ERROR for validation failure", () => {
      const result = makeResult({ status: "VALIDATION_FAILURE", snapshot: makeSnapshot() });
      const health = evaluateHealth(result);
      assert.strictEqual(health.health, "ERROR");
    });
  });

  describe("Unknown", () => {
    it("returns UNKNOWN when no snapshot", () => {
      const result = makeResult({});
      const health = evaluateHealth(result);
      assert.strictEqual(health.health, "UNKNOWN");
      assert.strictEqual(health.snapshotAvailable, false);
    });
  });
});
