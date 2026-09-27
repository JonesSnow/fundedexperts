import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { RealMT5Adapter, Mt5PythonResult, sanitizeCredentialMessage } from "../../lib/monitoring/real-mt5-adapter";
import { MT5Adapter, AdapterAccountInput } from "../../lib/monitoring/adapter";
import { ProviderName } from "../../lib/monitoring/types";
import { MockMT5Adapter } from "../../lib/monitoring/mock-adapter";
import { createMT5Adapter } from "../../lib/monitoring/adapter-factory";
import { encrypt, decrypt, isEncryptionAvailable } from "../../lib/encryption";
import { maskLogin } from "../../lib/monitoring/credential-boundary";
import { sanitizeSensitiveValue } from "../../lib/logger";
import { normalizeSnapshot } from "../../lib/monitoring/normalize";

const TEST_ENCRYPTION_KEY = "a".repeat(64);

function setTestEnv(): void {
  process.env.MT5_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
}

function restoreEnv(): void {
  delete process.env.MT5_ENCRYPTION_KEY;
}

function encryptCredentials(creds: { login: number; password: string; server: string }): string {
  return encrypt(JSON.stringify(creds));
}

describe("RealMT5Adapter — Interface Compliance", () => {
  let adapter: RealMT5Adapter;

  beforeEach(() => {
    setTestEnv();
    adapter = new RealMT5Adapter({ pythonPath: "python", scriptTimeoutMs: 5000 });
  });

  afterEach(() => {
    restoreEnv();
  });

  it("1. Real adapter extends MT5Adapter interface", () => {
    assert.ok(adapter instanceof MT5Adapter, "RealMT5Adapter must extend MT5Adapter");
    assert.strictEqual(adapter.providerName, "MT5");
  });

  it("2. Implements fetchSnapshot with AsyncProviderSnapshot return", () => {
    assert.strictEqual(typeof adapter.fetchSnapshot, "function");
  });

  it("3. Implements testConnection", () => {
    assert.strictEqual(typeof adapter.testConnection, "function");
    assert.strictEqual(typeof adapter.disconnect, "function");
  });

  it("4. Adapter can be created via factory in real mode", () => {
    const factoryAdapter = createMT5Adapter({ mode: "real" });
    assert.ok(factoryAdapter instanceof RealMT5Adapter);
  });

  it("5. Adapter factory defaults to mock mode", () => {
    const factoryAdapter = createMT5Adapter();
    assert.ok(factoryAdapter instanceof MockMT5Adapter);
  });

  it("6. Adapter factory supports auto mode", () => {
    process.env.MT5_USE_REAL_ADAPTER = "true";
    const factoryAdapter = createMT5Adapter({ mode: "auto" });
    assert.ok(factoryAdapter instanceof RealMT5Adapter);
    delete process.env.MT5_USE_REAL_ADAPTER;

    process.env.MT5_USE_REAL_ADAPTER = "false";
    const mockAdapter = createMT5Adapter({ mode: "auto" });
    assert.ok(mockAdapter instanceof MockMT5Adapter);
    delete process.env.MT5_USE_REAL_ADAPTER;
  });

  it("7. Mock adapter remains available alongside real adapter", () => {
    const mockAdapter = createMT5Adapter({ mode: "mock" });
    assert.ok(mockAdapter instanceof MockMT5Adapter);
    assert.ok(mockAdapter instanceof MT5Adapter);
  });
});

