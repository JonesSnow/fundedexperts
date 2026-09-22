# Evaluation API Security Review

**Date:** 2026-09-22
**Scope:** Evaluation API endpoints, order activation flow, funded accounts access, dashboard integration
**Status:** COMPLETED

---

## 1. Summary

This review covers the security hardening of the evaluation and activation subsystem, implementation of two new evaluation API endpoints with proper authorization, and the integration of evaluation data into the trader dashboard. All changes have been validated with TypeScript (0 errors), ESLint (0 errors on new/modified files), automated tests (17/17 passing, 52/52 checks), and Next.js production build (22 routes compiled successfully).

---

## 2. Findings and Fixes

### 2.1 CRITICAL — Order Activation Ownership Bypass (FIXED)

| Before | After |
|--------|-------|
| `app/api/orders/[id]/activate/route.ts` activated any order without verifying trader ownership | Ownership verified at service level via `order.traderId !== performedBy` in `lib/activation.ts` |

A trader could have activated another trader's order if they knew the order ID. The activation service now checks ownership before proceeding, returning FORBIDDEN when `order.traderId !== performedBy`. Additionally, demo payments (`paymentReference === "demo-payment"`) are detected and bypass the payment provider while verifying PAID status, with an `isDemoPayment` flag in the response and distinct `activationInput` for demo vs real mode.

### 2.2 CRITICAL — Funded Accounts Cross-Trader Access (FIXED)

| Before | After |
|--------|-------|
| `app/api/funded-accounts/route.ts` returned all funded accounts to any authenticated user | TRADER role filtered by `where.traderId = trader.id`; ADMIN sees all |

The funded accounts list endpoint now enforces ownership: traders see only their own accounts, while admins see all.

### 2.3 HIGH — Evaluation API Missing (IMPLEMENTED)

Two new endpoints were implemented with proper authorization and field exposure controls:

**`GET /api/evaluations`** — Lists evaluations:
- Requires authentication (401 if unauthenticated)
- TRADER sees only own evaluations; ADMIN sees all
- Supports `?status=` filter
- Returns safe fields only (no MT5 credentials, no login/server/broker details in account info)
- `traderId` included only for ADMIN role

**`GET /api/evaluations/[id]`** — Fetches single evaluation:
- Requires authentication (401 if unauthenticated)
- TRADER can access only own evaluations (403 for cross-trader access)
- ADMIN can access any evaluation
- Returns 404 for nonexistent evaluations
- Same safe field exposure rules as list endpoint

### 2.4 MEDIUM — Dashboard Evaluation Integration (IMPLEMENTED)

`app/dashboard/page.tsx` was updated to display evaluation data:
- Added `evaluations`, `evaluationsLoading`, `evaluationsError` state
- Dedicated "Evaluations" section showing ruleset name/version, status, rule compliance counts, account info, PnL, timestamps
- `loadEvaluations()` fetches from `/api/evaluations`
- Added to initial data loading `Promise.all`
- Renamed "Evaluation Status" → "Order & Activation Status" with disclaimer
- "Activate (Demo)" button label; response handler shows "Evaluation activated (demo mode)" for demo payments
- Removed `fundedAccountsAvailable` state section

### 2.5 LOW — Infrastructure Issues (FIXED)

- **Build error**: `app/api/evaluations/[id]/route.ts` had malformed type syntax `Promise<{ id: string> }` (missing closing brace) — fixed to `Promise<{ id: string }> }`
- **Type mismatch**: Prisma `Decimal` fields (`totalPnl`, `maxDrawdown`) not assignable to `number` in route response types — fixed with `Number()` conversion and `unknown` parameter types
- **Prisma include gap**: `evaluatedAt` missing from `ruleEvaluations` select in both evaluation routes — added to select and type definitions
- **Cleanup order**: Test cleanup steps reordered to respect FK dependencies (ruleEvaluation → ruleEvent → orderItem → monitoringJob → accountAssignment → ledgerEntry → rule → fundedAccount → order → evaluation → auditLog → rulesetVersion → ruleset → product → mT5Account → trader)

