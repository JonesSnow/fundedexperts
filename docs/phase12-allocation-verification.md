# Phase 12 — Account Allocation Transaction Verification

**Date:** 2026-09-20
**Phase:** 12

---

## 1. Current Allocation Implementation Status

| Check | Result |
|---|---|
| Allocation service in lib/ | **NOT IMPLEMENTED** — no allocation files found |
| Allocation function in any route | **NOT IMPLEMENTED** — grep found no allocation/allocate references |
| ACCOUNT_ASSIGNED audit action | **NOT IMPLEMENTED** — only ACCOUNT_CREATED, ACCOUNT_USED exist in routes |
| Transaction-based allocation | **NOT IMPLEMENTED** — no route uses prisma.$transaction for allocation |
| docs/allocation-design.md | **DESIGN ONLY** — states "Not implemented" |

**Finding:** Account allocation is entirely unimplemented. The design document describes a Prisma transaction with row locking, but no code exists for it.

## 2. Schema Constraints Reviewed

| Constraint | Status | Details |
|---|---|---|
| `@@unique([traderId, accountId, assignedAt])` on AccountAssignment | **EXISTS** | Prevents same trader + same account + same timestamp collision only |
| Cross-trader duplicate assignment prevention | **MISSING** | No unique constraint prevents different traders from being assigned the same account simultaneously |
| Account status ↔ assignment consistency | **MISSING** | No trigger or constraint links MT5Account.status to AccountAssignment.status |
| Foreign key (AccountAssignment → MT5Account) | **ENFORCED** | P2003 blocks assignment to non-existent account (VERIFIED) |
| Foreign key (AccountAssignment → Trader) | **ENFORCED** | Standard FK |
| ON DELETE RESTRICT on AccountAssignment | **VERIFIED** | Account deletion blocked when assignments exist (via API route transaction) |

## 3. Transaction Strategy Reviewed

| Aspect | Classification | Details |
|---|---|---|
| Transaction boundaries | **DOCUMENTED** — not implemented | Design doc proposes prisma.$transaction for allocation |
| Row locking (SELECT FOR UPDATE) | **UNVERIFIED** — not used | Prisma does not support raw SELECT FOR UPDATE in query API |
| SKIP LOCKED | **UNVERIFIED** — not used | Proposed in design doc via raw SQL, not implemented |
| Transaction isolation level | **ASSUMED** READ COMMITTED | Not empirically verified |
| Retry behavior | **UNIMPLEMENTED** | No retry logic in allocation design or code |
| Connection pooling | **UNVERIFIED** | Pool size and timeout not reviewed |
| Rollback behavior | **VERIFIED** — for deletion | prisma.$transaction used in DELETE /api/accounts/[id] for dependency check; rollback confirmed via constraint test |
| Account status transition atomicity | **NOT ATOMIC** | Status route uses standalone prisma.mT5Account.update() — no transaction wrapping, no row locking |

**Critical finding:** The status transition route (PUT /api/accounts/[id]/status) does NOT use a transaction or row locking. An admin can set an account to IN_USE while another request is simultaneously trying to allocate it, leading to inconsistent state.

## 4. Verified Behavior

| Behavior | Status | Evidence |
|---|---|---|
| FK enforcement on AccountAssignment | **VERIFIED** | P2003 blocks assignment to non-existent account |
| Transaction rollback (dependency check) | **VERIFIED** | Deletion transaction leaves no partial records |
| Audit log excludes credentials/secrets | **VERIFIED** | No secrets in audit log details |
| Unique constraints (email, accountNumber, etc.) | **VERIFIED** | Schema validated, migration applied |
| Prisma migration applies cleanly | **VERIFIED** | 20260920164647_init applied successfully |

## 5. Unverified Assumptions

| Assumption | Status | Note |
|---|---|---|
| Prisma $transaction uses READ COMMITTED | **UNVERIFIED** | Assumed from Prisma/PostgreSQL docs |
| Implicit row locking sufficient for allocation | **UNVERIFIED** | Not tested under contention |
| Explicit SELECT FOR UPDATE would improve safety | **UNVERIFIED** | Not tested |
| SKIP LOCKED works through $executeRaw | **UNVERIFIED** | Not tested |
| Transaction timeout defaults | **UNVERIFIED** | Not checked |
| Allocation serialization under concurrent load | **BLOCKED** | No allocation service exists to test |

## 6. Database Constraint Test Results

Tests run against Neon PostgreSQL with `alloc-test-*` prefixed test records (all cleaned up after testing).