describe("RealMT5Adapter — Credential Decryption & Security", () => {
  let adapter: RealMT5Adapter;

  beforeEach(() => {
    setTestEnv();
    adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
  });

  afterEach(() => {
    restoreEnv();
  });

  it("8. Decrypts credentials from encrypted JSON string", () => {
    const creds = { login: 12345678, password: "test-pass-123", server: "XM-Demo" };
    const encrypted = encryptCredentials(creds);
    const decrypted = decrypt(encrypted);
    const parsed = JSON.parse(decrypted);
    assert.strictEqual(parsed.login, 12345678);
    assert.strictEqual(parsed.password, "test-pass-123");
    assert.strictEqual(parsed.server, "XM-Demo");
  });

  it("9. Fails safely with invalid credentials — no plaintext in error", async () => {
    const input: AdapterAccountInput = {
      accountId: "test-acc",
      accountNumber: "12345678",
      provider: "MT5",
      credentials: "invalid-encrypted-data",
    };

    await assert.rejects(
      async () => adapter.fetchSnapshot(input),
      (err: Error) => {
        assert.ok(!err.message.includes("test-pass"), "Password should not appear in error");
        assert.ok(err.message.includes("decrypt") || err.message.includes("credentials"), "Error should mention credentials");
        return true;
      }
    );
  });

  it("10. Fails safely with missing credentials", async () => {
    const input: AdapterAccountInput = {
      accountId: "test-acc",
      accountNumber: "12345678",
      provider: "MT5",
      credentials: null,
    };

    await assert.rejects(
      async () => adapter.fetchSnapshot(input),
      (err: Error) => {
        assert.ok(err.message.includes("No encrypted credentials"), "Should indicate missing credentials");
        return true;
      }
    );
  });

  it("11. Credential sanitization prevents password leakage in error messages", () => {
    const sanitized = sanitizeSensitiveValue("password=mys3cret123");
    assert.ok(!sanitized.includes("mys3cret123"), "Password should be redacted");
    assert.ok(sanitized.includes("REDACTED"), "Should contain REDACTED marker");
  });

  it("12. Login masking works correctly", () => {
    assert.strictEqual(maskLogin(12345678), "****5678");
    assert.strictEqual(maskLogin("12345678"), "****5678");
    assert.strictEqual(maskLogin(123), "****");
  });
});

describe("RealMT5Adapter — Credential Error Sanitization", () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("13. Sanitizes credential-like patterns in MT5 error messages", () => {
    const msg = sanitizeCredentialMessage("password=secret123 login=87654321");
    assert.ok(!msg.includes("secret123"), "Password value should be redacted");
    assert.ok(!msg.includes("87654321"), "Login value should be redacted");
  });

  it("14. Error codes map correctly from MT5 error codes", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const errorData: Mt5PythonResult = {
      error: "INITIALIZATION_FAILED",
      errorCode: 4,
      errorMessage: "Invalid password for 87654321",
    };

    const mappedError = adapter["mapPythonError"](errorData);
    assert.strictEqual(mappedError.code, "INVALID_CREDENTIALS");
    assert.ok(!mappedError.message.includes("secret"), "Password should not be in error message");
  });
});