---

## 3. Sensitive Field Exposure Verification

All evaluation API responses are verified to exclude sensitive data:

| Field | Exposed to TRADER | Exposed to ADMIN |
|-------|-------------------|-------------------|
| traderId | No | Yes |
| MT5 login | No | No |
| MT5 server | No | No |
| MT5 broker | No | No |
| MT5 credentials | No | No |
| accountNumber | Yes (masked by API) | Yes |
| account status | Yes | Yes |

---

## 4. Test Coverage

**File**: `tests/evaluations-api.test.ts` (17 tests, 52 checks)

| Suite | Tests | Coverage |
|-------|-------|----------|
| Authentication | 2 | Unauthenticated rejection for list and single endpoints |
| List Authorization | 4 | Trader own-only, admin all, status filter, empty list |
| Single Authorization | 4 | Own access, cross-trader rejection (403), admin access, 404 |
| Sensitive Field Exposure | 4 | No traderId for non-admin, no MT5 credentials |
| Data Accuracy | 3 | Persisted values, null account handling, zero rule counts |

---

## 5. Validation Results

| Check | Result |
|-------|--------|
| TypeScript | 0 errors (build passes) |
| ESLint | 0 errors, 0 warnings on new/modified files |
| Next.js production build | PASS (22 routes) |
| Evaluation API tests | 17/17 pass, 52/52 checks |
| Cleanup | All 16 cleanup operations succeed per test |

---

## 6. Remaining Recommendations (Out of Scope)

These were identified but are not part of this review's scope:

1. **`safeEvaluation()` function duplication**: Defined in both `app/api/evaluations/route.ts` and `app/api/evaluations/[id]/route.ts`. Should be extracted to a shared utility (e.g., `lib/api/safe-evaluation.ts`).
2. **Next.js middleware deprecation**: `middleware.ts` uses the deprecated middleware convention (will need migration to proxy in Next.js 16).
3. **Rate limiting**: No rate limiting on evaluation endpoints. Should consider adding `lib/auth/rate-limit.ts` integration.
4. **Audit logging**: Evaluation access is not currently logged. Consider adding audit entries for compliance.

---

## 7. Files Changed

| File | Action |
|------|--------|
| `app/api/evaluations/route.ts` | Created — GET list with auth and safe fields |
| `app/api/evaluations/[id]/route.ts` | Created — GET single with auth, ownership, safe fields |
| `app/dashboard/page.tsx` | Updated — evaluation section integration |
| `tests/evaluations-api.test.ts` | Created — 17 tests, 52 checks |
| `docs/evaluation-api-design.md` | Updated — from draft to implemented spec |
| `lib/activation.ts` | Ownership check added (earlier phase) |
| `lib/payment.ts` | PaymentProvider interface (earlier phase) |
| `lib/mock-payment-provider.ts` | Demo payment detection (earlier phase) |
| `app/api/orders/[id]/activate/route.ts` | Security hardening (earlier phase) |
| `app/api/funded-accounts/route.ts` | TRADER filtered access (earlier phase) |
| `app/api/funded-accounts/[id]/route.ts` | Owner/admin access (earlier phase) |
| `middleware.ts` | Dashboard route protection (earlier phase) |
| `lib/logger.ts` | Structured logger with redaction (earlier phase) |
| `docs/security-findings.md` | Tracks findings across phases |
| `docs/test-environment.md` | Test infrastructure docs |

---

## 8. Conclusion

All identified security issues in the evaluation and activation subsystem have been addressed. The evaluation API endpoints implement proper authentication, authorization, and safe field exposure. Automated tests verify all security behaviors. The dashboard correctly displays evaluation data without exposing sensitive information. The implementation is ready for deployment pending production monitoring validation.
