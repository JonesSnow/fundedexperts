# Phase 18 — Test Reliability & Failure Classification Audit

**Date:** 2026-09-22
**Branch:** `audit/phase18-test-reliability`
**Status:** INVESTIGATION COMPLETE — awaiting review before fixes

---

## Executive Summary

Three test files were investigated: `tests/order-lifecycle.test.ts` (10/12 checks), `tests/activation.test.ts` (15/21 checks), and `tests/funded-account-lifecycle.test.ts` (63/64 checks). All three have custom `check()` assertions that fail silently — the test process exits with code 0 despite failures. Two root causes account for the majority of failures: (1) **Prisma Decimal strict equality** causing numeric comparisons to fail despite identical values, and (2) **mock payment provider lookup mismatch** where tests reference payments by idempotencyKey but the provider stores and looks them up by generated UUID. A third issue in the order lifecycle test involves testing business rule enforcement at the database layer where only the API route enforces those rules.

---

## 1. Order Lifecycle Tests — `tests/order-lifecycle.test.ts`

**Reported result:** 10/12 custom checks passed (2 failed)

### Failure F1: "Order total is correct" (line 147)

| Field | Detail |
|-------|--------|
| **Exact check** | `check("Order total is correct", order.totalAmount === (product.price ?? 0), "")` |
| **Expected** | `order.totalAmount` equals `product.price` |
| **Actual values** | `order.totalAmount = Decimal(99.99)` (object), `product.price = Decimal(99.99)` (object) |
| **Diagnostic evidence** | Both are Prisma Decimal instances with identical numeric value (99.99), but strict equality (`===`) compares object identity, not value. Different instances → `===` returns false. |
| **Root cause** | **Type-comparison issue.** `Decimal !== Decimal` even with identical numeric values. |
| **Classification** | Test defect — assertion uses wrong comparison operator |
| **Recommended correction** | `check("Order total is correct", order.totalAmount.equals(product.price ?? 0), "")` or `Number(order.totalAmount) === Number(product.price ?? 0)` |
| **Production code change?** | No |

### Failure F2: "Invalid transition rejected" (line 319)

| Field | Detail |
|-------|--------|
| **Exact check** | `check("Invalid transition rejected", false, "Should have thrown")` inside test "should enforce invalid status transition rejection" |
| **Expected** | `prisma.order.update({ status: "EXPIRED" })` should throw when transitioning from PENDING_PAYMENT |
| **Actual behavior** | Update succeeds silently; status changes to EXPIRED without error |
| **Diagnostic evidence** | Direct Prisma call bypasses API route entirely. Prisma does not enforce business rules or state machine logic. Additionally, `EXPIRED` IS listed as a valid transition from `PENDING_PAYMENT` in the route's `VALID_TRANSITIONS` map at `app/api/orders/[id]/route.ts:13`. |
| **Root cause** | **Incorrect test expectation + testing at wrong layer.** The test expects a throw that (a) Prisma will never produce at the DB layer, and (b) even the API route would not produce since EXPIRED→PENDING_PAYMENT is actually valid per the code. |
| **Classification** | Test defect — wrong expectation and wrong testing layer |
| **Recommended correction** | Either: (a) test an actually invalid transition (e.g., CANCELLED → PAID) via HTTP route instead of direct Prisma, or (b) review with product team whether PENDING_PAYMENT → EXPIRED should be valid |
| **Production code change?** | No, but route logic should be reviewed with domain team |

---

## 2. Activation Tests — `tests/activation.test.ts`

**Reported result:** 15/21 custom checks passed (6 failed)

### Root Cause: Mock Payment Provider Lookup Mismatch

**Confirmed by diagnostic testing** (`tests/activation-diag.test.ts`, since removed).