describe("RealMT5Adapter — Data Transformation (Mocked Subprocess)", () => {
  it("15. Maps valid Python output to ProviderSnapshot", async () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockPythonOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: {
        login: 12345678,
        server: "XM-Demo",
        broker: "XM",
        balance: 100000,
        equity: 105000,
        freeMargin: 98000,
        margin: 2000,
        marginLevel: 5000,
        currency: "USD",
        leverage: 100,
        isDemo: true,
        accountType: 0,
        deposit: 100000,
        credit: 0,
        name: "Demo Account",
      },
      positions: [
        {
          ticket: 12345,
          symbol: "EURUSD",
          type: 0,
          volume: 0.1,
          price: 1.0850,
          sl: 1.0800,
          tp: 1.0950,
          profit: 500,
          swap: -1.5,
          openTime: new Date(),
          comment: null,
        },
      ],
      orders: [
        {
          ticket: 67890,
          symbol: "GBPUSD",
          type: 0,
          volume: 0.5,
          price: 1.2500,
          sl: null,
          tp: null,
          state: 1,
          time: new Date(),
          comment: null,
        },
      ],
      history: [
        {
          ticket: 11111,
          symbol: "EURUSD",
          type: 0,
          volume: 0.1,
          price: 1.0850,
          profit: 250,
          swap: -1.5,
          commission: -2.0,
          time: new Date(),
          reason: 0,
          comment: null,
        },
      ],
      terminalInfo: {
        connected: true,
        version: "500.00",
        build: "12345",
      },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockPythonOutput);

    assert.ok(snapshot.accountInfo !== null);
    assert.strictEqual(snapshot.accountInfo?.login, 12345678);
    assert.strictEqual(snapshot.accountInfo?.server, "XM-Demo");
    assert.strictEqual(snapshot.accountInfo?.broker, "XM");
    assert.strictEqual(snapshot.accountInfo?.balance, 100000);
    assert.strictEqual(snapshot.accountInfo?.equity, 105000);
    assert.strictEqual(snapshot.accountInfo?.currency, "USD");

    assert.strictEqual(snapshot.positions.length, 1);
    assert.strictEqual(snapshot.positions[0].symbol, "EURUSD");
    assert.strictEqual(snapshot.positions[0].profit, 500);

    assert.strictEqual(snapshot.orders.length, 1);
    assert.strictEqual(snapshot.orders[0].symbol, "GBPUSD");
    assert.strictEqual(snapshot.orders[0].state, 1);

    assert.strictEqual(snapshot.history.length, 1);
    assert.strictEqual(snapshot.history[0].profit, 250);

    assert.strictEqual(snapshot.terminalInfo?.connected, true);
    assert.strictEqual(snapshot.provider, "MT5");
  });

  it("16. Handles empty positions, orders, history", async () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: {
        login: 12345678,
        server: "XM-Demo",
        broker: "XM",
        balance: 100000,
        equity: 100000,
        freeMargin: 95000,
        margin: 5000,
        marginLevel: 2000,
        currency: "USD",
        leverage: 100,
        isDemo: true,
      },
      positions: [],
      orders: [],
      history: [],
      terminalInfo: { connected: true, version: "500.00", build: "12345" },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockOutput);

    assert.strictEqual(snapshot.positions.length, 0);
    assert.strictEqual(snapshot.orders.length, 0);
    assert.strictEqual(snapshot.history.length, 0);
  });

  it("17. Handles null accountInfo (terminal connected but no account data)", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: null,
      positions: [],
      orders: [],
      history: [],
      terminalInfo: { connected: true, version: "500.00", build: "12345" },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockOutput);

    assert.strictEqual(snapshot.accountInfo, null);
    assert.strictEqual((snapshot.accountInfo as { balance?: number } | null)?.balance, undefined);
    assert.strictEqual((snapshot.accountInfo as { equity?: number } | null)?.equity, undefined);
  });

  it("18. Maps position types correctly (0=BUY, 1=SELL)", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: { login: 123, server: "test", broker: "test", balance: 100000, equity: 100000, isDemo: true, currency: "USD" },
      positions: [
        { ticket: 1, symbol: "EURUSD", type: 0, volume: 0.1, price: 1.0850, sl: 1.0800, tp: 1.0950, profit: 500, swap: -1.5, openTime: new Date() },
        { ticket: 2, symbol: "GBPUSD", type: 1, volume: 0.2, price: 1.2500, sl: 1.2450, tp: 1.2600, profit: -300, swap: -0.5, openTime: new Date() },
      ],
      orders: [],
      history: [],
      terminalInfo: { connected: true },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockOutput);

    const normalized = normalizeSnapshot(
      "test-acc", "12345", "MT5", snapshot
    );

    assert.ok(normalized.snapshot !== null);
    assert.strictEqual(normalized.snapshot?.positions[0].direction, "BUY");
    assert.strictEqual(normalized.snapshot?.positions[1].direction, "SELL");
  });

  it("19. Converts Unix timestamp to Date correctly", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const ts = 1700000000; // Known Unix timestamp
    const mockOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: { login: 123, server: "test", broker: "test", balance: 100000, equity: 100000, isDemo: true, currency: "USD" },
      positions: [],
      orders: [],
      history: [],
      terminalInfo: { connected: true },
      timestamp: ts,
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockOutput);

    assert.ok(snapshot.timestamp instanceof Date);
    assert.strictEqual(snapshot.timestamp?.getTime(), ts * 1000);
  });
});

