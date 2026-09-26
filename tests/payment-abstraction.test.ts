import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { createMockPaymentProvider } from "../lib/mock-payment-provider";
import type {
  PaymentProvider,
  PaymentRequest,
  RefundRequest,
} from "../lib/payment";

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

const provider = createMockPaymentProvider();

describe("Payment Abstraction", () => {
  it("should define PaymentProvider interface methods", () => {
    assert.equal(typeof provider.processPayment, "function");
    assert.equal(typeof provider.getPaymentStatus, "function");
    assert.equal(typeof provider.refundPayment, "function");
    check("Interface methods present", true, "");
  });

  it("should process payment successfully", async () => {
    const request: PaymentRequest = {
      orderId: "order-1",
      amount: 99.99,
      currency: "USD",
      provider: "MOCK",
    };
    const result = await provider.processPayment(request);
    check("Payment successful", result.success === true, "");
    check("Payment has ID", result.paymentId !== undefined, "");
    check("Payment status COMPLETED", result.status === "COMPLETED", "");
    check("Payment has provider ref", result.providerRefId !== undefined, "");
  });

  it("should enforce idempotency", async () => {
    const idempotencyKey = `idem-test-${Date.now()}`;
    const request: PaymentRequest = {
      orderId: "order-2",
      amount: 50.0,
      currency: "USD",
      provider: "MOCK",
      idempotencyKey,
    };

    const result1 = await provider.processPayment(request);
    const result2 = await provider.processPayment(request);

    check("First payment successful", result1.success === true, "");
    check(
      "Idempotent return same paymentId",
      result1.paymentId === result2.paymentId,
      "",
    );
    check(
      "Idempotent return same status",
      result1.status === result2.status,
      "",
    );
  });

  it("should return null for unknown payment status", async () => {
    const status = await provider.getPaymentStatus("non-existent-payment");
    check("Unknown payment returns null", status === null, "");
  });

  it("should return status for existing payment", async () => {
    const request: PaymentRequest = {
      orderId: "order-3",
      amount: 25.0,
      currency: "EUR",
      provider: "MOCK",
    };
    const result = await provider.processPayment(request);
    const status = await provider.getPaymentStatus(result.paymentId ?? "");
    check(
      "Known payment returns status",
      status === "COMPLETED",
      `got ${status}`,
    );
  });

  it("should refund payment successfully", async () => {
    const request: PaymentRequest = {
      orderId: "order-4",
      amount: 100.0,
      currency: "USD",
      provider: "MOCK",
    };
    const paymentResult = await provider.processPayment(request);
    if (!paymentResult.paymentId) {
      check("Refund setup", false, "No payment ID");
      return;
    }

    const refundRequest: RefundRequest = {
      paymentId: paymentResult.paymentId,
      idempotencyKey: "refund-1",
    };
    const refundResult = await provider.refundPayment(refundRequest);

    check("Refund successful", refundResult.success === true, "");
    check("Refund has ID", refundResult.refundId !== undefined, "");
    check("Refund status COMPLETED", refundResult.status === "COMPLETED", "");
  });

  it("should fail refund for unknown payment", async () => {
    const refundRequest: RefundRequest = {
      paymentId: "non-existent-payment",
    };
    const result = await provider.refundPayment(refundRequest);
    check("Unknown refund fails", result.success === false, "");
    check("Unknown refund has error", result.error !== undefined, "");
  });

  it("should fail duplicate refund", async () => {
    const request: PaymentRequest = {
      orderId: "order-5",
      amount: 75.0,
      currency: "GBP",
      provider: "MOCK",
    };
    const paymentResult = await provider.processPayment(request);
    if (!paymentResult.paymentId) {
      check("Duplicate refund setup", false, "No payment ID");
      return;
    }

    await provider.refundPayment({ paymentId: paymentResult.paymentId });
    const result = await provider.refundPayment({
      paymentId: paymentResult.paymentId,
    });

    check("Duplicate refund fails", result.success === false, "");
    check("Duplicate refund has error", result.error !== undefined, "");
  });
});

after(() => {
  console.log(
    `Payment Tests: ${results.pass}/${results.pass + results.fail} passed`,
  );
  if (results.fail > 0) process.exit(1);
});
