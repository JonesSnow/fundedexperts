import assert from "node:assert/strict";
import test from "node:test";
import { redeemableCouponWhere } from "../lib/coupon-redemption";

test("limited coupon reservation atomically checks remaining uses and expiry", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");
  assert.deepEqual(
    redeemableCouponWhere(
      { id: "coupon-1", discountPercent: 15, totalUsageLimit: 20 },
      now,
    ),
    {
      id: "coupon-1",
      isActive: true,
      discountPercent: 15,
      totalUsageLimit: 20,
      usedCount: { lt: 20 },
      AND: [{
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      }],
    },
  );
});

test("unlimited coupon reservation still checks its active state and expiry", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");
  assert.deepEqual(
    redeemableCouponWhere(
      { id: "coupon-2", discountPercent: 10, totalUsageLimit: null },
      now,
    ),
    {
      id: "coupon-2",
      isActive: true,
      discountPercent: 10,
      totalUsageLimit: null,
      AND: [{
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      }],
    },
  );
});
