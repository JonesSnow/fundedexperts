# Order Test Investigation Report

**Date:** 2026-09-22
**Branch:** `investigation/order-test-failures` (isolated from main)
**Status:** INVESTIGATION COMPLETE — awaiting review before fixes

---

## 1. Exact Failures Identified

The order lifecycle test (`tests/order-lifecycle.test.ts`) has 12 custom `check()` assertions across 7 "Order API" test cases. Of these, **2 fail silently**:

| # | Failing Check | Location | Value at Time of Failure |
|---|---------------|----------|--------------------------|
| F1 | "Order total is correct" | `tests/order-lifecycle.test.ts:147` (test: "should create order on clean DB") | `order.totalAmount` = Decimal(99.99), `product.price` = Decimal(99.99) |
| F2 | "Invalid transition rejected" | `tests/order-lifecycle.test.ts:319` (test: "should enforce invalid status transition rejection") | `prisma.order.update()` succeeds, returns status EXPIRED — no error thrown |

Both failures are confirmed via diagnostic scripts that log actual values before each check. Diagnostic files have been removed.

---

## 2. Root Causes

### F1: "Order total is correct" — Decimal strict equality comparison

**Evidence:**
```
order.totalAmount=99.99 (object), product.price=99.99 (object)
```

Both values are Prisma `Decimal` instances with identical numeric value (`99.99`), but `===` fails because they are distinct object instances in memory. The check at line 147 is:

```typescript
check("Order total is correct", order.totalAmount === (product.price ?? 0), "");
```

**Root Cause:** Strict equality (`===`) on two `Decimal` objects compares object identity, not numeric value. Both Prisma Decimal instances hold the same value but occupy different memory addresses.

**Classification:** Type-comparison issue in test assertion.

**Recommended Correction:**
```typescript
check("Order total is correct", order.totalAmount.equals(product.price ?? 0), "");
```
Or convert both to numbers:
```typescript
check("Order total is correct", Number(order.totalAmount) === Number(product.price ?? 0), "");
```

**Production code modification needed:** No. Fix is in test code only.

---

### F2: "Invalid transition rejected" — Prisma does not enforce business rules

**Evidence:**
```
Update SUCCEEDED. New status: EXPIRED
```

The test at line 305-327 expects `prisma.order.update({ where: { id }, data: { status: "EXPIRED" } })` to throw when transitioning from `PENDING_PAYMENT` to `EXPIRED`, which is not a valid transition according to the `VALID_TRANSITIONS` map defined in `app/api/orders/[id]/route.ts:11-18`:

```typescript
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["PAID", "FAILED", "CANCELLED", "EXPIRED"],
  ...
};
```

Wait — `EXPIRED` IS in the valid transitions from `PENDING_PAYMENT`. Let me recheck.

Actually, looking at the test description: "should enforce invalid status transition rejection". The test tries `PENDING_PAYMENT → EXPIRED`. But `EXPIRED` IS listed as valid from `PENDING_PAYMENT` in the route code. So the test expectation is wrong — it expects EXPIRED to be invalid from PENDING_PAYMENT, but the route code allows it.

Wait, let me re-read the test more carefully:

```typescript
it("should enforce invalid status transition rejection", async () => {
    const order = await prisma.order.findFirst({ where: { status: "PENDING_PAYMENT" } });
    try {
      await prisma.order.update({ where: { id: order.id }, data: { status: "EXPIRED" } });
      check("Invalid transition rejected", false, "Should have thrown");
    } catch (e) {
      check("Invalid transition rejected", true, ...);
    }
});
```

The test expects the update to throw, but it succeeds. The test name says "invalid status transition rejection" but uses `EXPIRED` from `PENDING_PAYMENT` which IS valid according to the route's `VALID_TRANSITIONS`.

BUT — this test calls `prisma.order.update()` directly, NOT the API route. The `VALID_TRANSITIONS` check is in `app/api/orders/[id]/route.ts:98-107`, which is a server-side guard inside the PATCH handler. Direct Prisma calls bypass this check entirely.

So the issue is:
1. The test expects business rule enforcement at the database layer
2. The business rules are only enforced at the API route layer (not in Prisma, not in middleware, not in lib)
3. Direct Prisma calls bypass the API guard completely
4. The test expects a throw that will never happen at this layer

