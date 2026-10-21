import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkCooldown,
  checkRateLimit,
  getRateLimitInfo,
  normalizeRateLimitKey,
  RATE_LIMIT_KEY_CAPACITY,
  resetCooldown,
  resetRateLimit,
} from "../lib/auth/rate-limit";

test("oversized dynamic keys are hashed to bounded, stable identities", () => {
  const longKeyA = `evaluation:start:${"a".repeat(10_000)}`;
  const longKeyB = `evaluation:start:${"a".repeat(9_999)}b`;
  const normalizedA = normalizeRateLimitKey(longKeyA);

  assert.ok(normalizedA.length <= 72);
  assert.equal(normalizeRateLimitKey(longKeyA), normalizedA);
  assert.notEqual(normalizeRateLimitKey(longKeyB), normalizedA);

  assert.equal(checkRateLimit(longKeyA).allowed, true);
  assert.ok(getRateLimitInfo(longKeyA));
  assert.equal(checkCooldown(longKeyA, 60_000).allowed, true);
  assert.equal(checkCooldown(longKeyA, 60_000).allowed, false);
  resetRateLimit(longKeyA);
  resetCooldown(longKeyA);
  assert.equal(getRateLimitInfo(longKeyA), undefined);
  assert.equal(checkCooldown(longKeyA, 60_000).allowed, true);
  resetCooldown(longKeyA);
});

test("rate-limit maps cap unique keys and reject overflow without storing it", () => {
  const ratePrefix = "capacity-test-rate";
  const cooldownPrefix = "capacity-test-cooldown";
  const rateKeys = Array.from({ length: RATE_LIMIT_KEY_CAPACITY }, (_, index) => `${ratePrefix}:${index}`);
  const cooldownKeys = Array.from({ length: RATE_LIMIT_KEY_CAPACITY }, (_, index) => `${cooldownPrefix}:${index}`);
  const rateOverflowKey = `${ratePrefix}:overflow`;
  const cooldownOverflowKey = `${cooldownPrefix}:overflow`;

  try {
    for (const key of rateKeys) assert.equal(checkRateLimit(key).allowed, true);
    const overflowRate = checkRateLimit(rateOverflowKey);
    assert.equal(overflowRate.allowed, false);
    assert.equal(getRateLimitInfo(rateOverflowKey), undefined);
    assert.equal(checkRateLimit(rateKeys[0]).allowed, true);
    resetRateLimit(rateKeys[0]);
    assert.equal(checkRateLimit(rateOverflowKey).allowed, true);

    for (const key of cooldownKeys) assert.equal(checkCooldown(key, 60_000).allowed, true);
    assert.equal(checkCooldown(cooldownOverflowKey, 60_000).allowed, false);
    assert.equal(checkCooldown(cooldownKeys[0], 60_000).allowed, false);
    resetCooldown(cooldownKeys[0]);
    assert.equal(checkCooldown(cooldownOverflowKey, 60_000).allowed, true);
  } finally {
    for (const key of rateKeys) resetRateLimit(key);
    resetRateLimit(rateOverflowKey);
    for (const key of cooldownKeys) resetCooldown(key);
    resetCooldown(cooldownOverflowKey);
  }
});
