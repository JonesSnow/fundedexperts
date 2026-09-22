import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MT5Adapter, AdapterAccountInput, AdapterFetchOptions } from "../../lib/monitoring/adapter";
import { MockMT5Adapter, MockAccountConfig, MockAdapterConfig } from "../../lib/monitoring/mock-adapter";
import { ProviderSnapshot, ProviderName } from "../../lib/monitoring/types";

describe("MockMT5Adapter", () => {
  let adapter: MockMT5Adapter;
  let config: MockAdapterConfig;

  beforeEach(() => {
    config = {
      accounts: [
        { accountId: "acc-1", accountNumber: "ACCT-001", healthy: true },
        { accountId: "acc-2", accountNumber: "ACCT-002", healthy: true },
        { accountId: "acc-3", accountNumber: "ACCT-003", healthy: true },
      ],
    };
    adapter = new MockMT5Adapter(config);
  });

  describe("Healthy account response", () => {
    it("returns valid snapshot for healthy account", async () => {
      const input: AdapterAccountInput = {
        accountId: "acc-1",
        accountNumber: "ACCT-001",
        provider: "MT5",
      };
      const result = await adapter.fetchSnapshot(input);
      assert.ok(result.accountInfo !== null);
      assert.strictEqual(result.accountInfo?.balance, 100000);
      assert.strictEqual(result.terminalInfo?.connected, true);
      assert.deepStrictEqual(result.positions, []);
      assert.deepStrictEqual(result.orders, []);
    });
  });

  describe("Account with reduced equity", () => {
    it("returns account with reduced equity", async () => {
      config.accounts[0] = { ...config.accounts[0], equity: 5000, balance: 10000, freeMargin: 3000, margin: 5000 };
      adapter = new MockMT5Adapter(config);
      const input: AdapterAccountInput = { accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" };
      const result = await adapter.fetchSnapshot(input);
      assert.strictEqual(result.accountInfo?.equity, 5000);
      assert.strictEqual(result.accountInfo?.balance, 10000);
    });
  });

  describe("Account with open positions", () => {
    it("returns account with positions", async () => {
      config.accounts[0] = {
        ...config.accounts[0],
        positions: [
          { symbol: "EURUSD", type: 0, volume: 1.0, price: 1.0850, sl: 1.0800, tp: 1.0950, profit: 250, swap: -1.5, openTime: new Date() },
        ],
      };
      adapter = new MockMT5Adapter(config);
      const input: AdapterAccountInput = { accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" };
      const result = await adapter.fetchSnapshot(input);
      assert.strictEqual(result.positions.length, 1);
      assert.strictEqual(result.positions[0].symbol, "EURUSD");
    });
  });

  describe("Account with pending orders", () => {
    it("returns account with orders", async () => {
      config.accounts[0] = {
        ...config.accounts[0],
        orders: [
          { symbol: "GBPUSD", type: 0, volume: 0.5, price: 1.2500, state: 0, time: new Date() },
        ],
      };
      adapter = new MockMT5Adapter(config);
      const input: AdapterAccountInput = { accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" };
      const result = await adapter.fetchSnapshot(input);
      assert.strictEqual(result.orders.length, 1);
      assert.strictEqual(result.orders[0].symbol, "GBPUSD");
    });
  });

  describe("Disconnected terminal", () => {
    it("returns disconnected snapshot", async () => {
      config.accounts[0] = { ...config.accounts[0], disconnected: true };
      adapter = new MockMT5Adapter(config);
      const input: AdapterAccountInput = { accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" };
      const result = await adapter.fetchSnapshot(input);
      assert.strictEqual(result.terminalInfo?.connected, false);
      assert.strictEqual(result.accountInfo, null);
    });

    it("testConnection returns false for disconnected", async () => {
      config.accounts[0] = { ...config.accounts[0], disconnected: true };
      adapter = new MockMT5Adapter(config);
      const result = await adapter.testConnection("acc-1");
      assert.strictEqual(result.connected, false);
    });
  });

  describe("Missing account data", () => {
    it("returns account info with null fields for missing data", async () => {
      config.accounts[0] = { ...config.accounts[0], missingData: true };
      adapter = new MockMT5Adapter(config);
      const input: AdapterAccountInput = { accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" };
      const result = await adapter.fetchSnapshot(input);
      assert.strictEqual(result.accountInfo?.balance, null);
      assert.strictEqual(result.accountInfo?.login, null);
    });
  });

  describe("Stale data timestamp", () => {
    it("returns stale timestamp", async () => {
      config.accounts[0] = { ...config.accounts[0], staleData: true };
      adapter = new MockMT5Adapter(config);
      const input: AdapterAccountInput = { accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" };
      const result = await adapter.fetchSnapshot(input);
      assert.ok(result.timestamp !== null);
      const age = Date.now() - (result.timestamp as Date).getTime();
      assert.ok(age > 300000);
    });
  });

  describe("Provider timeout", () => {
    it("throws timeout error for timeout config", async () => {
      config.accounts[0] = { ...config.accounts[0], timeout: true };
      adapter = new MockMT5Adapter(config);
      const input: AdapterAccountInput = { accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" };
      await assert.rejects(adapter.fetchSnapshot(input), /Provider request timed out/);
    });
  });

  describe("Provider error", () => {
    it("returns empty snapshot for provider error", async () => {
      config.accounts[0] = { ...config.accounts[0], providerError: true };
      adapter = new MockMT5Adapter(config);
      const input: AdapterAccountInput = { accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" };
      const result = await adapter.fetchSnapshot(input);
      assert.strictEqual(result.accountInfo, null);
      assert.deepStrictEqual(result.positions, []);
    });
  });

  describe("Malformed response", () => {
    it("returns malformed snapshot", async () => {
      config.accounts[0] = { ...config.accounts[0], malformed: true };
      adapter = new MockMT5Adapter(config);
      const input: AdapterAccountInput = { accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" };
      const result = await adapter.fetchSnapshot(input);
      assert.strictEqual(result.terminalInfo?.connected, true);
    });
  });

  describe("Multiple mock accounts", () => {
    it("returns different data for different accounts", async () => {
      config.accounts[0] = { ...config.accounts[0], balance: 100000 };
      config.accounts[1] = { ...config.accounts[1], balance: 50000, equity: 48000 };
      config.accounts[2] = { ...config.accounts[2], balance: 200000, equity: 195000 };
      adapter = new MockMT5Adapter(config);

      const r1 = await adapter.fetchSnapshot({ accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" });
      const r2 = await adapter.fetchSnapshot({ accountId: "acc-2", accountNumber: "ACCT-002", provider: "MT5" });
      const r3 = await adapter.fetchSnapshot({ accountId: "acc-3", accountNumber: "ACCT-003", provider: "MT5" });

      assert.strictEqual(r1.accountInfo?.balance, 100000);
      assert.strictEqual(r2.accountInfo?.balance, 50000);
      assert.strictEqual(r3.accountInfo?.balance, 200000);
    });

    it("does not share state between accounts", async () => {
      config.accounts[0] = { ...config.accounts[0], positions: [{ symbol: "EURUSD", type: 0, volume: 1.0, price: 1.0850, sl: 1.0800, tp: 1.0950, profit: 250, swap: -1.5, openTime: new Date() }] };
      adapter = new MockMT5Adapter(config);

      const r1 = await adapter.fetchSnapshot({ accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" });
      const r2 = await adapter.fetchSnapshot({ accountId: "acc-2", accountNumber: "ACCT-002", provider: "MT5" });

      assert.strictEqual(r1.positions.length, 1);
      assert.strictEqual(r2.positions.length, 0);
    });
  });

  describe("Repeated identical snapshots", () => {
    it("returns same structure for repeated calls", async () => {
      const input: AdapterAccountInput = { accountId: "acc-1", accountNumber: "ACCT-001", provider: "MT5" };
      const r1 = await adapter.fetchSnapshot(input);
      const r2 = await adapter.fetchSnapshot(input);
      assert.strictEqual(r1.accountInfo?.balance, r2.accountInfo?.balance);
      assert.strictEqual(r1.terminalInfo?.connected, r2.terminalInfo?.connected);
    });
  });

  describe("Account not found", () => {
    it("returns empty snapshot for unknown account", async () => {
      const input: AdapterAccountInput = { accountId: "nonexistent", accountNumber: "ACCT-999", provider: "MT5" };
      const result = await adapter.fetchSnapshot(input);
      assert.strictEqual(result.accountInfo, null);
      assert.deepStrictEqual(result.positions, []);
    });
  });

  describe("Disconnect", () => {
    it("marks account as disconnected", async () => {
      await adapter.disconnect("acc-1");
      const result = await adapter.testConnection("acc-1");
      assert.strictEqual(result.connected, false);
    });
  });
});