**Additional finding:** If this test were actually testing the API route (via HTTP), the `VALID_TRANSITIONS` check at line 98 would catch the transition — but only if `PENDING_PAYMENT → EXPIRED` were actually invalid. Given the `VALID_TRANSITIONS` map, `EXPIRED` is a valid transition from `PENDING_PAYMENT`. So even if the test called the API route, it would succeed (status 200), not be rejected.

Wait, let me double-check: In `app/api/orders/[id]/route.ts`:
```
PENDING_PAYMENT: ["PAID", "FAILED", "CANCELLED", "EXPIRED"],
```

So `EXPIRED` IS valid from `PENDING_PAYMENT`. The test name says "invalid status transition" but the transition is actually valid according to the route code.

**Root Cause:** Incorrect test expectation. The test:
1. Assumes `PENDING_PAYMENT → EXPIRED` is an invalid transition (but it's valid per `VALID_TRANSITIONS`)
2. Assumes Prisma enforces the business rule (but it doesn't; only the API route does)
3. Tests direct DB access instead of the API endpoint

**Classification:** Incorrect test expectation + testing at wrong layer.

**Recommended Correction:** The test should either:
a) Test an actually invalid transition (e.g., `CANCELLED → PAID`, which has no valid transitions), or
b) Call the API route via HTTP instead of `prisma.order.update()` directly, or
c) Both — test an actually invalid transition via the API route

If the intent is to test that `CANCELLED → PAID` is rejected:
```typescript
it("should enforce invalid status transition rejection", async () => {
    const order = await prisma.order.findFirst({ where: { status: "CANCELLED" } });
    if (!order) { check("Invalid transition setup", false, "Missing test data"); return; }
    try {
      await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      check("Invalid transition rejected", false, "Should have thrown");
    } catch (e) {
      check("Invalid transition rejected", true, ...);
    }
});
```
But this still wouldn't throw via direct Prisma — it needs to go through the API route.

**Production code modification needed:** No. Fix is in test code only. However, the business logic in `app/api/orders/[id]/route.ts` should also be reviewed — `EXPIRED` from `PENDING_PAYMENT` may be an unintended valid transition that needs product/domain review.

---

## 3. check() Helper Failure Handling Review

**Finding:** The `check()` helper in `tests/order-lifecycle.test.ts` (line 22-30) records failures but **does not throw**:

```typescript
function check(name: string, condition: boolean, detail: string = "") {
  if (condition) { results.pass++; ... }
  else { results.fail++; ... }  // No throw — failure is silent
}
```

**Consequence:** Failed assertions increment the failure counter but the test process exits with code 0. This means:
- CI/CD pipelines that rely on exit codes will not detect failures
- The test report shows "10/12 passed" but the process is considered "successful"
- Developers may miss silently failing checks in logs

**Comparison:** All other test files use the same `check()` pattern and have the same issue.

**Recommended Correction:** Either:
a) Add a process exit call after results are logged in the `after()` hook:
```typescript
after(async () => {
  ...
  if (results.fail > 0) process.exit(1);
});
```
b) Or replace `check()` with `assert()` for critical checks, keeping `check()` only for informational assertions.

**Production code modification needed:** No. Fix is in test helper only.

---

## 4. Summary Table

| Finding | Root Cause | Correction | Production Code Change? |
|---------|------------|------------|------------------------|
| F1: Order total check fails | Decimal !== Decimal strict equality | Use `.equals()` or `Number()` conversion | No |
| F2: Invalid transition check fails | Prisma doesn't enforce business rules; test expects throw at DB layer; EXPIRED is actually valid from PENDING_PAYMENT per route code | Fix test expectation and/or test via API route | No (but review route logic) |
| check() silent failures | Helper doesn't throw on failure | Add process.exit(1) on failure count | No |

---

## 5. Immediate Actions Recommended

1. **Review F2 finding** with product/domain team: Is `PENDING_PAYMENT → EXPIRED` actually a valid business transition? The current route code allows it.
2. **Add `process.exit(1)`** to the `after()` hook in all test files that use `check()` to prevent silent failures.
3. **Fix F1** by using Decimal-aware comparison in the test.
4. **Fix F2** by testing via HTTP route (not direct Prisma) and/or selecting an actually invalid transition.

All fixes are test-only changes. No production code modification is required unless the domain review in step 1 identifies a business logic issue in the route code.
