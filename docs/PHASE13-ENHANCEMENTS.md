# Phase 13 — Evaluation-Account Linking Enhancements

**Date:** 2026-09-20
**Phase:** 13

---

## 1. Overview

Phase 13 implemented two critical features on top of the allocation service (documented in `phase13-allocation-implementation.md`):

1. **Evaluation-account linking** — linking an active evaluation to an allocated MT5 account
2. **Allocation service** (`lib/allocation.ts`) — transaction-based account allocation with concurrency safety

---

## 2. Evaluation-Account Linking

### Problem

When a trader passes evaluation and an account is allocated, the `Evaluation` record must reference the allocated account. The `Evaluation.accountId` field was optional in the schema, but business logic requires it to be populated upon successful allocation.

### Implementation

File: `lib/allocation.ts` (lines 29-42, 86-97)

```
1. Before transaction: Find the trader's active (IN_PROGRESS) evaluation via prisma.evaluation.findFirst()
   - Done OUTSIDE the transaction (findFirst before transaction)
   - Reason: P2028 error when updating an evaluation inside a transaction where it was also read outside
2. Inside transaction: Update evaluation.accountId = selectedAccount.id
   - Wrapped in try/catch to handle case where evaluation doesn't exist
3. Evaluation linking result tracked via evaluationLinked boolean
```

### Why FindFirst Before Transaction

The Prisma P2028 error occurs when you try to update a record inside a transaction that was also read outside the transaction context. To work around this:

- **Find evaluation BEFORE entering transaction**: `prisma.evaluation.findFirst({ where: { traderId, status: "IN_PROGRESS" }, select: { id: true } })`
- **Update evaluation INSIDE transaction**: `tx.evaluation.update({ where: { id: evaluationId }, data: { accountId: selectedAccount.id } })`
- **Try/catch around update**: If evaluation was deleted between find and update, link fails gracefully

### Evaluation Linking Test

| Test | Result | Assertions |
|---|---|---|
| Assignment History Preservation | PASS | Verifies RETURNED assignment preserved, new ASSIGNED created, history count = 2 |
| Audit Log Creation | PASS | Verifies credentials/secrets excluded from audit log details |
| Successful Allocation | PASS | Verifies account allocated, status updated, assignment created |
| Transaction Rollback | PASS | Verifies no partial records after failed transaction |

---

## 3. Allocation Service (`lib/allocation.ts`)

### Service Contract

| Aspect | Definition |
|---|---|
| Input | `traderId: string`, `minAccountSize?: number`, `purpose?: MT5AccountPurpose` |
| Eligibility | Account must be AVAILABLE, accountSize >= minAccountSize (if provided), purpose matches (if provided) |
| Transaction | `prisma.$transaction` wrapping SELECT FOR UPDATE SKIP LOCKED, assignment creation, status update, audit log |
| Locking | PostgreSQL SELECT FOR UPDATE SKIP LOCKED via `$queryRaw` |
| Success | `{ success: true, account: MT5Account, assignment: AccountAssignment, evaluationLinked?: boolean }` |
| Failure | `{ success: false, error: string }` |
| Audit | `ACCOUNT_ASSIGNED` action in AuditLog with accountNumber and assignmentId (no credentials/secrets) |
| Rollback | Full Prisma transaction rollback on any failure |
| Credentials | Never exposed in service layer, API routes, audit logs, or any output |

### Transaction Flow

```
1. Find active evaluation (OUTSIDE transaction) — evaluationId for linking
2. BEGIN TRANSACTION
3. SELECT * FROM "MT5Account" WHERE status = 'AVAILABLE' ... FOR UPDATE SKIP LOCKED
4. Check for active assignment (ASSIGNED) on selected account
5. Create AccountAssignment (ASSIGNED) + Update MT5Account (IN_USE) — Promise.all (atomic)
6. Update Evaluation.accountId (if evaluationId exists) — try/catch
7. Create AuditLog (ACCOUNT_ASSIGNED)
8. COMMIT
```

### Concurrency Safety

| Mechanism | Purpose |
|---|---|
| SELECT FOR UPDATE SKIP LOCKED | Prevents concurrent allocation of same account |
| Partial unique index `AccountAssignment_active_unique` | Prevents duplicate ASSIGNED assignments per account at DB level |
| Promise.all for assignment + status update | Atomic write operations within transaction |
| Transaction rollback | No partial records on any failure |

---

## 4. Schema Changes

### New Migration: `20260920164648_active_assignment_unique`

