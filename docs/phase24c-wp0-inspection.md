# Phase 24C WP0: Inspection Findings

**Date:** 2026-09-21
**Phase:** 24C
**WP0 Status:** COMPLETED

---

## Files Reviewed

- `docs/phase24b-report.md` — Phase 24B results and known issues
- `prisma/schema.prisma` — Full schema with all models, relations, enums
- `lib/cleanup-helper.ts` — Shared cleanup infrastructure
- `scripts/run-tests.js` — Test runner wrapper with env loading
- `tests/mt5-accounts.integration.test.ts` — Integration test (15 tests, 3 failures)
- `tests/phase16-audit.test.ts` — Audit test (FATAL on first DB operation)
- `tests/phase17-recovery.test.ts` — Recovery test (FATAL on first DB operation)
- `tests/e2e-workflow.test.ts` — E2E test (9/11 pass, 2 DB failures)
- `tests/monitoring/persistence.ts` — Monitoring persistence (27/32 pass, 5 failures)
- All 12 monitoring test files
- All non-DB test files (passing)

---

## Identified Failure Causes

### 1. Foreign-Key Constraint Failures (CRITICAL)

**Evidence:**
- `mt5-accounts.integration.test.ts`: First test fails at `rulesetVersion.create` with `RulesetVersion_rulesetId_fkey` violation, then at `evaluation.create` with `Evaluation_traderId_fkey` violation
- `phase16-audit.test.ts`: FATAL at `evaluation.create` with `Evaluation_traderId_fkey` violation
- `phase17-recovery.test.ts`: FATAL at `evaluation.create` with `Evaluation_traderId_fkey` violation

**Suspected Causes (confidence level):**

| Cause | Confidence | Evidence |
|-------|------------|----------|
| Database has orphaned records from prior incomplete runs | HIGH | FK violations at CREATE time suggest parent records missing or conflicting; initial cleanup reports success but data state inconsistent |
| Prisma migration schema doesn't match code expectations | MEDIUM | Schema uses `@default(uuid())` for all IDs; tests use `Date.now().toString(36)` for RUN_ID; mismatch could cause unexpected ID formats |
| Connection pool state after `assertCleanup` in before hook | MEDIUM | Cleanup creates a new PrismaClient in `before`, then test uses same client; possible transaction isolation issue |
| Cleanup order doesn't match actual FK dependency chain | LOW | Cleanup order (ruleEvaluation→monitoringJob→accountAssignment→evaluation→rule→rulesetVersion→ruleset→product→mT5Account→trader→auditLog) appears correct for FK safety |

**Key Observation:** All FK violations occur at CREATE time, not DELETE time. The initial cleanup reports "All N operations succeeded" but subsequent test data creation fails. This suggests the cleanup deletes records but leaves behind:
- Orphaned records in tables not covered by cleanup
- Sequence/counter values that conflict with new records
- Or records in a state where FK checks fail despite deletion

### 2. Neon Connectivity Failures

**Evidence (Phase 24B):**
- P1001 connection errors during some test windows
- Prisma validate and migrate now PASS (Neon reachable as of this session)

**Suspected Cause:** Infrastructure-level intermittent connectivity, not code-related.

### 3. Monitoring Persistence Failures (5 failures)

**Evidence:**
- `should enforce unique jobId constraint` — `MonitoringJob_accountId_fkey` violation
- `should allow new job after FAILED job` — `No record found for update` (P2025)
- `should store no credential fields in MonitoringJob` — `MonitoringJob_accountId_fkey` violation
- `should reject claim by another worker` — Assertion failure (claim2.claimed=true when expected false)
- `unexpired running job should NOT be recovered` — `claim.job` is null (job not found)

**Suspected Causes:**

