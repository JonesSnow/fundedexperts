# Coupon Usage Policy Limitation

**Date:** 2026-09-23
**Phase:** Phase 21 — Stage 5.4
**Status:** UNRESOLVED — Requires business approval before implementation

## Limitation

The current coupon system enforces only **global usage limits** (`totalUsageLimit` on Coupon, tracked via `usedCount`). There is **no per-user coupon usage limit**.

## Current Behavior

- A coupon with `totalUsageLimit: 100` can be used by up to 100 different traders (or fewer traders multiple times)
- The `CouponUsage` table has a composite unique constraint on `(couponId, traderId, orderId)` — since `orderId` is nullable and unique per order, a single trader can use the same coupon across multiple orders
- Order creation validates: coupon exists, is active, not expired, and `usedCount < totalUsageLimit` — all global checks only

## Schema Evidence

```prisma
model Coupon {
  id              String        @id @default(uuid())
  code            String        @unique
  discountPercent Int
  isActive        Boolean       @default(true)
  expiresAt       DateTime?
  totalUsageLimit Int?          // Global limit only
  usedCount       Int           @default(0)
  // No perUserUsageLimit field
}

model CouponUsage {
  id        String   @id @default(uuid())
  couponId  String
  traderId  String
  orderId   String?  // Nullable — allows same trader to use coupon in multiple orders
  // @@unique([couponId, traderId, orderId]) — does NOT prevent same trader using same coupon in different orders
}
```

## Risk

Without per-user limits, a trader could potentially use the same coupon an unlimited number of times (subject only to the global limit), which may cause revenue loss if coupons are intended as one-time-per-customer promotions.

## Required Changes (Pending Approval)

1. **Schema**: Add `perUserUsageLimit Int?` to `Coupon` model
2. **Migration**: Add column via new migration
3. **Validation**: Check per-user usage count before order creation in `app/api/orders/route.ts`
4. **Constraint**: Consider adding unique constraint on `(couponId, traderId)` when no `orderId` (prevent same coupon per user regardless of order)
5. **Tests**: Add focused regression tests for per-user limit enforcement

## Current Status

- **Deferred** — awaiting business approval to implement per-user usage limits
- Global limits function correctly and are enforced
- No code changes have been made to implement per-user limits
