# Phase 21A Test-Count Reconciliation

**Date**: 2026-09-21
**Purpose**: Correct the test-count discrepancy in the Phase 21A report before proceeding to Phase 21B implementation.

---

## Discrepancy Summary

The Phase 21A report contained these inconsistencies:

1. **Category sum ≠ reported total**: Categories sum to 218, report says 199
2. **Pass/fail/skip ≠ reported total**: 197 + 0 + 1 = 198, report says 199
3. **Auth category undercounted**: Listed as 0 executed; actual is 1 executed (import failure)
4. **Products/rulesets count**: Vitest reported 11; actual count is 14 (vitest miscounts node:test tests)
5. **Monitoring test counts**: Vitest per-suite counts were lower than actual; tsx --test counts are accurate

---

## Corrected Counts (via `npx tsx --test`)

The `tsx --test` runner is the correct runner because all test files use `import { describe, it } from "node:test"`.

### Per-File Results

| Test File | Executed | Passed | Failed | Skipped (framework) | Notes |
|---|---|---|---|---|---|
| `tests/monitoring/worker.test.ts` | 19 | 19 | 0 | 0 | All pass |
| `tests/monitoring/scheduler.test.ts` | 28 | 28 | 0 | 0 | All pass |
| `tests/monitoring/job.test.ts` | 16 | 16 | 0 | 0 | All pass |
| `tests/monitoring/health.test.ts` | 8 | 8 | 0 | 0 | All pass |
| `tests/monitoring/retry.test.ts` | 9 | 9 | 0 | 0 | All pass |
| `tests/monitoring/eligibility.test.ts` | 16 | 16 | 0 | 0 | All pass |
| `tests/monitoring/normalize.test.ts` | 11 | 11 | 0 | 0 | All pass |
| `tests/monitoring/mock-adapter.test.ts` | 16 | 16 | 0 | 0 | All pass |
| `tests/monitoring/logger.test.ts` | 14 | 14 | 0 | 0 | All pass |
| `tests/monitoring/security.test.ts` | 5 | 5 | 0 | 0 | All pass |
| `tests/monitoring/credential-boundary.test.ts` | 20 | 20 | 0 | 0 | All pass |
| `tests/mt5-accounts.test.ts` | 38 | 38 | 0 | 0 | All pass |
| `tests/products-and-rulesets.test.ts` | 14 | 14 | 0 | 0 | All pass |
| `tests/e2e-workflow.test.ts` | 1 | 1 | 0 | 0 | DB integration tests skipped within |
| `tests/phase16-audit.test.ts` | 1 | 1 | 0 | 0 | DB integration tests skipped within |
| `tests/phase17-recovery.test.ts` | 1 | 1 | 0 | 0 | DB integration tests skipped within |
| `tests/mt5-accounts.integration.test.ts` | 1 | 1 | 0 | 0 | DB tests marked skipped by test |
| `tests/auth.test.ts` | 1 | 0 | 1 | 0 | JWT_SECRET not configured; import fails |

### Category Summary

| Category | Executed | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|
| Monitoring (11 files) | 162 | 162 | 0 | 0 | All tsx --test counts |
| MT5 account | 38 | 38 | 0 | 0 | All pass |
| Products/rulesets | 14 | 14 | 0 | 0 | Vitest previously reported 11 (miscount) |
| E2E workflow | 1 | 1 | 0 | 0 | DB tests skipped within test |
| Phase 16 audit | 1 | 1 | 0 | 0 | DB tests skipped within test |
| Phase 17 recovery | 1 | 1 | 0 | 0 | DB tests skipped within test |
| Integration | 1 | 1 | 0 | 0 | DB tests skipped by test framework |
| Auth | 1 | 0 | 1 | 0 | JWT_SECRET import failure |
| **Totals** | **219** | **218** | **1** | **0** | |

### Auth Test Detail

`tests/auth.test.ts` contains 17 `it()` blocks. None execute because the module import `import { createSession, getSession, SESSION_COOKIE } from "../lib/auth/session"` at line 5 triggers a JWT_SECRET check at `lib/auth/session.ts:6` which throws an Error before any test runs.

