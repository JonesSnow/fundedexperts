# Phase 14 — Account Release/Return Service

**Date:** 2026-09-20
**Phase:** 14

---

## 1. Implementation Summary

| Component | Status | Details |
|---|---|---|
| `lib/release.ts` | **IMPLEMENTED** | Transaction-based release/return service |
| `app/api/accounts/[id]/status/route.ts` | **HARDENED** | IN_USE/AVAILABLE consistency checks, admin override auditing |
| Integration tests | **IMPLEMENTED** | 5 release tests added (all PASS) |
| Account status consistency | **VERIFIED** | IN_USE requires active assignment; AVAILABLE requires no active assignment |
| Audit logging | **VERIFIED** | All status changes logged with admin override flag |

---

## 2. Release Service (`lib/release.ts`)

### Service Contract

| Aspect | Definition |
|---|---|
| Input | `traderId: string`, `accountId: string`, `reason: ReleaseReason`, `isAdminOverride?: boolean` |
| Release Reasons | `EVALUATION_FAILED`, `EVALUATION_COMPLETED`, `EVALUATION_EXPIRED`, `ADMINISTRATIVE_CORRECTION`, `ACCOUNT_DEACTIVATED`, `OTHER` |
| Transaction | `prisma.$transaction` wrapping assignment lookup, evaluation update, account status update, audit log |
| Authorization | Trader can release own assignment; admin can override with `isAdminOverride: true` |
| Success | `{ success: true, assignment: AccountAssignment, account: MT5Account, evaluationUpdated: boolean, evaluationStatus?: EvaluationStatus }` |
| Failure | `{ success: false, error: string }` |
| Audit | `ACCOUNT_RETURNED` action in AuditLog with accountNumber, assignmentId, reason, adminOverride flag |
| Rollback | Full Prisma transaction rollback on any failure |
| Credentials | Never exposed in service layer, API routes, audit logs, or any output |

### Release Reasons and Their Effects

| Reason | Account Status | Evaluation Status | Evaluation accountId |
|---|---|---|---|
| `EVALUATION_FAILED` | AVAILABLE | FAILED | Cleared (set to null) |
| `EVALUATION_COMPLETED` | AVAILABLE | PASSED | Preserved |
| `EVALUATION_EXPIRED` | AVAILABLE | Unchanged | Cleared (set to null) |
| `ADMINISTRATIVE_CORRECTION` | AVAILABLE | Unchanged | Cleared (set to null) |
| `ACCOUNT_DEACTIVATED` | INACTIVE | Unchanged | Cleared (set to null) |
| `OTHER` | AVAILABLE | Unchanged | Cleared (set to null) |

### Transaction Flow

```
1. Find active ASSIGNED assignment for account
2. Verify trader ownership (or admin override)
3. BEGIN TRANSACTION
4. Find evaluation for account (if exists)
5. Update evaluation based on reason:
   - EVALUATION_FAILED → status = FAILED, completedAt = now(), accountId = null
   - EVALUATION_COMPLETED → status = PASSED, completedAt = now()
   - Other → accountId = null (clear link)
6. Update MT5Account status:
   - ACCOUNT_DEACTIVATED → INACTIVE
   - EVALUATION_COMPLETED → AVAILABLE
   - Other → AVAILABLE
7. Update AccountAssignment status = RETURNED, returnedAt = now()
8. Create AuditLog (ACCOUNT_RETURNED)
9. COMMIT
```

### Authorization Rules

| Scenario | Result |
|---|---|
| Trader releases own assignment | SUCCESS |
| Admin releases any assignment (no override) | SUCCESS |
| Trader releases another trader's assignment | FAILURE — "Not authorized to release another trader's assignment" |
| Admin releases another trader's assignment (with override) | SUCCESS |
| Release account with no active assignment | FAILURE — "No active assignment found for this account" |

---

## 3. Status Route Hardening (`app/api/accounts/[id]/status/route.ts`)

### Consistency Checks

| New Status | Check | Error |
|---|---|---|
| `IN_USE` | Active ASSIGNED assignment must exist | 409 — "Cannot set IN_USE: no active assignment exists" |
| `AVAILABLE` | No active ASSIGNED assignment exists (or admin override) | 409 — "Cannot set AVAILABLE: active assignment exists" |
| Same status | No-op, returns current account | 200 — no change |
| Invalid transition | Must follow `VALID_TRANSITIONS` rules | 400 — "Invalid status transition" |

### VALID_TRANSITIONS

```typescript
const VALID_TRANSITIONS = {
  AVAILABLE: ["IN_USE", "INACTIVE", "MAINTENANCE"],
  IN_USE: ["INACTIVE", "MAINTENANCE"],
  INACTIVE: ["AVAILABLE", "MAINTENANCE"],
  MAINTENANCE: ["AVAILABLE", "INACTIVE"],
};
```

### Admin Override Flow (AVAILABLE with active assignment)

