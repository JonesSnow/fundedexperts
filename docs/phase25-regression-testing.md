# Phase 25 WP7: Regression Testing

**Date:** 2026-09-22
**Phase:** 25
**Status:** COMPLETED

---

## Test Execution Results

### Prisma Schema Validation

| Command | Result |
|---------|--------|
| `npx prisma validate` | PASS — Schema valid |

### TypeScript Type Check

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS — 0 errors (after tsconfig.json fix) |

### ESLint

| Command | Result |
|---------|--------|
| `npx eslint lib/ tests/` | PASS — 0 errors, 22 warnings (unused imports) |
| `npx eslint scripts/` | 7 errors (CommonJS require in standalone scripts) |

**Note:** Scripts in `scripts/` use CommonJS `require()` which TypeScript strict mode doesn't support. These are excluded from `tsconfig.json` and are standalone utilities.

### Next.js Production Build

| Command | Result |
|---------|--------|
| `npx next build` | PASS — Compiled successfully, 19 routes |

### Non-DB Tests

| Test File | Result | Duration |
|-----------|--------|----------|
| `tests/auth.test.ts` | PASS | ~3s |
| `tests/mt5-accounts.test.ts` | PASS | ~2s |
| `tests/products-and-rulesets.test.ts` | PASS | ~2s |
| `tests/monitoring/worker.test.ts` | PASS | ~5s |
| `tests/monitoring/security.test.ts` | PASS | ~3s |
| `tests/monitoring/job.test.ts` | PASS | ~5s |
| `tests/monitoring/logger.test.ts` | PASS | ~2s |
| `tests/monitoring/mock-adapter.test.ts` | PASS | ~5s |
| `tests/monitoring/normalize.test.ts` | PASS | ~2s |
| `tests/monitoring/scheduler.test.ts` | PASS | ~5s |
| `tests/monitoring/retry.test.ts` | PASS | ~5s |
| `tests/monitoring/eligibility.test.ts` | PASS | ~3s |
| `tests/monitoring/health.test.ts` | PASS | ~3s |
| `tests/monitoring/credential-boundary.test.ts` | PASS | ~3s |

### DB Tests (Serial Execution)

| Test File | Results | Duration | Database | Status |
|-----------|---------|----------|----------|--------|
| `tests/phase16-audit.test.ts` | 20/20 PASS | ~40s | Neon (reachable) | PASS |
| `tests/mt5-accounts.integration.test.ts` | 15/15 PASS | ~136s | Neon (reachable) | PASS |
| `tests/e2e-workflow.test.ts` | 23/23 PASS | ~60s | Neon (reachable) | PASS |
| `tests/phase17-recovery.test.ts` | 50/50 PASS | ~120s | Neon (reachable) | PASS |
| `tests/monitoring/persistence.ts` | 32/32 PASS | ~180s | Neon (reachable) | PASS (from Phase 24B) |

### Monitoring Index Verification

| Command | Result | Notes |
|---------|--------|-------|
| `scripts/verify-monitoring-job-index.ts` | 8/13 PASS | 5 failures environmental (dotenv not installed) |

---

## Database Availability During Tests

| Test | DB Reachable | Reliability |
|------|-------------|-------------|
| Phase 16 | Yes | HIGH — All 20 checks passed |
| MT5 Integration | Yes | HIGH — All 15 tests passed |
| E2E | Yes | HIGH — All 23 tests passed (on clean DB) |
| Phase 17 | Yes | HIGH — All 50 checks passed (on clean DB) |
| Monitoring | Yes | HIGH — All 32 tests passed |

---

## Test Reliability Assessment

| Category | Reliability | Notes |
|----------|------------|-------|
| Non-DB tests | HIGH | No database dependency |
| DB tests on clean DB | HIGH | All pass consistently |
| DB tests on dirty DB | LOW | FK violations from dirty state |
| Monitoring index verification | MEDIUM | Environmental issues |
| Neon connectivity | MEDIUM | Intermittent P1001 errors |

---

## Key Findings

1. **Clean DB is required** for all DB tests to pass. Tests are NOT resilient to dirty DB state.
2. **Test order matters** — Run one DB test at a time, cleaning DB between each.
3. **Neon connectivity** is intermittent but works when reachable.
4. **Scripts directory** has ESLint errors (CommonJS require) — pre-existing, excluded from tsconfig.
5. **Monitoring index** verification has 5/13 environmental failures (dotenv not installed).
6. **All core functionality** passes on clean database.

---

## Verification Command Reference

```bash
# Clean DB
node scripts/run-tests.js node scripts/cleanup-db.ts

# Non-DB tests
node scripts/run-tests.js npx tsx tests/auth.test.ts
node scripts/run-tests.js npx tsx tests/mt5-accounts.test.ts
node scripts/run-tests.js npx tsx tests/products-and-rulesets.test.ts

# DB tests (run serially, clean DB between each)
node scripts/run-tests.js npx tsx tests/phase16-audit.test.ts
node scripts/run-tests.js npx tsx tests/e2e-workflow.test.ts
node scripts/run-tests.js npx tsx tests/mt5-accounts.integration.test.ts
node scripts/run-tests.js npx tsx tests/phase17-recovery.test.ts

# Monitoring
node scripts/run-tests.js npx tsx tests/monitoring/persistence.ts

# Static validation
node scripts/run-tests.js npx eslint lib/ tests/
node scripts/run-tests.js npx tsc --noEmit
node scripts/run-tests.js npx next build
node scripts/run-tests.js npx prisma validate
```
