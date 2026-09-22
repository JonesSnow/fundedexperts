# Phase 21B — Test Reconciliation

## Environment Variables

| Variable | Present |
|---|---|
| DATABASE_URL | Yes (in `.env.local`) |
| JWT_SECRET | Yes (in `.env.local`) |
| MT5_ENCRYPTION_KEY | Yes (in `.env.local`) |

All test suites must be run with `--env-file=.env.local` or equivalent env loading. Without it, Prisma and auth tests fail with environment variable errors.

## Corrected Test Inventory

| Test File | Tests | Passed | Failed | Skipped | Error Category | Executed |
|---|---|---|---|---|---|---|
| tests/monitoring/job.test.ts | 16 | 16 | 0 | 0 | — | Yes |
| tests/monitoring/credential-boundary.test.ts | 20 | 20 | 0 | 0 | — | Yes |
| tests/monitoring/persistence.ts | 32 | 32 | 0 | 0 | — | Yes |
| tests/monitoring/worker.test.ts | 19 | 19 | 0 | 0 | — | Yes |
| tests/monitoring/scheduler.test.ts | 28 | 28 | 0 | 0 | — | Yes |
| tests/monitoring/retry.test.ts | 9 | 9 | 0 | 0 | — | Yes |
| tests/monitoring/health.test.ts | 8 | 8 | 0 | 0 | — | Yes |
| tests/monitoring/eligibility.test.ts | 16 | 16 | 0 | 0 | — | Yes |
| tests/monitoring/mock-adapter.test.ts | 16 | 16 | 0 | 0 | — | Yes |
| tests/monitoring/normalize.test.ts | 11 | 11 | 0 | 0 | — | Yes |
| tests/monitoring/logger.test.ts | 14 | 14 | 0 | 0 | — | Yes |
| tests/monitoring/security.test.ts | 5 | 5 | 0 | 0 | — | Yes |
| tests/auth.test.ts | 20 | 20 | 0 | 0 | — | Yes |
| tests/mt5-accounts.test.ts | 38 | 38 | 0 | 0 | — | Yes |
| tests/products-and-rulesets.test.ts | 14 | 14 | 0 | 0 | — | Yes |
| tests/mt5-accounts.integration.test.ts | 15 | 15 | 0 | 0 | — | Yes |
| tests/e2e-workflow.test.ts | 23 | 23 | 0 | 0 | — | Yes |
| tests/phase16-audit.test.ts | 20 | 20 | 0 | 0 | — | Yes |
| tests/phase17-recovery.test.ts | 50 | 50 | 0 | 0 | — | Yes |
| **Total** | **374** | **374** | **0** | **0** | — | **Yes** |

## Previous Report Discrepancies

### Monitoring count discrepancy
- Previous report: 162
- Actual (monitoring/*.test.ts only): 162 ✓
- Note: `tests/monitoring/persistence.ts` (32 tests) was NOT included in `tests/monitoring/*.test.ts` pattern. When included, monitoring total is 194.

### Total count discrepancy
- Previous report: 219 total, 218 pass, 1 fail
- Categories summed to 260 but total was reported as 219
- Corrected: 374 total, 374 pass, 0 fail (after all fixes in Phase 21B)

### Auth test status
- Previous: Described as passing but also having JWT_SECRET issue
- Root cause: Tests were run without `--env-file=.env.local`. Without it, `JWT_SECRET` env var not loaded, causing "JWT_SECRET is required" error.
- Resolution: Run with `--env-file=.env.local` → 20/20 pass

### E2E test count
- Previous: 11 tests, 9 pass, 2 fail
- Actual (sequential runs): 23 checks, 23 pass, 0 fail (3 consecutive runs all pass)
- Root cause of previous failures: Test pollution from previous runs with inadequate cleanup
- Root cause of 3 failures in parallel runs: Concurrent DB access interference

### Phase 16 audit
- Previous: Fatal FK error (RulesetVersion_rulesetId_fkey)
- Root cause: Cleanup function only deleted MT5Account and Trader records, leaving Rulesets, RulesetVersions, and Evaluations from previous runs. Next run created new Ruleset but tried to create RulesetVersion referencing it — worked for first run but FK errors accumulated from pollution.
- Fix: Cleanup now deletes all entities in dependency order
- Result: 20/20 pass (sequential)

### Phase 17 recovery
- Previous: Reported as having fatal FK error
- Actual: 50/50 pass (no FK error with proper env loading)
- Root cause of previous report: Likely run without `--env-file=.env.local` or database state issue
- Fix: N/A — already passing

## Error Category Definitions

| Category | Definition |
|---|---|
| Test failure | Assertion failed within a test |
| Test discovery failure | Test file couldn't be loaded/parsed |
| Setup failure | Test setup (beforeEach/before) failed |
| Environment failure | Required env var missing or incorrect |
| Fatal database error | Prisma/DB connection failure or FK violation |
| Framework skip | Test marked as skipped by framework |

## Command for Running All Tests

```bash
# Each suite independently with env file
npx tsx --env-file=.env.local --test tests/monitoring/*.test.ts
npx tsx --env-file=.env.local tests/monitoring/persistence.ts
npx tsx --env-file=.env.local tests/auth.test.ts
npx tsx --env-file=.env.local tests/mt5-accounts.test.ts
npx tsx --env-file=.env.local tests/products-and-rulesets.test.ts
npx tsx --env-file=.env.local tests/mt5-accounts.integration.test.ts
npx tsx --env-file=.env.local tests/e2e-workflow.test.ts
npx tsx --env-file=.env.local tests/phase16-audit.test.ts
npx tsx --env-file=.env.local tests/phase17-recovery.test.ts
```