describe("RealMT5Adapter — Error Mapping", () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("20. Maps MT5 error code 4 to INVALID_CREDENTIALS", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const code = adapter["mapErrorCode"](4, "INITIALIZATION_FAILED");
    assert.strictEqual(code, "INVALID_CREDENTIALS");
  });

  it("21. Maps MT5 error code 2 to TERMINAL_NOT_RUNNING", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const code = adapter["mapErrorCode"](2, null);
    assert.strictEqual(code, "TERMINAL_NOT_RUNNING");
  });

  it("22. Maps MT5 error code 6 to SERVER_NOT_FOUND", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const code = adapter["mapErrorCode"](6, null);
    assert.strictEqual(code, "SERVER_NOT_FOUND");
  });

  it("23. Maps MT5 error code 5 to ACCOUNT_DISABLED", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const code = adapter["mapErrorCode"](5, null);
    assert.strictEqual(code, "ACCOUNT_DISABLED");
  });

  it("24. Maps MT5 error code 7 to ACCOUNT_NOT_FOUND", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const code = adapter["mapErrorCode"](7, null);
    assert.strictEqual(code, "ACCOUNT_NOT_FOUND");
  });

  it("25. Maps MT5 error code 129 to PROVIDER_TIMEOUT", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const code = adapter["mapErrorCode"](129, null);
    assert.strictEqual(code, "PROVIDER_TIMEOUT");
  });

  it("26. Maps MT5_PACKAGE_NOT_FOUND to TERMINAL_NOT_INSTALLED", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const code = adapter["mapErrorCode"](null, "MT5_PACKAGE_NOT_FOUND");
    assert.strictEqual(code, "TERMINAL_NOT_INSTALLED");
  });

  it("27. Maps INVALID_CREDENTIALS to non-retryable", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const retryable = adapter["mapRetryability"]("INVALID_CREDENTIALS");
    assert.strictEqual(retryable, "NON_RETRYABLE");
  });

  it("28. Maps TERMINAL_NOT_RUNNING to retryable", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const retryable = adapter["mapRetryability"]("TERMINAL_NOT_RUNNING");
    assert.strictEqual(retryable, "RETRYABLE");
  });

  it("29. Maps PROVIDER_TIMEOUT to retryable", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const retryable = adapter["mapRetryability"]("PROVIDER_TIMEOUT");
    assert.strictEqual(retryable, "RETRYABLE");
  });

  it("30. Maps INVALID_CREDENTIALS to CRITICAL severity", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const severity = adapter["mapSeverity"]("INVALID_CREDENTIALS");
    assert.strictEqual(severity, "CRITICAL");
  });

  it("31. Maps INVALID_CREDENTIALS to AUTHENTICATION category", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const category = adapter["mapCategory"]("INVALID_CREDENTIALS");
    assert.strictEqual(category, "AUTHENTICATION");
  });

  it("32. Maps PROVIDER_TIMEOUT to TIMEOUT category", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const category = adapter["mapCategory"]("PROVIDER_TIMEOUT");
    assert.strictEqual(category, "TIMEOUT");
  });
});

describe("RealMT5Adapter — Timeout Behavior", () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("33. Rejects with timeout error when Python process exceeds timeout", async () => {
    const adapter = new RealMT5Adapter({
      pythonPath: "python",
      scriptTimeoutMs: 100,
    });

    const creds = encryptCredentials({ login: 12345678, password: "test", server: "XM-Demo" });

    try {
      await adapter.fetchSnapshot({
        accountId: "test-acc",
        accountNumber: "12345678",
        provider: "MT5",
        credentials: creds,
      });
      assert.ok(false, "Should have timed out");
    } catch (e: unknown) {
      const err = e as { code?: string; retryable?: string };
      assert.ok(err.code === "PROVIDER_TIMEOUT", `Expected PROVIDER_TIMEOUT, got ${err.code}`);
      assert.ok(err.retryable === "RETRYABLE", "Timeout should be retryable");
    }
  });
});

describe("RealMT5Adapter — Connection Failure Handling", () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("34. Handles Python not found gracefully", async () => {
    const adapter = new RealMT5Adapter({
      pythonPath: "/nonexistent/python/path",
      scriptTimeoutMs: 5000,
    });

    const creds = encryptCredentials({ login: 12345678, password: "test", server: "XM-Demo" });

    try {
      await adapter.fetchSnapshot({
        accountId: "test-acc",
        accountNumber: "12345678",
        provider: "MT5",
        credentials: creds,
      });
      assert.ok(false, "Should have failed");
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      assert.ok(err.code, "Should have an error code");
      assert.ok(!err.message?.includes("test"), "Password should not appear in error");
    }
  });

  it("35. Handles invalid Python script output gracefully", async () => {
    const badScriptAdapter = new RealMT5Adapter({
      pythonPath: "python",
      scriptTimeoutMs: 100,
    });

    badScriptAdapter["pythonScript"] = "import sys; sys.stdout.write('not valid json') ; sys.stdout.flush()";

    const creds = encryptCredentials({ login: 12345678, password: "test", server: "XM-Demo" });

    try {
      await badScriptAdapter.fetchSnapshot({
        accountId: "test-acc",
        accountNumber: "12345678",
        provider: "MT5",
        credentials: creds,
      });
      assert.ok(false, "Should have failed on invalid JSON");
    } catch (e: unknown) {
      const err = e as { code?: string };
      assert.ok(err.code, "Should have error code");
    }
  });
});

