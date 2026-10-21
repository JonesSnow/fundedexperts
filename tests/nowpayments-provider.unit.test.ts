import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalNowPaymentsWebhookBody,
  isNowPaymentsEnabled,
  mapNowPaymentsStatus,
  mapNowPaymentsOrderEvent,
  NowPaymentsProvider,
  verifyNowPaymentsSignature,
} from "../lib/nowpayments-provider";

const secret = "unit-test-ipn-secret";
const config = {
  apiKey: "unit-test-api-key",
  ipnSecret: secret,
  callbackUrl: "https://example.test/api/webhooks/payment",
  successUrl: "https://example.test/dashboard/orders",
  cancelUrl: "https://example.test/dashboard/orders",
};

function sign(payload: Record<string, unknown>): string {
  const canonical = canonicalNowPaymentsWebhookBody(Buffer.from(JSON.stringify(payload)));
  assert.ok(canonical);
  return createHmac("sha512", secret).update(canonical).digest("hex");
}

describe("NOWPayments adapter", () => {
  it("keeps live enablement closed unless approval, underpayment policy, URLs, and credentials are all present", () => {
    assert.equal(isNowPaymentsEnabled({}), false);
    assert.equal(isNowPaymentsEnabled({
      NOWPAYMENTS_LIVE_ENABLED: "true",
      NOWPAYMENTS_MERCHANT_APPROVED: "true",
      NOWPAYMENTS_UNDERPAYMENT_POLICY_CONFIRMED: "true",
      NOWPAYMENTS_API_KEY: "configured",
      NOWPAYMENTS_IPN_SECRET: "configured",
      NOWPAYMENTS_IPN_CALLBACK_URL: "https://example.test/ipn",
      NOWPAYMENTS_SUCCESS_URL: "https://example.test/success",
      NOWPAYMENTS_CANCEL_URL: "https://example.test/cancel",
    }), true);
  });

  it("maps documented statuses without treating pending or partial payments as complete", () => {
    for (const status of ["waiting", "confirming", "confirmed", "sending", "partially_paid"]) {
      assert.equal(mapNowPaymentsStatus(status), "PROCESSING");
    }
    assert.equal(mapNowPaymentsStatus("finished"), "COMPLETED");
    assert.equal(mapNowPaymentsStatus("failed"), "FAILED");
    assert.equal(mapNowPaymentsStatus("expired"), "FAILED");
    assert.equal(mapNowPaymentsStatus("refunded"), "REFUNDED");
    assert.equal(mapNowPaymentsStatus("unknown"), null);
    for (const status of ["waiting", "confirming", "confirmed", "sending", "partially_paid"]) {
      assert.equal(mapNowPaymentsOrderEvent(status), "PAYMENT_INITIATED");
    }
    assert.equal(mapNowPaymentsOrderEvent("finished"), "PAYMENT_CONFIRMED");
    assert.equal(mapNowPaymentsOrderEvent("failed"), "PAYMENT_FAILED");
    assert.equal(mapNowPaymentsOrderEvent("expired"), "PAYMENT_EXPIRED");
    assert.equal(mapNowPaymentsOrderEvent("cancelled"), "PAYMENT_CANCELLED");
    assert.equal(mapNowPaymentsOrderEvent("refunded"), null);
    assert.equal(mapNowPaymentsOrderEvent("wrong_asset_confirmed"), null);
  });

  it("verifies the documented recursively sorted HMAC-SHA512 IPN and rejects tampering", () => {
    const body = Buffer.from(JSON.stringify({ payment_id: 123, nested: { z: 1, a: 2 }, payment_status: "finished" }));
    const signature = sign(JSON.parse(body.toString("utf8")) as Record<string, unknown>);
    assert.equal(verifyNowPaymentsSignature(body, signature, secret), true);
    assert.equal(verifyNowPaymentsSignature(Buffer.from(body.toString().replace("finished", "failed")), signature, secret), false);
    assert.equal(verifyNowPaymentsSignature(body, signature, undefined), false);
  });

  it("creates a hosted invoice with the documented endpoint and returns a stable checkout for retries", async () => {
    let fetchCalls = 0;
    const provider = new NowPaymentsProvider({
      ...config,
      fetchImpl: async (input, init) => {
        fetchCalls += 1;
        assert.equal(String(input), "https://api.nowpayments.io/v1/invoice");
        assert.equal((init?.headers as Record<string, string>)["x-api-key"], config.apiKey);
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.deepEqual(body, {
          price_amount: 125.5,
          price_currency: "usd",
          order_id: "order-1",
          order_description: "Funded Experts order order-1",
          ipn_callback_url: config.callbackUrl,
          success_url: config.successUrl,
          cancel_url: config.cancelUrl,
        });
        return new Response(JSON.stringify({ id: "invoice-1", invoice_url: "https://nowpayments.io/invoice/1" }), { status: 200 });
      },
    });
    const request = { orderId: "order-1", amount: 125.5, currency: "USD", provider: "NOWPAYMENTS" as const, idempotencyKey: "order-1" };
    const first = await provider.processPayment(request);
    const retry = await provider.processPayment(request);
    assert.equal(fetchCalls, 1);
    assert.equal(first.success, true);
    assert.equal(first.checkoutUrl, "https://nowpayments.io/invoice/1");
    assert.deepEqual(retry, first);
  });

  it("rejects idempotency-key reuse with different terms and does not retry uncertain invoice outcomes", async () => {
    let fetchCalls = 0;
    const provider = new NowPaymentsProvider({ ...config, fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("network unavailable");
    } });
    const request = { orderId: "order-1", amount: 125.5, currency: "USD", provider: "NOWPAYMENTS" as const, idempotencyKey: "stable" };
    const uncertain = await provider.processPayment(request);
    assert.equal(uncertain.success, false);
    assert.match(uncertain.error ?? "", /uncertain/);
    const changedTerms = await provider.processPayment({ ...request, amount: 130 });
    assert.equal(changedTerms.success, false);
    assert.equal(fetchCalls, 1);
  });

  it("marks a definite client rejection safe to retry but keeps server errors uncertain", async () => {
    let rejectedCalls = 0;
    const rejectedProvider = new NowPaymentsProvider({ ...config, fetchImpl: async () => {
      rejectedCalls += 1;
      return new Response("{}", { status: 422 });
    } });
    const request = { orderId: "order-retry", amount: 40, currency: "USD", provider: "NOWPAYMENTS" as const };
    const rejected = await rejectedProvider.processPayment(request);
    const retried = await rejectedProvider.processPayment(request);
    assert.equal(rejected.success, false);
    assert.equal(rejected.safeToRetry, true);
    assert.equal(retried.safeToRetry, true);
    assert.equal(rejectedCalls, 2);

    for (const status of [408, 409, 500, 503]) {
      const uncertainProvider = new NowPaymentsProvider({ ...config, fetchImpl: async () => new Response("{}", { status }) });
      const uncertain = await uncertainProvider.processPayment({ ...request, orderId: `order-${status}` });
      assert.equal(uncertain.safeToRetry, false, `HTTP ${status} must remain reserved for reconciliation`);
    }

    const serverErrorProvider = new NowPaymentsProvider({ ...config, fetchImpl: async () => new Response("{}", { status: 503 }) });
    const uncertain = await serverErrorProvider.processPayment({ ...request, orderId: "order-uncertain" });
    assert.equal(uncertain.success, false);
    assert.equal(uncertain.safeToRetry, false);
  });

  it("authenticates IPNs and derives status-scoped replay keys", async () => {
    const provider = new NowPaymentsProvider(config);
    const payload = { payment_id: 123, payment_status: "finished", order_id: "order-1" };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const verified = await provider.verifyWebhookSignature({ rawBody, headers: { "x-nowpayments-sig": sign(payload) } });
    assert.deepEqual(verified, {
      valid: true,
      providerEventId: "123:finished",
      providerStatus: "finished",
    });
    assert.equal((await provider.verifyWebhookSignature({ rawBody, headers: {} })).valid, false);
  });
});