The mock payment provider (`lib/mock-payment-provider.ts`) stores payments in a `Map<string, StoredPayment>` keyed by a generated UUID id (`pay_${randomUUID().slice(0, 16)}`). However, the activation tests use a user-provided `paymentReference` (e.g., `pay-${order.id}`) as the lookup key in `activateEvaluation` → `provider.getPaymentStatus(paymentReference)`.

Since `getPaymentStatus` looks up by the generated UUID key (not the `idempotencyKey`), it always returns `null`, causing `activateEvaluation` to return `PAYMENT_NOT_CONFIRMED` for every test that processes a payment and then tries to activate.

| Field | Detail |
|-------|--------|
| **Diagnostic evidence** | `{"level":"ERROR","category":"ACTIVATION","message":"Payment not confirmed","error":{"code":"PAYMENT_NOT_CONFIRMED","message":"Payment status: null"}}` |

### Confirmed Failed Checks (5 of 6)

| # | Test | Failed Check | Cause |
|---|------|-------------|-------|
| A | Test 6: "should accept when mock payment completed" | "Activation with confirmed payment" | `getPaymentStatus("pay-${order.id}")` returns null; provider stores by UUID, not idempotencyKey |
| B | Test 7: "should prevent duplicate activation" | "First activation success" | Same payment lookup failure; result1.success === false |
| C | Test 7: "should prevent duplicate activation" | "Second activation also success" | Same payment lookup failure; result2.success === false |
| D | Test 8: "should not create duplicate evaluation" | "Single evaluation created" | No evaluation created (activation failed before evaluation creation); evals.length === 0, expected 1 |
| E | Test 9: "should activate without payment reference when order is PAID" | "Demo activation success without payment ref" | `allocateAccount()` fails: no MT5 AVAILABLE accounts in test DB |

### 6th Failure: Environment-Dependent

The reported 6th failure cannot be confirmed with the current test DB state. It may be caused by:
- Leftover MT5 accounts from other tests enabling allocation (changing which tests pass/fail)
- A different DB state on the Azure VM

### Genuine Implementation Defects vs. Test-Harness Problems

| Category | Details |
|----------|---------|
| **Test-harness problem (primary)** | Mock payment provider `getPaymentStatus` lookup key mismatch — affects checks A, B, C, D |
| **Test-harness problem (secondary)** | No MT5 AVAILABLE accounts created in DB — affects check E |
| **Genuine production defect** | None identified — `activateEvaluation` correctly handles all error cases (returns proper errorCategory, recoverable flags) |

---

## 3. Funded Account Lifecycle Tests — `tests/funded-account-lifecycle.test.ts`

**Reported result:** 63/64 custom checks passed (1 failed)

### Failed Check

The test execution timed out before completing (test duration exceeds 5-minute threshold), preventing precise identification. Based on the test structure and the single failure among 64 checks, the most likely candidate is in the **AuditLog Immutability** or **Authorization** section, where database trigger behavior or cross-trader access patterns may produce unexpected results depending on DB state.

### Unproven Checks (2)

| Check | Reason |
|-------|--------|
| "Concurrent creation attempts" | Neon serverless pooler prevents reliable concurrent test execution — connection pooling makes deterministic concurrency testing impossible |
| "Concurrent status transitions" | Same reason — serverless pooler limitations |

Both are correctly marked as UNPROVEN with `checkUnproven()` and include explanatory detail.

---

## 4. Test Harness: `check()` Helper Failure Reporting

### Finding

The `check()` helper in all test files (`order-lifecycle.test.ts`, `activation.test.ts`, `funded-account-lifecycle.test.ts`, `evaluations-api.test.ts`) has the same flaw:

```typescript
function check(name: string, condition: boolean, detail: string = "") {
  if (condition) {
    results.pass++;
    results.tests.push({ name, result: "PASS", detail });
  } else {
    results.fail++;
    results.tests.push({ name, result: "FAIL", detail });
    // No throw — failure is SILENT
  }
}
```

### Consequence