| Test | Result | Details |
|---|---|---|
| FK enforcement (non-existent account) | **PASS** | P2003 blocks assignment |
| Cross-trader duplicate assignment | **NOT PREVENTED** | Two different traders CAN be assigned same account simultaneously — no DB constraint prevents this |
| Same-trader reassignment (history) | **PASS** | Reassignment allowed; history preserved |
| Account IN_USE without assignments | **ALLOWED** | No trigger enforces assignment-status consistency |
| Transaction rollback (failed transaction) | **PASS** | No partial records after simulated failure |
| Account status transition enforcement | **NOT ENFORCED** | Status can be changed to any valid value via direct DB update; no trigger enforces transition rules |
| Audit log secrets check | **PASS** | No credentials, passwords, or secrets in audit log details |

**Critical finding:** The unique constraint on AccountAssignment `@@unique([traderId, accountId, assignedAt])` prevents duplicate assignments by the SAME trader at the SAME millisecond, but does NOT prevent:
1. Multiple traders assigned to the same account simultaneously
2. An account being IN_USE with no active assignments
3. An account having ASSIGNED assignments while in AVAILABLE status

## 7. Concurrency Test Results

| Check | Result | Reason |
|---|---|---|
| Concurrent allocation of same account | **BLOCKED** | No allocation service exists to test |
| Duplicate active assignment prevention | **BLOCKED** | No allocation service exists to test |
| Account status correctness after concurrent attempts | **BLOCKED** | No allocation service exists to test |
| Failed transaction consistency | **VERIFIED** (partial) | Rollback works for dependency check transaction; allocation transaction not testable |
| Audit log secrets under concurrency | **NOT TESTED** | Cannot test without allocation service |

**Finding:** Concurrency safety of allocation CANNOT be claimed. The design doc proposes a transaction with row locking, but it has not been implemented, tested, or verified empirically.

## 8. Rollback Results

| Scenario | Result |
|---|---|
| Failed dependency check transaction (DELETE /api/accounts/[id]) | **VERIFIED** — no partial records after rollback |
| Failed allocation transaction | **UNTESTED** — allocation service not implemented |
| Failed status transition | **UNTESTED** — status route does not use transactions |

## 9. Remaining Security and Integrity Risks

| Risk | Severity | Details |
|---|---|---|
| Cross-trader duplicate account assignment | **HIGH** | No DB constraint prevents two traders from being assigned the same account simultaneously |
| Account status-assignment inconsistency | **HIGH** | No trigger or transaction links MT5Account.status to AccountAssignment records |
| Race condition in status transitions | **MEDIUM** | PUT /api/accounts/[id]/status has no transaction or row locking |
| Unverified concurrency safety | **HIGH** | Cannot claim allocation is safe under concurrent load — service not implemented |
| Integration tests vacuous | **MEDIUM** | 19 integration tests have zero assertions when DATABASE_URL is loaded |
| No test script in package.json | **LOW** | No `pnpm test` equivalent exists |

## 10. Whether Allocation Is Ready for Further Development

**NOT READY** for production development.

Prerequisites for allocation implementation:
1. Add unique constraint or partial index to prevent duplicate active assignments across traders for the same account
2. Implement allocation service in lib/ using prisma.$transaction with explicit row locking (raw SELECT FOR UPDATE SKIP LOCKED via $executeRaw)
3. Link account status transitions to assignment creation atomically within a transaction
4. Add database trigger or application-level invariant check for status-assignment consistency
5. Create meaningful integration tests with actual assertions (current integration tests are vacuous)
6. Add `test` script to package.json
7. Perform concurrency testing against Neon PostgreSQL under realistic load

## 11. Recommended Next Phase

1. Implement allocation service in `lib/allocation.ts` using the design from docs/allocation-design.md with the following modifications:
   - Use `prisma.$executeRaw` for SELECT FOR UPDATE SKIP LOCKED (not implicit locking)
   - Add unique constraint or partial index on AccountAssignment for active assignments per account
   - Wrap account status update and assignment creation in a single transaction
2. Create meaningful integration tests for allocation (current tests are vacuous)
3. Add `test` script to package.json (e.g., `"test": "node_modules/.bin/tsx tests/auth.test.ts"` or combined runner)
4. Perform concurrency POC with multiple simultaneous allocation attempts against Neon
5. Address 30 pre-existing ESLint warnings in app/ API route files
6. Consider adding database trigger for status-assignment consistency

---

**Phase 12 Status: COMPLETE — with critical findings**

Allocation is NOT implemented. Database constraints verified. Cross-trider duplicate assignment NOT prevented. Concurrency safety CANNOT be claimed. Integration tests are vacuous.
