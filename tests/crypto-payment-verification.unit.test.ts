import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCryptoPayment,
  type CryptoTransferObservation,
  type ExpectedCryptoPayment,
} from "../lib/crypto-payment-verification";

const now = new Date("2026-10-20T12:06:00.000Z");
const terms: ExpectedCryptoPayment = {
  orderId: "order-1",
  networkId: "network-test-id",
  assetId: "asset-test-id",
  destination: "canonical-destination",
  amountAtomicUnits: "125500000",
  minimumConfirmations: 3,
  expiresAt: new Date("2026-10-20T12:30:00.000Z"),
  expirationPolicy: "EXPIRE_AT",
};

function observation(overrides: Partial<CryptoTransferObservation> = {}): CryptoTransferObservation {
  return {
    orderId: terms.orderId,
    networkId: terms.networkId,
    assetId: terms.assetId,
    destination: terms.destination,
    amountAtomicUnits: terms.amountAtomicUnits,
    transactionId: "chain-tx-123",
    firstSeenAt: new Date("2026-10-20T12:05:00.000Z"),
    confirmations: 3,
    chainStatus: "CONFIRMED",
    ...overrides,
  };
}

test("does not treat an absent transfer as paid and applies the configured expiry boundary", () => {
  assert.deepEqual(classifyCryptoPayment(terms, null, now), { state: "PENDING" });
  assert.deepEqual(classifyCryptoPayment(terms, null, terms.expiresAt), { state: "EXPIRED" });
  assert.deepEqual(classifyCryptoPayment({ ...terms, expirationPolicy: "EXPIRE_AFTER" }, null, terms.expiresAt), { state: "PENDING" });
});

test("requires trusted confirmation status and the configured confirmation threshold", () => {
  assert.deepEqual(classifyCryptoPayment(terms, observation({ confirmations: 2 }), now), {
    state: "CONFIRMING",
    transactionId: "chain-tx-123",
    confirmations: 2,
    requiredConfirmations: 3,
  });
  assert.deepEqual(classifyCryptoPayment(terms, observation({ chainStatus: "PENDING", confirmations: 4 }), now), {
    state: "CONFIRMING",
    transactionId: "chain-tx-123",
    confirmations: 4,
    requiredConfirmations: 3,
  });
  assert.deepEqual(classifyCryptoPayment(terms, observation(), now), {
    state: "CONFIRMED",
    transactionId: "chain-tx-123",
    confirmations: 3,
  });
});

test("rejects order, network, asset, destination, and exact-amount mismatches", () => {
  const mismatches: Array<[Partial<CryptoTransferObservation>, string]> = [
    [{ orderId: "other-order" }, "ORDER_MISMATCH"],
    [{ networkId: "other-network" }, "NETWORK_MISMATCH"],
    [{ assetId: "other-asset" }, "ASSET_MISMATCH"],
    [{ destination: "other-destination" }, "DESTINATION_MISMATCH"],
    [{ amountAtomicUnits: "125499999" }, "AMOUNT_MISMATCH"],
    [{ amountAtomicUnits: "125500001" }, "AMOUNT_MISMATCH"],
  ];
  for (const [override, reason] of mismatches) {
    assert.deepEqual(classifyCryptoPayment(terms, observation(override), now), {
      state: "EXCEPTION",
      reason,
      transactionId: "chain-tx-123",
    });
  }
});

test("keeps late transfers in an exception state and lets pre-expiry transfers finish confirming", () => {
  const late = observation({ firstSeenAt: new Date("2026-10-20T12:30:00.000Z") });
  assert.deepEqual(classifyCryptoPayment(terms, late, terms.expiresAt), {
    state: "EXCEPTION",
    reason: "PAYMENT_AFTER_EXPIRY",
    transactionId: "chain-tx-123",
  });
  const preExpiry = observation({ firstSeenAt: new Date("2026-10-20T12:29:59.000Z"), confirmations: 1 });
  assert.equal(classifyCryptoPayment(terms, preExpiry, new Date("2026-10-20T12:45:00.000Z")).state, "CONFIRMING");
});

test("rejects provider observations dated after the verification time", () => {
  assert.deepEqual(classifyCryptoPayment(
    terms,
    observation({ firstSeenAt: new Date("2026-10-20T12:10:00.000Z") }),
    now,
  ), {
    state: "EXCEPTION",
    reason: "OBSERVATION_FROM_FUTURE",
    transactionId: "chain-tx-123",
  });
});

test("does not accept dropped or reorganized chain transactions", () => {
  assert.equal(classifyCryptoPayment(terms, observation({ chainStatus: "DROPPED" }), now).state, "EXCEPTION");
  assert.deepEqual(classifyCryptoPayment(terms, observation({ chainStatus: "REORGED" }), now), {
    state: "EXCEPTION",
    reason: "TRANSACTION_REORGED",
    transactionId: "chain-tx-123",
  });
});

test("rejects malformed policy and transfer evidence", () => {
  assert.deepEqual(classifyCryptoPayment({ ...terms, minimumConfirmations: 0 }, observation(), now), {
    state: "EXCEPTION",
    reason: "INVALID_TERMS",
  });
  assert.deepEqual(classifyCryptoPayment({ ...terms, expirationPolicy: "UNSPECIFIED" as never }, null, now), {
    state: "EXCEPTION",
    reason: "INVALID_TERMS",
  });
  assert.deepEqual(classifyCryptoPayment(terms, observation({ transactionId: " tx-with-padding " }), now), {
    state: "EXCEPTION",
    reason: "INVALID_OBSERVATION",
  });
});