- Failed assertions increment `results.fail` but **never throw**
- The test process exits with code **0** (success) even when checks fail
- Node's test runner reports all tests as passed (✔) because no exceptions are thrown
- CI/CD pipelines relying on exit codes will not detect failures
- Example: Order Lifecycle shows `✔ Should enforce invalid status transition rejection` as PASSED at Node level, while custom counter reports 10/12

### Comparison Across Test Files

| File | Helper pattern | Throws on failure? |
|------|---------------|-------------------|
| `tests/order-lifecycle.test.ts` | `check()` — records only | No |
| `tests/activation.test.ts` | `check()` — records only | No |
| `tests/funded-account-lifecycle.test.ts` | `check()` + `checkUnproven()` — records only | No |
| `tests/evaluations-api.test.ts` | `check()` — records only | No |
| `tests/mt5-accounts.test.ts` | `assert.equal()` — throws | Yes |
| `tests/auth.test.ts` | `assert.equal()` — throws | Yes |

Tests using `assert` from `node:assert/strict` correctly fail on assertion errors. Tests using custom `check()` do not.

### Recommended Fix

Add failure-triggering to the `check()` helper. Options:

**Option A** (minimal): In the `after()` hook, exit with non-zero code on failures:
```typescript
after(async () => {
  // ... existing cleanup and logging ...
  if (results.fail > 0) process.exit(1);
});
```

**Option B** (breaking but correct): Make `check()` throw on failure:
```typescript
function check(name: string, condition: boolean, detail: string = "") {
  if (condition) {
    results.pass++;
    results.tests.push({ name, result: "PASS", detail });
  } else {
    results.fail++;
    results.tests.push({ name, result: "FAIL", detail });
    throw new Error(`Check failed: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
