import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  maskLogin,
  createCredentialSet,
  validateCredentials,
  supportsProvider,
  type ProviderCredentials,
  type CredentialSet,
  type CredentialValidationResult,
} from "../../lib/monitoring/credential-boundary";

describe("maskLogin", () => {
  it("masks all but last 4 digits", () => {
    assert.strictEqual(maskLogin(12345678), "****5678");
  });

  it("masks short numbers completely", () => {
    assert.strictEqual(maskLogin(1234), "****");
  });

  it("handles string login", () => {
    assert.strictEqual(maskLogin("12345678"), "****5678");
  });

  it("masks single digit", () => {
    assert.strictEqual(maskLogin(1), "****");
  });

  it("handles very long login", () => {
    assert.strictEqual(maskLogin(123456789012345), "****2345");
  });
});

describe("createCredentialSet", () => {
  it("creates masked credential set", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "Server-XM",
      login: 12345678,
      password: "secret",
      connectionTimeoutMs: 5000,
    };
    const set: CredentialSet = createCredentialSet(creds);
    assert.strictEqual(set.providerType, "mt5");
    assert.strictEqual(set.maskedLogin, "****5678");
  });

  it("does not include password in credential set", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "Server-XM",
      login: 12345678,
      password: "super-secret",
      connectionTimeoutMs: 5000,
    };
    const set: CredentialSet = createCredentialSet(creds);
    assert.strictEqual(set.maskedLogin, "****5678");
    assert.ok(!JSON.stringify(set).includes("super-secret"));
  });
});

describe("validateCredentials", () => {
  it("accepts valid credentials", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "Server-XM",
      login: 12345678,
      password: "pass",
      connectionTimeoutMs: 5000,
    };
    const result: CredentialValidationResult = validateCredentials(creds);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it("rejects empty server", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "",
      login: 12345678,
      password: "pass",
      connectionTimeoutMs: 5000,
    };
    const result: CredentialValidationResult = validateCredentials(creds);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Server")));
  });

  it("rejects whitespace-only server", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "   ",
      login: 12345678,
      password: "pass",
      connectionTimeoutMs: 5000,
    };
    const result: CredentialValidationResult = validateCredentials(creds);
    assert.strictEqual(result.valid, false);
  });

  it("rejects zero login", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "Server-XM",
      login: 0,
      password: "pass",
      connectionTimeoutMs: 5000,
    };
    const result: CredentialValidationResult = validateCredentials(creds);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Login")));
  });

  it("rejects negative login", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "Server-XM",
      login: -1,
      password: "pass",
      connectionTimeoutMs: 5000,
    };
    const result: CredentialValidationResult = validateCredentials(creds);
    assert.strictEqual(result.valid, false);
  });

  it("rejects missing password", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "Server-XM",
      login: 12345678,
      password: "",
      connectionTimeoutMs: 5000,
    };
    const result: CredentialValidationResult = validateCredentials(creds);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Password")));
  });

  it("rejects zero timeout", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "Server-XM",
      login: 12345678,
      password: "pass",
      connectionTimeoutMs: 0,
    };
    const result: CredentialValidationResult = validateCredentials(creds);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("timeout")));
  });

  it("rejects multiple invalid fields", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "",
      login: 0,
      password: "",
      connectionTimeoutMs: 0,
    };
    const result: CredentialValidationResult = validateCredentials(creds);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length >= 3);
  });

  it("accepts minimal valid timeout", () => {
    const creds: ProviderCredentials = {
      providerType: "mt5",
      server: "Server-XM",
      login: 1,
      password: "p",
      connectionTimeoutMs: 1,
    };
    const result: CredentialValidationResult = validateCredentials(creds);
    assert.strictEqual(result.valid, true);
  });
});

describe("supportsProvider", () => {
  it("supports mt5", () => {
    assert.strictEqual(supportsProvider("mt5"), true);
  });

  it("supports demo", () => {
    assert.strictEqual(supportsProvider("demo"), true);
  });

  it("supports mock", () => {
    assert.strictEqual(supportsProvider("mock"), true);
  });

  it("rejects unknown providers", () => {
    assert.strictEqual(supportsProvider("unknown"), false);
  });
});
