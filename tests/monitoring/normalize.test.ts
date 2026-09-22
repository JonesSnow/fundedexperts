import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeSnapshot, NormalizeError } from "../../lib/monitoring/normalize";
import { ProviderSnapshot, ProviderName, ProviderPosition, ProviderOrder, ProviderDeal } from "../../lib/monitoring/types";

describe("normalizeSnapshot", () => {
  describe("Valid snapshot", () => {
    it("normalizes a healthy account snapshot", () => {
      const raw: ProviderSnapshot = {
        accountInfo: {
          login: 12345678,
          server: "Server-XM",
          broker: "XM",
          balance: 100000,
          equity: 95000,
          freeMargin: 90000,
          margin: 5000,
          marginLevel: 1900,
          currency: "USD",
        },
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: true, version: "1.2.3" },
        timestamp: new Date(),
        provider: "MT5",
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      assert.strictEqual(result.success, true);
      assert.ok(result.snapshot !== null);
      assert.strictEqual(result.snapshot!.balance, 100000);
      assert.strictEqual(result.snapshot!.accountLoginMasked, "[MASKED-12***]");
      assert.ok(result.accountInfo !== null);
      assert.strictEqual(result.accountInfo!.loginMasked, "[MASKED-12***]");
      assert.strictEqual(result.accountInfo!.balance, 100000);
      assert.strictEqual(result.errors.length, 0);
    });
  });

  describe("Missing optional fields", () => {
    it("handles null accountInfo", () => {
      const raw: ProviderSnapshot = {
        accountInfo: null,
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: true },
        timestamp: new Date(),
        provider: "MT5",
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.accountInfo, null);
      assert.strictEqual(result.snapshot?.balance, null);
      assert.ok(result.errors.some((e: NormalizeError) => e.code === "NULL_ACCOUNT_INFO"));
    });

    it("handles missing optional fields on accountInfo", () => {
      const raw: ProviderSnapshot = {
        accountInfo: { login: 12345678, server: "Server-XM" },
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: true },
        timestamp: new Date(),
        provider: "MT5",
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.snapshot?.balance, null);
      assert.strictEqual(result.snapshot?.currency, null);
    });
  });

  describe("Invalid numeric fields", () => {
    it("flags invalid balance", () => {
      const raw: ProviderSnapshot = {
        accountInfo: { login: 12345678, balance: NaN },
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: true },
        timestamp: new Date(),
        provider: "MT5",
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      assert.strictEqual(result.success, true);
      assert.ok(result.errors.some((e: NormalizeError) => e.code === "INVALID_BALANCE"));
    });
  });

  describe("Invalid timestamps", () => {
    it("handles null timestamp", () => {
      const raw: ProviderSnapshot = {
        accountInfo: { login: 12345678, balance: 1000 },
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: true },
        timestamp: null,
        provider: "MT5",
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.snapshot?.dataTimestamp, null);
    });
  });

  describe("Malformed provider response", () => {
    it("handles null response", () => {
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", null as unknown as ProviderSnapshot);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.snapshot, null);
      assert.ok(result.errors.some((e: NormalizeError) => e.code === "NULL_PROVIDER_RESPONSE"));
    });
  });

  describe("Correct field mapping", () => {
    it("maps positions correctly", () => {
      const raw: ProviderSnapshot = {
        accountInfo: { login: 12345678, balance: 100000 },
        positions: [
          { symbol: "EURUSD", type: 0, volume: 1.0, price: 1.0850, sl: 1.0800, tp: 1.0950, profit: 250, swap: -1.5, openTime: new Date("2024-01-01") },
          { symbol: "GBPUSD", type: 1, volume: 0.5, price: 1.2500, sl: 1.2400, tp: 1.2600, profit: -100, swap: -0.5, openTime: new Date("2024-01-02") },
        ],
        orders: [],
        history: [],
        terminalInfo: { connected: true },
        timestamp: new Date(),
        provider: "MT5",
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      assert.strictEqual(result.snapshot!.positions.length, 2);
      assert.strictEqual(result.snapshot!.positions[0].symbol, "EURUSD");
      assert.strictEqual(result.snapshot!.positions[0].direction, "BUY");
      assert.strictEqual(result.snapshot!.positions[1].direction, "SELL");
    });
  });

  describe("Null handling", () => {
    it("handles null positions and orders", () => {
      const raw: ProviderSnapshot = {
        accountInfo: { login: 12345678, balance: 100000 },
        positions: null as unknown as ProviderPosition[],
        orders: null as unknown as ProviderOrder[],
        history: null as unknown as ProviderDeal[],
        terminalInfo: { connected: true },
        timestamp: new Date(),
        provider: "MT5",
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.snapshot!.positions, []);
      assert.deepStrictEqual(result.snapshot!.orders, []);
    });
  });

  describe("Timestamp normalization", () => {
    it("preserves timestamp from provider", () => {
      const ts = new Date("2024-06-15T12:00:00Z");
      const raw: ProviderSnapshot = {
        accountInfo: { login: 12345678, balance: 100000 },
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: true },
        timestamp: ts,
        provider: "MT5",
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      assert.deepStrictEqual(result.snapshot!.dataTimestamp, ts);
    });
  });

  describe("Safe errors", () => {
    it("includes error context without credentials", () => {
      const raw: ProviderSnapshot = {
        accountInfo: null,
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: false },
        timestamp: new Date(),
        provider: "MT5",
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      const credError = result.errors.find((e: NormalizeError) => JSON.stringify(e).includes("password") || JSON.stringify(e).includes("credential"));
      assert.strictEqual(credError, undefined);
    });
  });

  describe("No secret leakage", () => {
    it("does not include login in raw form in snapshot", () => {
      const raw: ProviderSnapshot = {
        accountInfo: { login: 12345678, balance: 100000 },
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: true },
        timestamp: new Date(),
        provider: "MT5",
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      const serialized = JSON.stringify(result.snapshot);
      assert.ok(!serialized.includes("12345678"));
      assert.ok(serialized.includes("[MASKED-12***]"));
    });
  });
});
