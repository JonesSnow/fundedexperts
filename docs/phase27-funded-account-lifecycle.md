# WP6 — Funded Account Lifecycle

**Date:** 2026-09-22
**Phase:** 27
**WP:** 6
**Status:** IMPLEMENTED (DB-dependent tests blocked by Neon unavailability)

---

## Existing Functionality Discovered

| Item | Status | Notes |
|------|--------|-------|
| FundedAccount model | EXISTS | Status enum was {ACTIVE, CLOSED, SUSPENDED} |
| FundedAccount.traderId | EXISTS | Required, FK to Trader |
| FundedAccount.accountId | EXISTS | Optional, FK to MT5Account |
| FundedAccount.rulesetVersionId | EXISTS | Optional, FK to RulesetVersion |
| FundedAccount.evaluationId | NOT EXISTS | Added in this WP |
| allocateAccount() | EXISTS | Reused for account allocation |
| linkEvaluation() | EXISTS | Reused for evaluation linking |
| recoverEvaluationLink() | EXISTS | Reused for recovery |
| AuditLog model | EXISTS | Used for audit events |
| JWT auth | EXISTS | Used by API routes |

## New Implementation

### Schema Changes

| Change | Detail |
|--------|--------|
| FundedAccountStatus enum expanded | Added: PENDING, ELIGIBLE, APPROVED, TERMINATED, COMPLETED |
| FundedAccount.evaluationId added | Optional FK to Evaluation for traceability |
| Evaluation.fundedAccounts relation added | Reverse relation for evaluation→funded account lookup |
| Migration created | `20260922130000_funded_account_lifecycle/migration.sql` |

### Service Functions (lib/funded-account.ts)

| Function | Description |
|----------|-------------|
| `createFundedAccount(prisma, input)` | Creates PENDING funded account from evaluation. Checks for duplicates (idempotent). Returns `wasAlreadyCreated` flag. |
| `approveFundedAccount(prisma, input)` | Admin approval. Transitions PENDING/ELIGIBLE → APPROVED. |
| `linkAccount(prisma, input)` | Links MT5 account to funded account. Transitions APPROVED/ACTIVE → ACTIVE. |
| `transitionFundedAccountStatus(prisma, input)` | Admin-only status transitions with full validation. |
| `getFundedAccount(prisma, id)` | Fetch by ID. |
| `listFundedAccounts(prisma, input)` | List with filters (traderId, status, evaluationId). |

### Lifecycle States and Valid Transitions

```
PENDING → ELIGIBLE → APPROVED → ACTIVE → SUSPENDED → TERMINATED
                                            → COMPLETED
SUSPENDED → ACTIVE
SUSPENDED → TERMINATED
```

| State | Description | Entry Condition |
|-------|-------------|-----------------|
| PENDING | Account created, awaiting eligibility verification | `createFundedAccount()` |
| ELIGIBLE | Evaluation meets eligibility criteria | Admin approval |
| APPROVED | Admin approved, awaiting MT5 account assignment | `approveFundedAccount()` |
| ACTIVE | Funded and operational | `linkAccount()` or direct transition |
| SUSPENDED | Suspended with documented reason | `transitionFundedAccountStatus()` with reason |
| TERMINATED | Terminated with documented reason | `transitionFundedAccountStatus()` with reason |
| COMPLETED | Challenge completed successfully | `transitionFundedAccountStatus()` |

### API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/funded-accounts` | GET | ADMIN | List funded accounts with filters |
| `/api/funded-accounts` | POST | ADMIN | Create from evaluation |
| `/api/funded-accounts/[id]` | GET | ADMIN / trader (own) | Fetch detail |
| `/api/funded-accounts/[id]` | PATCH | ADMIN | Status transition or link account |

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | MODIFIED | FundedAccountStatus enum expanded, evaluationId field added, Evaluation.fundedAccounts relation added |
| `prisma/migrations/20260922130000_funded_account_lifecycle/migration.sql` | CREATED | Migration for enum expansion and column addition |
| `lib/funded-account.ts` | CREATED | Service layer with all lifecycle functions |
| `app/api/funded-accounts/route.ts` | CREATED | GET list, POST create |
| `app/api/funded-accounts/[id]/route.ts` | CREATED | GET detail, PATCH transitions/link |
| `tests/funded-account-lifecycle.test.ts` | CREATED | 12 test suites covering creation, approval, authorization, transitions, linking, concurrency |

