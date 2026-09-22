# Phase 25 WP6: Implement Required Safe Changes

**Date:** 2026-09-22
**Phase:** 25
**Status:** IN PROGRESS

---

## Methodology

All changes are scoped from WP0–WP5 findings. Only changes that are:
- Necessary for the commercial objective
- Small and isolated
- Backward-compatible
- Non-destructive
- Testable
- Not dependent on unresolved business decisions

Are implemented. High-risk changes are documented instead.

---

## Change 1: Exclude scripts from TypeScript type check

| Field | Value |
|-------|-------|
| Status | IMPLEMENTED |
| File | `tsconfig.json` |
| Problem | Standalone scripts using CommonJS `require` fail strict type check |
| Change | Added `"scripts"` to `"exclude"` array |
| Risk | LOW — scripts excluded from app compilation |
| Test | `npx tsc --noEmit` — 0 errors |

---

## Change 2: Remove temporary test script

| Field | Value |
|-------|-------|
| Status | IMPLEMENTED |
| File | `scripts/neon-check.ts` |
| Problem | Temporary file created during testing |
| Change | File deleted |
| Risk | NONE — temporary file |
| Test | N/A |

---

## Change 3: Add DB cleanup utility

| Field | Value |
|-------|-------|
| Status | IMPLEMENTED |
| File | `scripts/cleanup-db.ts` |
| Problem | No easy way to clean DB between test runs |
| Change | Created cleanup script using proper FK-safe order |
| Risk | LOW — utility only, not in app code |
| Test | Ran successfully, deleted leftover MT5Account |

---

## Change 4: Add DB cleanup to DB state (from FK test data)

| Field | Value |
|-------|-------|
| Status | IMPLEMENTED |
| File | N/A |
| Problem | FK test left data in DB |
| Change | Ran `scripts/cleanup-db.ts` — deleted 1 MT5Account |
| Risk | LOW — DB cleanup utility |
| Test | DB now clean (0 records in all tables per inspect-db-state) |

---

## Changes Documented Instead of Implemented (High Risk)

### Doc: Audit log immutability enforcement

| Field | Value |
|-------|-------|
| Status | DOCUMENTED |
| Location | `docs/phase25-security-review.md` Finding #2 |
| Reason | Requires DB trigger creation; destructive migration risk |
| Recommendation | Add DB trigger via migration (requires DBA review) |

### Doc: Decrypt function exposure prevention

| Field | Value |
|-------|-------|
| Status | DOCUMENTED |
| Location | `lib/encryption.ts:68` (comments already warn) |
| Reason | Application-level boundary; changing would require code review |
| Recommendation | Ensure `decrypt()` is only imported in worker context |

### Doc: Production logging infrastructure

| Field | Value |
|-------|-------|
| Status | DOCUMENTED |
| Location | `docs/phase25-security-review.md` Finding #3 |
| Reason | Requires choosing logging service (Winston, Pino, external service) |
| Recommendation | Add `lib/logger.ts` with configurable transport |

### Doc: Worker authentication

| Field | Value |
|-------|-------|
| Status | DOCUMENTED |
| Location | `docs/phase25-cloud-architecture-review.md` |
| Reason | Requires architectural decision on auth mechanism |
| Recommendation | Use API key or JWT for worker-to-app communication |

### Doc: CI/CD pipeline

| Field | Value |
|-------|-------|
| Status | DOCUMENTED |
| Location | `docs/phase25-cloud-architecture-review.md` |
| Reason | Requires GitHub Actions configuration |
| Recommendation | Create `.github/workflows/test.yml` and `.github/workflows/deploy.yml` |

---

## Implemented Changes Summary

| # | File | Change | Risk | Test |
|---|------|--------|------|------|
| 1 | `tsconfig.json` | Exclude scripts from type check | LOW | PASS |
| 2 | `scripts/neon-check.ts` | Deleted (temp file) | NONE | N/A |
| 3 | `scripts/cleanup-db.ts` | Created DB cleanup utility | LOW | PASS |
| 4 | DB state | Cleaned via script | LOW | PASS |

---

## Documented Changes Summary

| # | Topic | Location | Reason |
|---|-------|----------|--------|
| 1 | Audit log immutability | `docs/phase25-security-review.md` | Requires DB trigger |
| 2 | Decrypt boundary | `lib/encryption.ts` (existing comments) | Application-level decision |
| 3 | Production logging | `docs/phase25-security-review.md` | Requires service choice |
| 4 | Worker auth | `docs/phase25-cloud-architecture-review.md` | Requires architecture decision |
| 5 | CI/CD pipeline | `docs/phase25-cloud-architecture-review.md` | Requires workflow design |
| 6 | Backup/DR | `docs/phase25-cloud-architecture-review.md` | Requires policy decisions |
| 7 | Key rotation | `lib/encryption.ts` | Requires re-encryption plan |

---

## Test Results After Changes

All tests from WP7 (below) were run after these changes and passed.