```
Option A is recommended for minimal disruption.

---

## 5. Confirmed Facts vs. Hypotheses

### Confirmed Facts

| # | Fact | Evidence |
|---|------|----------|
| F1 | Order total check fails due to Decimal === Decimal | Diagnostic output: `totalAmount=99.99 (object) vs price=99.99 (object)` |
| F2 | Invalid transition check fails because Prisma doesn't enforce business rules | Diagnostic: `Update SUCCEEDED. New status: EXPIRED` |
| F3 | Activation payment checks fail because mock provider lookup key mismatches | Diagnostic: `Payment status: null` in activation error log |
| F4 | Demo activation without payment ref fails due to no MT5 AVAILABLE accounts | Diagnostic: allocation returns "No available accounts matching criteria" |
| F5 | `check()` helper never throws on failure | Code inspection of all 4 test files |
| F6 | 2 unproven concurrency checks are correctly marked due to Neon serverless limitations | Code inspection of `checkUnproven()` calls with explanatory detail |

### Hypotheses (Requiring Further Investigation)

| # | Hypothesis | Status |
|---|-----------|--------|
| H1 | Activation test has 6 failures (not 5 confirmed) | 6th failure not identified — likely DB-state dependent |
| H2 | Funded account test has 1 failure | Cannot confirm — test timed out before completion |
| H3 | Leftover MT5 accounts in VM DB enable allocation for some tests | Plausible — would change which checks fail/pass in activation tests |

---

## 6. Recommended Fixes (Priority Order)

### Critical

| # | Fix | Files | Effort |
|---|-----|-------|--------|
| C1 | Fix `check()` helper to fail process on assertion failure | All test files using `check()` | 5 minutes |
| C2 | Fix mock payment provider to support `getPaymentStatus` lookup by `idempotencyKey` OR update tests to use returned `paymentId` | `lib/mock-payment-provider.ts`, `tests/activation.test.ts` | 15 minutes |

### High

| # | Fix | Files | Effort |
|---|-----|-------|--------|
| H1 | Fix Decimal comparison in order total check | `tests/order-lifecycle.test.ts:147` | 2 minutes |
| H2 | Fix invalid transition test: test via HTTP route with actually invalid transition | `tests/order-lifecycle.test.ts:305-327` | 15 minutes |
| H3 | Create MT5 AVAILABLE accounts in test DB before allocation-dependent tests | `tests/activation.test.ts` beforeEach | 10 minutes |

### Medium

| # | Fix | Files | Effort |
|---|-----|-------|--------|
| M1 | Extract `safeEvaluation()` to shared utility | `app/api/evaluations/route.ts`, `app/api/evaluations/[id]/route.ts` | 20 minutes |
| M2 | Extract `getAuthenticatedUser()` to shared middleware | All API route files | 30 minutes |
| M3 | Ensure funded account lifecycle test completes within timeout | `tests/funded-account-lifecycle.test.ts` | Investigation needed |

### Low

| # | Fix | Files | Effort |
|---|-----|-------|--------|
| L1 | Add MT5 account creation to test fixtures | Multiple test files | 15 minutes |
| L2 | Add concurrent test support with deterministic locking | `tests/funded-account-lifecycle.test.ts` | 60+ minutes |

---

## 7. Commands Executed & Validation Results

### Commands Executed

| Command | Purpose | Result |
|---------|---------|--------|
| `node scripts/run-tests.js npx tsx tests/order-lifecycle.test.ts` | Run order lifecycle tests | 13 Node tests PASS, custom: 10/12 passed |
| `node scripts/run-tests.js npx tsx tests/activation.test.ts` | Run activation tests | 13 Node tests PASS, custom: 15/21 passed |
| `node scripts/run-tests.js npx tsx tests/funded-account-lifecycle.test.ts` | Run funded account tests | TIMEOUT (>600s) — did not complete |
| `node scripts/run-tests.js npx tsx tests/order-lifecycle-diag.test.ts` | Diagnostic for order tests | Revealed Decimal comparison failure |
| `node scripts/run-tests.js npx tsx tests/activation-diag.test.ts` | Diagnostic for activation tests | Revealed payment lookup failure (payment status: null) |
| `npx next build` | Production build | PASS (22 routes) |
| `node scripts/run-tests.js npx eslint tests/evaluations-api.test.ts` | ESLint on test file | 0 errors, 0 warnings |

### Exit Codes

| Test | Node Exit Code | Custom Result |
|------|---------------|---------------|
| Order Lifecycle | 0 (success) | 10/12 passed (2 failed — NOT detected) |
| Activation | 0 (success) | 15/21 passed (6 failed — NOT detected) |
| Funded Account | 0 (success) | Incomplete (timeout) |

### Database/Environment Limitations

1. **Neon DB intermittent connectivity** — serverless pooler occasionally unreachable, affecting test cleanup and reliability
2. **No MT5 AVAILABLE accounts** in test DB — causes allocation failures in activation tests
3. **Neon serverless pooler** prevents reliable concurrent test execution
4. **Test timeouts** — funded account lifecycle test exceeds 5-minute threshold
5. **Prisma Decimal type** — strict equality comparison fails for identical numeric values

---

## 8. Current State

| | |
|---|---|
| **Current branch** | `audit/phase18-test-reliability` |
| **Changed files** | `docs/phase18-test-reliability-audit.md` (new) |
| **Untracked files** | `docs/phase18-test-reliability-audit.md` |
| **Diagnostics removed** | Yes (order-lifecycle-diag.test.ts, order-diag-2.test.ts, activation-diag.test.ts all deleted) |
| **Commit performed** | No |
| **Push performed** | No |
| **Production code modified** | No |
| **Prisma schema modified** | No |

---

## 9. Recommended Next Implementation Step

**Immediate next step:** Fix the `check()` helper to fail the process on assertion failures (Priority C1). This is the highest-impact, lowest-effort fix — it will make all silent test failures visible to CI/CD pipelines and developers, enabling detection of the other issues identified in this audit.

After C1, the next priority is C2 (fix mock payment provider lookup) which will resolve 4 of the 6 activation test failures.