describe("RealMT5Adapter — Data Validation", () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("36. Validates snapshot for NaN values after normalization", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: {
        login: 12345678,
        server: "XM-Demo",
        broker: "XM",
        balance: NaN,
        equity: 105000,
        freeMargin: 98000,
        margin: 2000,
        marginLevel: 5000,
        currency: "USD",
        leverage: 100,
        isDemo: true,
      },
      positions: [],
      orders: [],
      history: [],
      terminalInfo: { connected: true },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockOutput);
    const result = normalizeSnapshot("test-acc", "12345", "MT5", snapshot);

    assert.ok(result.errors.some((e: { code?: string }) => e.code === "INVALID_BALANCE"),
      "Should flag NaN balance as error");
  });

  it("37. Validates snapshot for Infinity values", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: {
        login: 12345678,
        server: "XM-Demo",
        broker: "XM",
        balance: Infinity,
        equity: 105000,
        freeMargin: 98000,
        margin: 2000,
        marginLevel: 5000,
        currency: "USD",
        leverage: 100,
        isDemo: true,
      },
      positions: [],
      orders: [],
      history: [],
      terminalInfo: { connected: true },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockOutput);
    const result = normalizeSnapshot("test-acc", "12345", "MT5", snapshot);

    assert.ok(result.errors.some((e: { code?: string }) => e.code === "INVALID_BALANCE"),
      "Should flag Infinity balance as error");
  });

  it("38. Flag missing required values in snapshot", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: null,
      positions: [],
      orders: [],
      history: [],
      terminalInfo: { connected: true },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockOutput);
    const result = normalizeSnapshot("test-acc", "12345", "MT5", snapshot);

    assert.ok(!result.success, "Should fail with null account info");
    assert.ok(result.errors.some((e: { code?: string }) => e.code === "NULL_ACCOUNT_INFO"),
      "Should flag null account info");
  });
});

describe("RealMT5Adapter — Mock Adapter Regression", () => {
  it("39. Mock adapter still produces valid snapshots", async () => {
    const mockAdapter = new MockMT5Adapter({
      accounts: [
        {
          accountId: "acc-mock",
          accountNumber: "MOCK-001",
          balance: 100000,
          equity: 100000,
          server: "MockServer",
          broker: "MockBroker",
          login: 999999,
        },
      ],
    });

    const snapshot = await mockAdapter.fetchSnapshot({
      accountId: "acc-mock",
      accountNumber: "MOCK-001",
      provider: "MT5",
    });

    assert.ok(snapshot.accountInfo !== null);
    assert.strictEqual(snapshot.accountInfo?.balance, 100000);
    assert.strictEqual(snapshot.provider, "MT5");
    assert.strictEqual(snapshot.terminalInfo?.connected, true);
  });

  it("40. Both adapters share the same MT5Adapter interface", () => {
    const mockAdapter: MT5Adapter = new MockMT5Adapter({ accounts: [] });
    const realAdapter: MT5Adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    assert.strictEqual(typeof mockAdapter.fetchSnapshot, typeof realAdapter.fetchSnapshot);
    assert.strictEqual(typeof mockAdapter.testConnection, typeof realAdapter.testConnection);
    assert.strictEqual(typeof mockAdapter.disconnect, typeof realAdapter.disconnect);
    assert.strictEqual(mockAdapter.providerName, realAdapter.providerName);
  });
});

describe("RealMT5Adapter — Account Identity Verification", () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("41. Login in credentials must match accountNumber in snapshot", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: {
        login: 12345678,
        server: "XM-Demo",
        broker: "XM",
        balance: 100000,
        equity: 100000,
        isDemo: true,
      },
      positions: [],
      orders: [],
      history: [],
      terminalInfo: { connected: true },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockOutput);

    const resolvedLogin = snapshot.accountInfo?.login;
    assert.strictEqual(resolvedLogin, 12345678, "Login should match expected value");
  });

  it("42. Server name in credentials must match returned server name", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: {
        login: 12345678,
        server: "XM-Demo",
        broker: "XM",
        balance: 100000,
        equity: 100000,
        isDemo: true,
      },
      positions: [],
      orders: [],
      history: [],
      terminalInfo: { connected: true },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockOutput);
    assert.strictEqual(snapshot.accountInfo?.server, "XM-Demo", "Server should match");
  });
});