| Test | Cause | Confidence |
|------|-------|------------|
| unique jobId constraint | FK violation: TEST_ACCOUNT_ID doesn't exist when creating job; `createTestAccount` upsert may fail silently | HIGH |
| new job after FAILED | Job record missing after `failJob` — possible race or transaction issue | MEDIUM |
| credential fields | Same as unique jobId — account doesn't exist | HIGH |
| claim by another worker | Job state differs from expected — first claim succeeded when second expected to fail | MEDIUM |
| stale job recovery | Job not found after claim — possible data inconsistency | MEDIUM |

### 4. Cleanup Failure Visibility

**Evidence:**
- `runCleanupSteps` continues on failure and tracks results (correct behavior)
- `assertCleanup` throws on failure (correct behavior)
- `process.exit(1)` or `process.exitCode=1` on cleanup failure (correct behavior)
- All cleanup paths verified to produce non-zero exit (WP1 verified in Phase 24B)

### 5. Test Isolation

**Evidence:**
- Each test file uses `TEST_PREFIX` + `RUN_ID` for unique identifiers
- No shared IDs between test files (verified)
- `assertCleanup` in initial/final cleanup in all DB test files
- **Gap:** `phase17-recovery.test.ts` had mid-test cleanups without `assertCleanup` (FIXED this phase)
- **Gap:** `mt5-accounts.integration.test.ts` `before` hook lacked `assertCleanup` (FIXED this phase)

---

## Prisma Schema FK Dependency Analysis

### FK Relationships (no cascade except MonitoringJob)

| Model | FK Field | References | OnDelete |
|-------|----------|------------|----------|
| RulesetVersion | rulesetId | Ruleset.id | NONE |
| Rule | rulesetVersionId | RulesetVersion.id | NONE |
| RuleEvaluation | evaluationId | Evaluation.id | NONE |
| RuleEvaluation | ruleId | Rule.id | NONE |
| Evaluation | traderId | Trader.id | NONE |
| Evaluation | rulesetVersionId | RulesetVersion.id | NONE |
| Evaluation | accountId | MT5Account.id | NONE |
| FundedAccount | traderId | Trader.id | NONE |
| FundedAccount | accountId | MT5Account.id | NONE |
| FundedAccount | rulesetVersionId | RulesetVersion.id | NONE |
| AccountAssignment | traderId | Trader.id | NONE |
| AccountAssignment | accountId | MT5Account.id | NONE |
| MonitoringJob | accountId | MT3Account.id | CASCADE |
| RuleEvent | accountId | MT5Account.id | NONE |
| AuditLog | (no FK to other models) | — | — |

### Correct Cleanup Order (leaf to root)

1. `ruleEvaluation` — depends on Evaluation, Rule
2. `monitoringJob` — depends on MT5Account (CASCADE)
3. `accountAssignment` — depends on Trader, MT5Account
4. `evaluation` — depends on Trader, RulesetVersion
5. `rule` — depends on RulesetVersion
6. `rulesetVersion` — depends on Ruleset
7. `ruleset` — top-level
8. `product` — depends on Ruleset (optional)
9. `ruleEvent` — depends on MT5Account
10. `mT5Account` — top-level
11. `trader` — top-level (but has children)
12. `auditLog` — no FK dependencies on other models

### Current Cleanup Order (all test files)

All DB test files use the same order:
`ruleEvaluation → monitoringJob → accountAssignment → evaluation → rule → rulesetVersion → ruleset → product → mT5Account → trader → auditLog`

**This order is CORRECT** — child records are deleted before parents.

---

## WP0 Checkpoint

**Primary suspected cause of FK failures:** Database state inconsistency from prior incomplete test runs. The initial cleanup deletes all records in correct order but the DB may contain records not covered by the cleanup (e.g., from schema changes, manual data, or migration artifacts). When tests create new records, FK checks fail because parent records are unexpectedly missing or conflicting.

**Secondary suspected cause:** The monitoring persistence tests fail because the `MonitoringJob` partial unique index + FK constraint combination creates complex state dependencies that are harder to manage in test cleanup.

**Recommend for WP1:** Inspect the actual DB state using safe Prisma queries (read-only) to determine what records exist after a failed test run. This will confirm whether orphaned records, missing parents, or sequence conflicts are the root cause.