## Authorization Boundaries

- **Traders**: Can create funded accounts (via POST, API enforces ADMIN role — service layer allows any caller, auth is at API level)
- **Admin**: Full access to all operations
- **Ownership**: GET /api/funded-accounts/[id] checks `traderId === session.sub` for non-admin traders
- **All mutations**: Admin-only at API route level
- **Client-provided status values are NOT trusted** — all transitions validated against `VALID_TRANSITIONS` map

## Audit Behavior

All state changes generate audit log entries:

| Event | Action | EntityType |
|-------|--------|------------|
| Account creation | ACCOUNT_CREATED | FundedAccount |
| Approval | ACCOUNT_UPDATED | FundedAccount |
| Account linking | ACCOUNT_ASSIGNED | FundedAccount |
| Status transition | ACCOUNT_UPDATED | FundedAccount |

## Idempotency Guarantees

- `createFundedAccount` checks for existing account by `evaluationId` before creating
- Duplicate creation returns existing account with `wasAlreadyCreated: true`
- `approveFundedAccount` from APPROVED state returns success (idempotent approval)
- No duplicate evaluations or accounts created on repeated calls

## Concurrency Limitations

**NOT PROVEN** — Neon serverless pooler prevents reliable concurrent test execution. Concurrent creation and status transition tests document this limitation explicitly.

## Payout Limitations

- Payout workflow NOT IMPLEMENTED
- `TRADER_PAYOUT` ledger entry type exists but no payout processing
- Payout eligibility documented as placeholder only

## Payment-Provider Limitations

- No payment provider integrated for funded accounts
- Funding comes from order payment status (PAID) or payment reference verification

## MT5 Limitations

- MT5 live connectivity BLOCKED (no credentials)
- Account linking uses MT5 account ID, not credentials
- Credentials never exposed in API responses or logs

## Tests Executed

| Test File | Status | Notes |
|-----------|--------|-------|
| tests/funded-account-lifecycle.test.ts | BLOCKED (DB) | 12 suites defined; DB unreachable for most tests |
| tests/activation.test.ts | BLOCKED (DB) | Pre-existing; also DB-dependent |
| tests/order-lifecycle.test.ts | BLOCKED (DB) | Pre-existing; also DB-dependent |
| tests/ledger.test.ts | BLOCKED (DB) | Pre-existing; also DB-dependent |
| tests/auth.test.ts | BLOCKED (DB) | Pre-existing; also DB-dependent |
| tests/products-and-rulesets.test.ts | BLOCKED (DB) | Pre-existing; also DB-dependent |
| tests/e2e-workflow.test.ts | BLOCKED (DB) | Pre-existing; also DB-dependent |
| tests/mt5-accounts.test.ts | BLOCKED (DB) | Pre-existing; also DB-dependent |
| tests/mt5-accounts.integration.test.ts | BLOCKED (DB) | Pre-existing; also DB-dependent |
| tests/phase16-audit.test.ts | BLOCKED (DB) | Pre-existing; also DB-dependent |
| tests/phase17-recovery.test.ts | BLOCKED (DB) | Pre-existing; also DB-dependent |

**Environmental issue**: Neon database server (`ep-gentle-pine-b4sgpi7e-pooler.c-6.us-east-2.aws.neon.tech:5432`) is intermittently unreachable. Tests that don't require DB (e.g., "reject non-existent evaluation") PASS. DB-dependent tests TIMEOUT.

## Tests Not Executed

- All DB-dependent test suites due to Neon unavailability
- Concurrent/race condition tests (explicitly documented as NOT PROVEN)

## Remaining Blockers

1. **Neon DB unreachable**: Prevents validation of DB-dependent tests
2. **Prisma generate EPERM**: Windows file permission issue when regenerating client (resolved by running `npx prisma generate` directly)
3. **Concurrent safety**: UNPROVEN due to Neon serverless architecture

## Recommended Next Phase

1. Validate funded account lifecycle tests when Neon DB is available
2. Implement payout workflow (separate WP)
3. Add DB triggers for data integrity (tech debt from Phase 25)
4. Implement real payment provider integration
5. Add concurrent safety tests with persistent DB connection