1. Admin requests `AVAILABLE` while active ASSIGNED assignment exists
2. Route checks `adminOverride === true` in request body
3. If override: proceeds with status change, creates audit log with `adminOverride: true` and reason
4. If no override: returns 409 error with instruction to use adminOverride flag

### Audit Logging for Admin Override

Every admin override creates an `ACCOUNT_UPDATED` audit log entry BEFORE the status change, recording:
- Account number
- Status change details (from/to)
- `adminOverride: true`
- Reason text

All status changes create a standard `ACCOUNT_UPDATED` audit log entry with `adminOverride` flag.

### Security

| Check | Implementation |
|---|---|
| Authentication | JWT token from session cookie |
| Authorization | ADMIN role required |
| Credential exclusion | `omitCredentials()` helper removes credentials from response |
| Admin status check | SUSPENDED/INACTIVE traders rejected at session lookup |
| Input validation | Status must be valid AccountStatus enum value |

---

## 4. Integration Tests — Release (tests/mt5-accounts.integration.test.ts)

**5/5 PASS** with Neon PostgreSQL.

| Test | Result | Key Assertions |
|---|---|---|
| Release allocated account | PASS | Account AVAILABLE, assignment RETURNED, returnedAt set |
| Release another trader's assignment (no override) | PASS | Returns failure with authorization error |
| Release with admin override | PASS | Account AVAILABLE, assignment RETURNED |
| Preserve assignment history after release | PASS | Assignment updated to RETURNED with returnedAt |
| Release account with no active assignment | PASS | Returns failure with no active assignment error |

---

## 5. Full Test Results

All test suites pass with Neon PostgreSQL:

| Test File | Total | Passed | Failed | Skipped |
|---|---|---|---|---|
| auth.test.ts | 20 | 20 | 0 | 0 |
| mt5-accounts.test.ts | 38 | 38 | 0 | 0 |
| products-and-rulesets.test.ts | 14 | 14 | 0 | 0 |
| mt5-accounts.integration.test.ts | 15 | 15 | 0 | 0 |
| **Totals** | **87** | **87** | **0** | **0** |

---

## 6. Static Checks

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS (0 errors) |
| ESLint | `npx eslint .` | 0 errors, 38 warnings (all pre-existing) |
| Production build | `npx next build` | PASS (21 routes) |
| Prisma generate | `npx prisma generate` | PASS |
| All tests | `npx tsx` (with env vars) | 87/87 PASS with DB |

---

## 7. Schema Constraints Verified

| Constraint | Status | Enforcement |
|---|---|---|
| FK (AccountAssignment → MT5Account) | VERIFIED | P2003 blocks assignment to non-existent account |
| FK (AccountAssignment → Trader) | VERIFIED | Standard FK enforcement |
| Partial unique index (accountId WHERE status=ASSIGNED) | VERIFIED | P2002 blocks duplicate active assignments |
| Account status ↔ assignment consistency | VERIFIED | Route checks + service manages both atomically |
| No credentials in audit logs | VERIFIED | AuditLog details contain no credentials/secrets |
| No credentials in API responses | VERIFIED | `omitCredentials()` helper used in all account routes |

---

## 8. Known Limitations

| Limitation | Status | Note |
|---|---|---|
| Status update route standalone | DOCUMENTED | PUT /api/accounts/[id]/status can set any valid status without transaction; admin override |
| PostgreSQL local installation | BLOCKED | No admin rights; Neon PostgreSQL used instead |
| MT5/XM write operations | BLOCKED | No public API for retail MT5 |
| Connection pooling tuning | UNVERIFIED | Default Prisma pool size used |
| 38 ESLint warnings | LOW | All pre-existing unused variable warnings |

---

## 9. Remaining Security and Integrity Risks

| Risk | Severity | Status |
|---|---|---|
| Cross-trader duplicate assignment | NONE | MITIGATED — Partial unique index |
| Account status-assignment inconsistency | NONE | MITIGATED — Route checks + service atomicity |
| Concurrency duplicate allocation | NONE | MITIGATED — FOR UPDATE SKIP LOCKED |
| Credential exposure in release | NONE | MITIGATED — Service never handles credentials |
| Status route race condition | MEDIUM | ACCEPTED — Admin override available |
| Unauthorized release | NONE | MITIGATED — Ownership check + admin override |
| ESLint warnings | LOW | PRE-EXISTING |

---

## 10. Recommended Next Phase

1. Add database trigger for status-assignment consistency (defense in depth)
2. Add connection pool tuning for production load
3. Consider adding API endpoint for allocation (PUT /api/accounts/allocate) with auth, validation, audit
4. Address 38 pre-existing ESLint warnings in app/ API route files
5. Set up CI/CD pipeline with automated migration and test execution against Neon
6. Add monitoring for allocation/release latency and failure rates
7. Consider adding API endpoint for release (POST /api/accounts/[id]/release) with auth, validation, audit

---

**Phase 14 Status: COMPLETE**

Release service implemented and tested. Status route hardened with consistency checks and admin override auditing. All 87 tests pass. Transaction-based release with history preservation. No credentials exposed. Authorization enforced at service and API levels.