The tsx runner reports this as: `tests 1, pass 0, fail 1` — one test (the file-level execution) failed.

**Conclusion**: Auth test failure is environmental (JWT_SECRET not set in shell), not a code defect. The 17 test cases within the file are NOT counted as executed because the import failed.

### Integration Test Detail

`tests/mt5-accounts.integration.test.ts` contains a `test.skip` call when DATABASE_URL is not configured. The test framework reports: `tests 1, pass 1, fail 0, skipped 0` — the skip itself executed successfully (1 pass). The internal DB tests are not counted because they were never executed.

---

## Why Previous Counts Were Wrong

### Vitest Miscounting

Vitest has a known issue with counting `node:test` imports. It reported lower counts for several files:

| File | Vitest count | tsx --test count | Difference |
|---|---|---|---|
| monitoring/scheduler.test.ts | 14 | 28 | 14 missing |
| monitoring/mock-adapter.test.ts | 5 | 16 | 11 missing |
| monitoring/credential-boundary.test.ts | 4 | 20 | 16 missing |
| monitoring/worker.test.ts | 16 | 19 | 3 missing |
| monitoring/eligibility.test.ts | 11 | 16 | 5 missing |
| products-and-rulesets.test.ts | 11 | 14 | 3 missing |

### Double-Counting from Vitest Suite Headers

Vitest reported individual suite counts within each file AND file-level totals. This led to double-counting when summing suite counts (e.g., monitoring showed "172" from summing suite counts but actually contains 162 tests).

---

## Corrected Phase 21A Report Values

| Metric | Phase 21A Report (incorrect) | Corrected Value |
|---|---|---|
| Monitoring | 162 | 162 ✓ |
| MT5 account | 38 | 38 ✓ |
| Products/rulesets | 14 (table) / 11 (summary) | 14 |
| E2E/Phase16/Phase17 | 3 | 3 ✓ |
| Integration | 1 | 1 ✓ |
| Auth | 0 | 1 executed (0 pass, 1 fail) |
| **Total executed** | **199** | **219** |
| **Total passed** | **197** | **218** |
| **Total failed** | **0** | **1** (auth import failure) |
| **Total skipped** | **1** | **0** (framework-level) |

---

## Test Execution Verification

All tests were executed via:

```powershell
npx tsx --test <test-file-path>
```

Environment: Node.js v24.18.0, tsx v4.23.13

All monitoring tests were also executed in a single batch (11 files combined):

```powershell
npx tsx --test tests/monitoring/worker.test.ts tests/monitoring/scheduler.test.ts ... tests/monitoring/credential-boundary.test.ts
```

Result: 162 tests, 162 pass, 0 fail, 0 skipped (confirmed in single batch output: `ℹ tests 162, ℹ suites 91, ℹ pass 162, ℹ fail 0`).

---

## Environment Configuration (Verified Safely)

- **DATABASE_URL**: Present in `.env.local` (value redacted)
- **JWT_SECRET**: Present in `.env.local` (value redacted) — but NOT in shell PATH, causing auth test failure when running via tsx
- **MT5_ENCRYPTION_KEY**: Present in `.env.local` (value redacted)

Note: `.env.local` values are loaded by Next.js runtime but NOT by tsx/Node.js directly. This is why auth.test.ts fails when run via `npx tsx --test` but may work when running via `npm run dev` or `next build`.

---

## Neon Database Status

The previous Neon database configuration (from Phase 18 area) is still present at `.env.local`. No fresh Neon database was configured in this session. Existing migrations are present in `prisma/migrations/`:

- `20260920164647_init`
- `20260920164648_active_assignment_unique`
- `20260920170000_evaluation_linking_enhancements`

---

## Previous Test Counts in Documentation (for Audit Trail)

These incorrect counts appear in existing documentation and should be noted but not silently altered:

1. `docs/phase20d-worker-design-review.md` — Section 4 lists monitoring tests with mixed vitest/tsx counts
2. `docs/phase20d-final.md` — Lists "Monitoring tests: 172/172 PASS" (should be 162/162) and "Total: 222/222" (should be 219)
