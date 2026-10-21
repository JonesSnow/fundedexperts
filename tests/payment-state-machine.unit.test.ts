import assert from "node:assert/strict";
import {
  isValidTransition,
  getNextState,
  isTerminalState,
  canAllocateAccount,
} from "../lib/payment-state-machine";

// Test valid transitions
const validTransitions = [
  ["PENDING_PAYMENT", "PAYMENT_INITIATED", "PENDING_PAYMENT"],
  ["PENDING_PAYMENT", "PAYMENT_CONFIRMED", "PAID"],
  ["CREATED", "PAYMENT_CONFIRMED", "PAID"],
  ["PENDING_PAYMENT", "PAYMENT_FAILED", "FAILED"],
  ["PENDING_PAYMENT", "PAYMENT_EXPIRED", "EXPIRED"],
  ["PENDING_PAYMENT", "PAYMENT_CANCELLED", "CANCELLED"],
  ["FAILED", "PAYMENT_INITIATED", "PENDING_PAYMENT"],
  ["FAILED", "PAYMENT_CONFIRMED", "PAID"],
  ["EXPIRED", "PAYMENT_INITIATED", "PENDING_PAYMENT"],
  ["EXPIRED", "PAYMENT_CONFIRMED", "PAID"],
];

for (const [from, event, expected] of validTransitions) {
  assert.equal(isValidTransition(from as string, event as never), true, `${from} -> ${event} should be valid`);
  assert.equal(getNextState(from as string, event as never), expected, `${from} -> ${event} should go to ${expected}`);
}

// Test invalid transitions
const invalidTransitions = [
  ["PAID", "PAYMENT_INITIATED"],
  ["PAID", "PAYMENT_FAILED"],
  ["PAID", "PAYMENT_CONFIRMED"],
  ["CANCELLED", "PAYMENT_INITIATED"],
  ["CANCELLED", "PAYMENT_CONFIRMED"],
];

for (const [from, event] of invalidTransitions) {
  assert.equal(isValidTransition(from as string, event as never), false, `${from} -> ${event} should be invalid`);
  assert.equal(getNextState(from as string, event as never), null, `${from} -> ${event} should return null`);
}

// Test terminal states
assert.equal(isTerminalState("CANCELLED"), true);
assert.equal(isTerminalState("EXPIRED"), true);
assert.equal(isTerminalState("PAID"), false);
assert.equal(isTerminalState("PENDING_PAYMENT"), false);

// Test allocation eligibility
assert.equal(canAllocateAccount("PAID"), true);
assert.equal(canAllocateAccount("PENDING_PAYMENT"), false);
assert.equal(canAllocateAccount("FAILED"), false);
assert.equal(canAllocateAccount("CANCELLED"), false);

console.log("Payment state machine tests passed.");
