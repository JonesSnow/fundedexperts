import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import type { PaymentRecord } from "../lib/payment";
import { activateEvaluation } from "../lib/activation";
import { verifyPaymentForOrder, verifyProviderPaymentForOrder } from "../lib/payment-verification";
import { createMockPaymentProvider } from "../lib/mock-payment-provider";

const terms = { orderId: "order-1", amount: "125.50", currency: "USD" };

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: "payment-1",
    orderId: "order-1",
    status: "COMPLETED",
    amount: 125.5,
    currency: "USD",
    provider: "MOCK",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("payment-to-order verification", () => {
  it("accepts a completed payment with matching order, amount, and currency", () => {
    assert.deepEqual(verifyPaymentForOrder(terms, payment()), {
      valid: true,
      payment: payment(),
    });
  });

  it("rejects missing and incomplete provider records", () => {
    assert.deepEqual(verifyPaymentForOrder(terms, null), { valid: false, reason: "NOT_FOUND" });
    assert.deepEqual(verifyPaymentForOrder(terms, payment({ status: "PENDING" })), {
      valid: false,
      reason: "NOT_COMPLETED",
    });
  });

  it("rejects a completed payment associated with another order", () => {
    assert.deepEqual(verifyPaymentForOrder(terms, payment({ orderId: "order-2" })), {
      valid: false,
      reason: "ORDER_MISMATCH",
    });
  });

  it("loads and binds provider records before accepting a reference", async () => {
    const provider = createMockPaymentProvider();
    const orderOnePayment = await provider.processPayment({
      orderId: "order-1",
      amount: 125.5,
      currency: "USD",
      provider: "MOCK",
      idempotencyKey: "reference-order-1",
    });
    const orderTwoPayment = await provider.processPayment({
      orderId: "order-2",
      amount: 125.5,
      currency: "USD",
      provider: "MOCK",
      idempotencyKey: "reference-order-2",
    });
    assert.equal(orderOnePayment.success, true);
    assert.equal(orderTwoPayment.success, true);

    assert.equal((await verifyProviderPaymentForOrder(provider, "reference-order-1", terms)).valid, true);
    assert.deepEqual(await verifyProviderPaymentForOrder(provider, "reference-order-2", terms), {
      valid: false,
      reason: "ORDER_MISMATCH",
    });
  });

  it("rejects amounts that are lower or higher than the order total", () => {
    assert.deepEqual(verifyPaymentForOrder(terms, payment({ amount: 125.49 })), {
      valid: false,
      reason: "AMOUNT_MISMATCH",
    });
    assert.deepEqual(verifyPaymentForOrder(terms, payment({ amount: 125.51 })), {
      valid: false,
      reason: "AMOUNT_MISMATCH",
    });
  });

  it("rejects currency mismatches and malformed order terms", () => {
    assert.deepEqual(verifyPaymentForOrder(terms, payment({ currency: "EUR" })), {
      valid: false,
      reason: "CURRENCY_MISMATCH",
    });
    assert.deepEqual(verifyPaymentForOrder({ ...terms, currency: "USDX" }, payment()), {
      valid: false,
      reason: "INVALID_TERMS",
    });
    assert.deepEqual(verifyPaymentForOrder({ ...terms, amount: "125.501" }, payment()), {
      valid: false,
      reason: "INVALID_TERMS",
    });
  });

  it("compares decimal amounts without rounding and normalizes currency case", () => {
    assert.equal(verifyPaymentForOrder(
      { ...terms, amount: "00125.5000", currency: "usd" },
      payment({ amount: 125.5, currency: "USD" }),
    ).valid, true);
    assert.deepEqual(verifyPaymentForOrder(
      terms,
      payment({ amount: 125.5001 }),
    ), { valid: false, reason: "AMOUNT_MISMATCH" });
  });

  it("blocks activation before transaction work when a completed payment belongs to another order", async () => {
    const provider = createMockPaymentProvider();
    await provider.processPayment({
      orderId: "order-paid-by-someone-else",
      amount: 125.5,
      currency: "USD",
      provider: "MOCK",
      idempotencyKey: "foreign-order-payment",
    });
    const fakePrisma = {
      order: {
        findUnique: async () => ({
          id: "order-1",
          traderId: "trader-1",
          status: "PENDING_PAYMENT",
          totalAmount: { toString: () => "125.50" },
          currency: "USD",
          rulesetVersionId: "ruleset-1",
          orderItems: [],
        }),
      },
    } as unknown as PrismaClient;

    const result = await activateEvaluation(fakePrisma, provider, {
      orderId: "order-1",
      performedBy: "trader-1",
      paymentReference: "foreign-order-payment",
    });

    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.errorCategory, "PAYMENT_MISMATCH");
  });
});