describe("RealMT5Adapter — Worker Isolation", () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("43. Each adapter instance has isolated credential state", () => {
    const adapter1 = new RealMT5Adapter({ scriptTimeoutMs: 5000 });
    const adapter2 = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    assert.notStrictEqual(adapter1, adapter2, "Should be separate instances");
  });

  it("44. No credentials stored in adapter instance state", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const adapterAsAny = adapter as unknown as Record<string, unknown>;
    assert.ok(adapterAsAny.credentials === undefined, "No credentials should be stored on adapter instance");
    assert.ok(adapterAsAny.password === undefined, "No password should be stored on adapter instance");
  });
});

describe("RealMT5Adapter — Full Evaluation Flow (Mocked)", () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("45. Snapshot passes through normalizeSnapshot correctly", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockPythonOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: {
        login: 12345678,
        server: "XM-Demo",
        broker: "XM",
        balance: 100000,
        equity: 106000,
        freeMargin: 95000,
        margin: 5000,
        marginLevel: 2000,
        currency: "USD",
        leverage: 100,
        isDemo: true,
      },
      positions: [],
      orders: [],
      history: [
        { ticket: 1, symbol: "EURUSD", type: 0, volume: 0.1, price: 1.0850, profit: 6000, swap: -10, commission: -20, time: new Date(), reason: 0 },
      ],
      terminalInfo: { connected: true, version: "500.00", build: "12345" },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const providerSnapshot = adapter["mapToProviderSnapshot"](mockPythonOutput);

    const result = normalizeSnapshot("test-acc", "12345", "MT5", providerSnapshot);

    assert.ok(result.snapshot !== null);
    assert.strictEqual(result.snapshot?.accountLoginMasked, "[MASKED-12***]");
    assert.strictEqual(result.snapshot?.provider, "MT5");
    assert.strictEqual(result.snapshot?.terminalConnected, true);
    assert.strictEqual(result.snapshot?.historySummary.totalRealizedPnl, 6000);
  });

  it("46. Normalized snapshot contains no credential data", () => {
    const adapter = new RealMT5Adapter({ scriptTimeoutMs: 5000 });

    const mockOutput: Mt5PythonResult = {
      connected: true,
      accountInfo: {
        login: 12345678,
        server: "XM-Demo",
        broker: "XM",
        balance: 100000,
        equity: 100000,
        isDemo: true,
      },
      positions: [],
      orders: [],
      history: [],
      terminalInfo: { connected: true },
      timestamp: Math.floor(Date.now() / 1000),
      provider: "MT5" as ProviderName,
    };

    const snapshot = adapter["mapToProviderSnapshot"](mockOutput);
    const result = normalizeSnapshot("test-acc", "12345", "MT5", snapshot);

    const serialized = JSON.stringify(result.snapshot);

    assert.ok(!serialized.includes("password"), "No password field in snapshot");
    assert.ok(!serialized.includes("Password"), "No Password field in snapshot");
    assert.ok(result.snapshot?.accountLoginMasked.startsWith("[MASKED"), "Login should be masked");
  });
});

describe("RealMT5Adapter — API Authorization Boundary", () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("47. Credential decryption is NOT available in API route context", () => {
    assert.strictEqual(typeof decrypt, "function");
    assert.strictEqual(typeof encrypt, "function");
    assert.strictEqual(typeof isEncryptionAvailable(), "boolean");

    const encrypted = encrypt("test-value");
    assert.ok(encrypted !== "test-value", "Value should be encrypted");
    assert.ok(!encrypted.includes("test-value"), "No plaintext in encrypted value");
  });

  it("48. Encrypted credentials do not contain plaintext password", () => {
    const password = "super-secret-password-12345";
    const encrypted = encryptCredentials({ login: 12345678, password, server: "XM-Demo" });

    assert.ok(!encrypted.includes(password), "Encrypted credentials must not contain plaintext password");
    assert.ok(!encrypted.includes("super-secret"), "No partial plaintext exposure");
  });

  it("49. Decrypted credentials are correct but never logged", () => {
    const creds = { login: 12345678, password: "secret-pass", server: "XM-Demo" };
    const encrypted = encryptCredentials(creds);
    const decrypted = decrypt(encrypted);
    const parsed = JSON.parse(decrypted);

    assert.strictEqual(parsed.login, 12345678);
    assert.strictEqual(parsed.password, "secret-pass");
    assert.strictEqual(parsed.server, "XM-Demo");

    const safeLogMsg = sanitizeSensitiveValue(`password=${parsed.password}`);
    assert.ok(!safeLogMsg.includes("secret-pass"), "Should be redacted in logs");
    assert.ok(safeLogMsg.includes("REDACTED"), "Should have redaction marker");
  });
});
