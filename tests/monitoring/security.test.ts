import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeSnapshot } from "../../lib/monitoring/normalize";
import { ProviderSnapshot, ProviderName } from "../../lib/monitoring/types";

function validSnapshot(): ProviderSnapshot {
  return {
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
    terminalInfo: { connected: true, version: "1.2.3", build: "12345" },
    timestamp: new Date(),
    provider: "MT5" as ProviderName,
  };
}

describe("Security", () => {
  describe("No credentials in serialized output", () => {
    it("does not include login number in snapshot JSON", () => {
      const raw = validSnapshot();
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      const serialized = JSON.stringify(result.snapshot);
      assert.ok(!serialized.includes("12345678"));
      assert.ok(serialized.includes("[MASKED-12***]"));
    });
  });

  describe("No credentials in thrown errors", () => {
    it("does not include credentials in error messages", () => {
      const raw: ProviderSnapshot = {
        accountInfo: null,
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: false },
        timestamp: new Date(),
        provider: "MT5" as ProviderName,
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      for (const err of result.errors) {
        assert.ok(!JSON.stringify(err).includes("password"));
        assert.ok(!JSON.stringify(err).includes("credential"));
        assert.ok(!JSON.stringify(err).includes("secret"));
      }
    });
  });

  describe("Masking behavior", () => {
    it("masks login in accountInfo", () => {
      const raw = validSnapshot();
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      assert.strictEqual(result.accountInfo!.loginMasked, "[MASKED-12***]");
      assert.strictEqual(result.snapshot!.accountLoginMasked, "[MASKED-12***]");
    });

    it("handles short login numbers", () => {
      const raw: ProviderSnapshot = {
        ...validSnapshot(),
        accountInfo: { login: 12 },
      };
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5", raw);
      assert.strictEqual(result.accountInfo!.loginMasked, "[MASKED-12***]");
    });
  });

  describe("Mock data cannot be confused with live data", () => {
    it("provider field is explicit", () => {
      const raw = validSnapshot();
      const result = normalizeSnapshot("acc-1", "ACCT-001", "MT5" as ProviderName, raw);
      assert.strictEqual(result.snapshot!.provider, "MT5");
    });
  });
});
