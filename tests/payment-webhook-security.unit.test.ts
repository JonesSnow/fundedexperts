import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { createMockPaymentProvider } from "../lib/mock-payment-provider";
import { getConfiguredProviderName, isRealProvider } from "../lib/payment-provider-registry";

const results = {
  pass: 0,
  fail: 0,
  tests: [] as Array<{ name: string; result: string; detail: string }>,
};

function check(name: string, condition: boolean, detail: string = "") {
  if (condition) {
    results.pass++;
    results.tests.push({ name, result: "PASS", detail });
  } else {
    results.fail++;
    results.tests.push({ name, result: "FAIL", detail });
  }
}

const KEYS = ["NODE_ENV", "PAYMENT_PROVIDER", "MOCK_PAYMENT_WEBHOOK_SECRET"];

function envSnapshot(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of KEYS) out[key] = process.env[key];
  return out;
}

function envRestore(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else Reflect.set(process.env, key, value);
  }
}

function setEnv(key: string, value: string): void {
  Reflect.set(process.env, key, value);
}

function signBody(rawBody: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function headersWith(secret: string, rawBody: Buffer, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-mock-payment-signature": signBody(rawBody, secret),
    ...extra,
  };
}

const secret = "webhook-unit-test-secret";
const body = Buffer.from(JSON.stringify({ orderId: "order-1", amount: 99.99, currency: "USD" }));

describe("Payment webhook security (mock provider)", () => {
  it("rejects construction of the mock provider outside tests", () => {
    const previous = envSnapshot();
    try {
      for (const environment of ["development", "production", undefined]) {
        if (environment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
        else Reflect.set(process.env, "NODE_ENV", environment);
        assert.throws(() => createMockPaymentProvider(), /available only in tests/);
      }
      check("mock provider refused outside tests", true);
    } finally {
      envRestore(previous);
    }
  });

  it("accepts a valid signature over the raw body", async () => {
    setEnv("NODE_ENV", "test");
    setEnv("MOCK_PAYMENT_WEBHOOK_SECRET", secret);
    const provider = createMockPaymentProvider();
    const result = await provider.verifyWebhookSignature({ rawBody: body, headers: headersWith(secret, body) });
    check("valid signature accepted", result.valid === true, `reason=${result.reason}`);
  });

  it("rejects a missing signature header", async () => {
    setEnv("NODE_ENV", "test");
    setEnv("MOCK_PAYMENT_WEBHOOK_SECRET", secret);
    const provider = createMockPaymentProvider();
    const result = await provider.verifyWebhookSignature({ rawBody: body, headers: { "content-type": "application/json" } });
    check("missing signature rejected", result.valid === false, `reason=${result.reason}`);
  });

  it("rejects an invalid signature", async () => {
    setEnv("NODE_ENV", "test");
    setEnv("MOCK_PAYMENT_WEBHOOK_SECRET", secret);
    const provider = createMockPaymentProvider();
    const result = await provider.verifyWebhookSignature({
      rawBody: body,
      headers: headersWith("wrong-secret", body),
    });
    check("invalid signature rejected", result.valid === false, `reason=${result.reason}`);
  });

  it("rejects an altered payload (same signature, modified body)", async () => {
    setEnv("NODE_ENV", "test");
    setEnv("MOCK_PAYMENT_WEBHOOK_SECRET", secret);
    const provider = createMockPaymentProvider();
    const altered = Buffer.from(JSON.stringify({ orderId: "order-1", amount: 1.00, currency: "USD" }));
    const result = await provider.verifyWebhookSignature({ rawBody: altered, headers: headersWith(secret, body) });
    check("altered payload rejected", result.valid === false, `reason=${result.reason}`);
  });

  it("extracts provider event id and status from verified headers", async () => {
    setEnv("NODE_ENV", "test");
    setEnv("MOCK_PAYMENT_WEBHOOK_SECRET", secret);
    const provider = createMockPaymentProvider();
    const result = await provider.verifyWebhookSignature({
      rawBody: body,
      headers: headersWith(secret, body, {
        "x-mock-payment-event-id": "evt_123",
        "x-mock-payment-status": "COMPLETED",
      }),
    });
    check("event id extracted", result.providerEventId === "evt_123");
    check("provider status extracted", result.providerStatus === "COMPLETED");
    check("valid signature", result.valid === true);
  });

  it("fails closed when the mock provider is configured in production", () => {
    const previous = envSnapshot();
    try {
      setEnv("NODE_ENV", "production");
      setEnv("PAYMENT_PROVIDER", "MOCK");
      check("no provider configured in production", getConfiguredProviderName() === null);
    } finally {
      envRestore(previous);
    }
  });

  it("returns the mock provider in tests when configured", () => {
    const previous = envSnapshot();
    try {
      setEnv("NODE_ENV", "test");
      setEnv("PAYMENT_PROVIDER", "MOCK");
      check("mock provider available in tests", getConfiguredProviderName() === "MOCK");
    } finally {
      envRestore(previous);
    }
  });

  it("returns null when no provider is configured", () => {
    const previous = envSnapshot();
    try {
      Reflect.deleteProperty(process.env, "PAYMENT_PROVIDER");
      check("no provider returns null", getConfiguredProviderName() === null);
    } finally {
      envRestore(previous);
    }
  });

  it("reports the mock provider as not a real provider", () => {
    check("mock is not real", isRealProvider() === false);
  });

  it("treats a re-sent identical event as signature-valid (replay prevention is durable idempotency at the route)", async () => {
    setEnv("NODE_ENV", "test");
    setEnv("MOCK_PAYMENT_WEBHOOK_SECRET", secret);
    const provider = createMockPaymentProvider();
    const first = await provider.verifyWebhookSignature({ rawBody: body, headers: headersWith(secret, body) });
    const replay = await provider.verifyWebhookSignature({ rawBody: body, headers: headersWith(secret, body) });
    check("original signature valid", first.valid === true);
    check("replayed body signature valid", replay.valid === true);
  });
});

after(() => {
  console.log(
    `Payment Webhook Security Tests: ${results.pass}/${results.pass + results.fail} passed`,
  );
  for (const t of results.tests) {
    if (t.result === "FAIL") console.error(`FAIL: ${t.name} — ${t.detail}`);
  }
  if (results.fail > 0) process.exit(1);
});
