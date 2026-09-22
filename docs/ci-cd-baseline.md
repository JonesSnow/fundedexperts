# CI/CD Baseline

**Date:** 2026-09-22
**Phase:** 26
**WP:** 3
**Status:** COMPLETED

---

## 1. Overview

CI/CD baseline for the Funded Experts platform. The workflow validates static code quality, type safety, and database integration tests before code is merged to master.

**CI is NOT operational** — the workflow file is created but has not been executed in GitHub.

---

## 2. Workflow Location

`.github/workflows/ci.yml`

Three jobs:
1. **Static Validation** — TypeScript, ESLint, Prisma, build (every push/PR)
2. **Database Tests** — All DB test suites (PRs only, requires secrets)
3. **Monitoring Index Verification** — Partial index verification (PRs only)

---

## 3. Script Validation Strategy

`tsconfig.json` excludes `scripts/` from strict type checking because scripts use CommonJS `require()` syntax. Scripts are validated through:

| Method | Scope | Status |
|--------|-------|--------|
| ESLint override | `scripts/run-tests.js` only | PASS |
| Runtime execution | All scripts | PASS |
| Manual review | All scripts | PASS |

---

## 4. Required GitHub Secrets

See `.github/workflows/ci.yml` §3 for the full list. Key secrets:
- `TEST_DATABASE_URL` — Test database connection (NOT production)
- `TEST_JWT_SECRET` — Test JWT signing key
- `TEST_MT5_ENCRYPTION_KEY` — Test encryption key

---

## 5. Test Environment Protection

All database tests use `TEST_` prefixed environment variables. Production `DATABASE_URL` is never referenced in CI. Database cleanup runs before and after every test suite execution.

---

## 6. Next Steps

1. Push `.github/workflows/ci.yml` to repository
2. Create GitHub repository secrets (TEST_DATABASE_URL, TEST_JWT_SECRET, TEST_MT5_ENCRYPTION_KEY)
3. Open a PR to trigger first CI run
4. Verify all 3 jobs pass
5. Add branch protection rules (require CI pass before merge)
6. Implement Vercel deployment pipeline (future phase)
7. Implement AWS EC2 deployment pipeline for worker (future phase)