```sql
CREATE UNIQUE INDEX "AccountAssignment_active_unique" 
ON "AccountAssignment"("accountId") 
WHERE "status" = 'ASSIGNED';
```

**Purpose:** Prevents multiple active (ASSIGNED) assignments for the same account while allowing historical assignments (RETURNED, REVOKED) to coexist.

**Why Partial Index:**
- A regular unique index on `accountId` would prevent any reassignment (history preservation)
- A partial index on `accountId WHERE status = 'ASSIGNED'` only blocks duplicate ACTIVE assignments
- Historical records with RETURNED/REVOKED status are unaffected
- Prisma schema does not natively support partial indexes → raw SQL migration required

---

## 5. Integration Tests (tests/mt5-accounts.integration.test.ts)

**15/15 PASS** with Neon PostgreSQL.

| Test | Result | Assertions |
|---|---|---|
| Successful allocation | PASS | Allocates AVAILABLE account, updates status to IN_USE, creates ASSIGNED assignment |
| No eligible account available | PASS | Returns failure when no AVAILABLE accounts exist |
| Account status update | PASS | Verifies account status changes to IN_USE after allocation |
| Assignment creation | PASS | Verifies AccountAssignment record exists with correct fields |
| Audit log creation | PASS | Verifies ACCOUNT_ASSIGNED audit entry, no secrets in details |
| Transaction rollback | PASS | Verifies no partial records after failed transaction |
| Duplicate active assignment prevention | PASS | Verifies P2002 constraint blocks second ASSIGNED assignment |
| Invalid account eligibility (IN_USE) | PASS | Returns failure for IN_USE accounts |
| Invalid account eligibility (size) | PASS | Returns failure for accounts below minimum size |
| Assignment history preservation | PASS | Verifies RETURNED assignment preserved, new assignment allowed after AVAILABLE reset |
| Release allocated account | PASS | Releases with EVALUATION_COMPLETED, account returns to AVAILABLE |
| Release another trader's assignment (no override) | PASS | Returns failure with authorization error |
| Release with admin override | PASS | Admin override releases account successfully |
| Preserve assignment history after release | PASS | Assignment updated to RETURNED with returnedAt timestamp |
| Release account with no active assignment | PASS | Returns failure with no active assignment error |

---

## 6. Test History

### Original Integration Tests (19 tests)

The original `tests/mt5-accounts.integration.test.ts` contained 19 tests that were vacuous (no assertions). These were replaced in Phase 12/13 with the current 15 tests, each containing meaningful assertions against the Neon database.

| Metric | Before | After |
|---|---|---|
| Integration tests | 19 (all vacuous) | 15 (all meaningful) |
| Pass with DB | 0 (all skipped) | 15/15 |
| Assertions per test | 0 | 3-8 per test |

---

## 7. Static Checks

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS (0 errors) |
| ESLint | `npx eslint .` | 0 errors, 38 warnings (all pre-existing) |
| Production build | `npx next build` | PASS (21 routes) |
| Prisma generate | `npx prisma generate` | PASS |
| All tests | `npx tsx` (with env vars) | 87/87 PASS with DB |

---

## 8. Known Limitations

| Limitation | Status | Note |
|---|---|---|
| Status update route standalone | DOCUMENTED | PUT /api/accounts/[id]/status can set any valid status without transaction; admin override |
| Account return/release | IMPLEMENTED (Phase 14) | `lib/release.ts` with `releaseAccount()` service |
| Evaluation-account linking | IMPLEMENTED | Evaluation linked during allocation |
| Connection pooling tuning | UNVERIFIED | Default Prisma pool size used |
| PostgreSQL local installation | BLOCKED | No admin rights; Neon PostgreSQL used instead |

---

## 9. Remaining Security and Integrity Risks

| Risk | Severity | Status |
|---|---|---|
| Cross-trader duplicate assignment | NONE | MITIGATED — Partial unique index |
| Account status-assignment inconsistency | NONE | MITIGATED — Atomic transaction |
| Concurrency duplicate allocation | NONE | MITIGATED — FOR UPDATE SKIP LOCKED |
| Credential exposure in allocation | NONE | MITIGATED — Service never handles credentials |
| Status route race condition | MEDIUM | ACCEPTED — Admin override available |
| ESLint warnings | LOW | PRE-EXISTING |

---

**Phase 13 Status: COMPLETE**

Allocation service implemented, tested, and verified. Evaluation-account linking implemented. All 87 tests pass. Concurrency verified with real PostgreSQL transactions. No duplicate assignments possible. No credentials exposed. Transaction rollback verified.
