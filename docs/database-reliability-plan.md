# Phase 26 WP4 — Database Reliability and Backup Plan

**Date:** 2026-09-22
**Phase:** 26
**WP:** 4
**Status:** Historical plan; current local setup is documented in
[`test-environment.md`](./test-environment.md).

Provider, deployment, and historical verification claims in this document are
not evidence of current live state. The local safety rules in §§1, 3, and 4
supersede earlier instructions below.

---

## 1. Migration Procedure

### 1.1 Current State

| Check | Result |
|-------|--------|
| Migration files exist | 14 checked-in migration directories |
| `migration_lock.toml` | YES — Prisma 6+ format |
| Migrations tracked in git | YES — 14 SQL files and the migration lock |
| Schema matches migrations | Static checks only; runtime schema diff is blocked until local PostgreSQL is available |
| Migration history reproducible | Not yet verified against a fresh local database |

### 1.2 Migration Files

| Migration | Purpose |
|-----------|---------|
| `20260920164647_init` | Initial schema and core enums/tables |
| `20260920164648_active_assignment_unique` | Assignment uniqueness |
| `20260920170000_evaluation_linking_enhancements` | Evaluation/account linking |
| `20260921130000_monitoring_persistence` | MonitoringJob, status enum, partial active-job index, MT5 monitoring fields |
| `20260921140238_monitoring_persistence` | Monitoring column/index type/name alignment |
| `20260922105355_add_order_model` | Orders and order items |
| `20260922111800_add_ledger_entry` | Ledger entries and relations |
| `20260922130000_funded_account_lifecycle` | Funded-account lifecycle states and evaluation relation |
| `20260922140000_audit_log_immutability` | Audit log protections |
| `20260923010524_phase20_business_readiness` | Notification, coupon, coupon usage, and verification fields |
| `20260924000000_email_delivery` | Email delivery enums, table, and indexes |
| `20260927000000_evaluation_starting_balance` | Evaluation starting-balance column and backfill |
| `20261013000000_product_domain_foundation` | Product publication fields, ProductStage, rule disposition, evaluation/order links |
| `20261014000000_evaluation_integrity` | Rule outcome state, event idempotency, funded-account evaluation uniqueness |

### 1.2.1 Static dependency notes

- The initial migration creates `Product`, `RulesetVersion`, `Rule`, and
  `Evaluation`; the order migrations create `Order` and `OrderItem` before the
  product-domain migration refers to `Order`.
- `20261013000000_product_domain_foundation` creates `ProductStage` and adds
  foreign keys to the earlier `Product` and `RulesetVersion` tables. It also
  links `Evaluation` to `ProductStage` and `Order`. This is the checked-in
  migration that first defines `ProductStage`; the repository does not prove
  whether it has been applied to any live database.
- The two monitoring migrations have similar names but distinct ordered
  purposes: the first creates `MonitoringJob` and its partial unique index;
  the second aligns column types, foreign-key definitions, and index names.
  Their overlap is not itself evidence of a duplicate migration.
- `20261014000000_evaluation_integrity` creates a unique index on nullable
  `FundedAccount.evaluationId`. An empty database has no duplicate rows, but
  application to a populated database could fail if non-null duplicates
  already exist. Live data was not inspected.
- A fresh-database application of all 14 migrations and a Prisma schema diff
  remain required. `prisma validate` checks the datamodel, not applied
  migration history or live database state.
- The static model/enum inventory finds migration `CREATE TABLE` operations
  for all 21 Prisma models and definitions for all 26 Prisma enums. The chain
  also creates six implicit relation tables not represented by standalone
  Prisma models. This is name-level evidence only, not a complete SQL
  semantics diff.

### 1.3 Standard Migration Procedure

```bash
# 1. Modify prisma/schema.prisma (add models, fields, relations)

# 2. Create migration only after independently verifying the local development target
pnpm exec prisma migrate dev --name <description>

# 3. Verify migration SQL (review generated SQL before applying)
Get-Content prisma/migrations/<timestamp>/migration.sql

# 4. Generate Prisma client
pnpm exec prisma generate

# 5. Run database-free tests
pnpm test:unit

# Database-backed tests are separate and require the verified local test target.
# See docs/test-environment.md before running `pnpm test:db`.

# 6. Commit migration file + schema change together
git add prisma/schema.prisma prisma/migrations/
```

### 1.4 Fresh local test-database verification

For an empty, independently verified local test database, use
`pnpm db:test:migrate`. It applies only checked-in migrations after the shared
test-target guard passes. Then run `pnpm db:test:diff` and
`pnpm exec tsx scripts/prisma-status.ts`. These commands are not authorized
for shared, staging, or production databases. Production migration procedures
are outside this local plan and are not established here.

---

## 2. Backup and Recovery Plan

### 2.1 Backup and recovery evidence

No current database provider, backup policy, retention window, point-in-time
recovery capability, or restore process has been verified for this project.
Do not rely on the historical Neon-specific statements previously in this
section. An authorized operator must establish and test the production backup
and recovery plan separately; that work is outside this local database
testing milestone.

Prisma Migrate does not provide automatic rollback. Review migration SQL and
use a separately verified disposable local database for fresh-chain
validation. Do not attempt a production rollback or restore from this document.

---

## 3. Test Isolation Strategy

### 3.1 Current Approach

| Mechanism | Implementation | Status |
|-----------|---------------|--------|
| Database-free default test command | `pnpm test:unit` | ENABLED |
| Database-backed entry point | `pnpm test:db` | BLOCKED until local target is verified and migrated |
| Guarded test migration | `pnpm db:test:migrate` | Applies checked-in migrations only after guard |
| Legacy resets (`test-reset.cjs`, `scripts/clean-db.js`) | Disabled, fail before Prisma | DISABLED |
| Guarded cleanup (`scripts/cleanup-db.ts`) | Requires test-target and separate cleanup confirmations | DESTRUCTIVE; use only intentionally |
| Transaction rollback | Not used | GAP |

### 3.2 Isolation status

| Mechanism | Current status |
|-----------|----------------|
| Per-run database or transaction rollback | Not implemented |
| Dedicated local test URL distinct from development | Required by current guard and `test-environment.md` |
| Database-backed CI | Not configured; CI is database-free |
| Parallel database test isolation | Not proven; do not enable |

### 3.3 Current Test Isolation Protocol

1. Keep database-backed testing disabled until the operator provisions and verifies
   a disposable local test database as described in `docs/test-environment.md`.
2. The operator must provide `TEST_DATABASE_URL`, set
   `TEST_DATABASE_DISPOSABLE=true`, and provide the exact confirmation value
   documented there. Host/name markers alone are not accepted as proof.
3. Apply checked-in migrations with `pnpm db:test:migrate` only after
   independently verifying the target, then check the schema/status and run
   database suites only with `pnpm test:db`.
4. Use `pnpm db:test:cleanup` only after re-verifying the target and providing
   the separate cleanup-only confirmation. The two legacy reset scripts are
   disabled.
5. Keep DB suites sequential until concurrency isolation is independently proven.

### 3.4 Concurrency Test Reliability

**Status:** NOT PROVEN SAFE

| Concern | Current status | Mitigation |
|---------|----------------|------------|
| Connection pool exhaustion | Not runtime-verified locally | Run tests sequentially |
| Race conditions on shared DB | Shared database testing is prohibited | Use only the verified disposable local target |
| Partial unique index | Migration defines the index; runtime test is blocked | Verify on the fresh local test database |
| Concurrent fixture writes | Not runtime-verified locally | Keep database test execution sequential |

**Conclusion:** Parallel database testing is not established as safe. Keep database suites sequential.

---

## 4. Environment Separation

### 4.1 Current Separation

| Environment | Database | Config | Data |
|-------------|----------|--------|------|
| Local development | Operator-owned local PostgreSQL database | `.env.local` | Development-only data |
| Local integration tests | Separate operator-owned disposable PostgreSQL database | `.env.test.local` | Re-creatable test data |
| CI | No database configured | GitHub Actions workflow | Database-free checks |
| Shared/staging/production | Outside local setup | Never use in database tests | No live state verified |

### 4.2 Separation Rules

1. Development and test databases must have distinct, independently verified identities.
2. Shared, staging, and production targets are never used for local tests.
3. CI has no database credentials and does not run cleanup or migrations.
4. Do not reset the development database as part of test setup.
5. All environments use the checked-in Prisma schema and migration chain.

---

## 5. Connection Management

The component and pooling observations below are historical source-level
notes, not current runtime measurements. No database connection was made.

### 5.1 Current Connection Pattern

| Component | Connection Method | Pool Size | Notes |
|-----------|-------------------|-----------|-------|
| API routes | PrismaClient per file | 1 per serverless instance | Neon serverless pooler manages pooling |
| Middleware | PrismaClient per file | 1 per request | Edge runtime |
| Monitoring worker | PrismaClient (single instance) | 1 per worker | Long-running process |
| Cleanup scripts | PrismaClient | 1 per script | Short-lived |
| Test files | PrismaClient | 1 per test file | Per-file instance |

### 5.2 Identified Issues

| Issue | Impact | Resolution |
|-------|--------|------------|
| PrismaClient instantiated per file | Multiple connections per serverless instance | Create shared singleton in `lib/db.ts` |
| No explicit connection pool config | Uses Prisma defaults | Add `datasources` config in schema |
| Connection leak in middleware | PrismaClient not disconnected | Add graceful shutdown handler |

### 5.3 Recommended Singleton

Create `lib/db.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Risk:** LOW — requires updating all existing PrismaClient instantiations across ~25 files.

---

## 6. Failure Recovery

The scenarios below are planning notes, not verified live failure behavior.

### 6.1 Database Unreachable (API Routes)

| Scenario | Current Behavior | Improved Behavior |
|----------|-----------------|-------------------|
| Neon connection timeout | 500 error after 20s | Retry with exponential backoff |
| Connection pool exhausted | 500 or timeout | Queue + retry |
| Prisma generate missing | Runtime error | Pre-build check |
| Schema mismatch | Runtime error | Prisma validate in CI |

### 6.2 Monitoring Worker Failure

| Scenario | Current Behavior | Improved Behavior |
|----------|-----------------|-------------------|
| Worker crash | Jobs stuck in RUNNING | `handleCrashRecovery()` exists; needs deployment |
| Worker restart | Jobs lost (in-memory) | Needs persistent queue (Redis/DB) |
| MT5 terminal unreachable | Job fails with timeout | Retry with backoff (implemented) |
| Worker slow | Jobs queue up | No scaling mechanism |

### 6.3 Recommended Improvements (Low Risk)

| Improvement | Description | Risk | Validation |
|-------------|-------------|------|------------|
| Add `lib/db.ts` singleton | Shared PrismaClient across files | LOW | Run existing test suite |
| Add `prisma format` to CI | Catch schema formatting issues | LOW | CI job |
| Add migration lint step | Validate migration SQL before apply | LOW | `prisma migrate diff` |
| Document rollback scripts | Add rollback SQL for each migration | NONE | Documentation |
| Add `TEST_DATABASE_URL` in CI | Separate test DB connection | LOW | CI job |
| Add health check endpoint | Verify DB connectivity | LOW | HTTP request |

---

## 7. Historical Migration Guidance

The following describes an earlier phase and is not a current product or
deployment instruction.

When Order, Payment, LedgerEntry, and other commercial models are added (WP1 design), the migration procedure will follow §1.3:

1. Add models to `prisma/schema.prisma`
2. `npx prisma migrate dev --name commercial-models`
3. Review generated SQL
4. Run existing test suite (validates no breakage)
5. Apply to staging, then production

All new models are additive (no modifications to existing tables), so rollback is straightforward.

---

## 8. Open Risks

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Migration rollback not tested | HIGH | UNKNOWN | Production recovery process requires separate authorized verification |
| 2 | Connection-pool behavior | MEDIUM | UNKNOWN | Requires local/production runtime observation |
| 3 | Concurrent test execution | HIGH | NOT PROVEN | Keep database suites sequential |
| 4 | Historical Neon pooler observations | MEDIUM | UNVERIFIED | No current provider or pooler status established |
| 5 | Migration drift | MEDIUM | UNKNOWN | `prisma validate` is not a live schema diff; use guarded local procedure |
| 6 | Automated backup verification | MEDIUM | UNKNOWN | Establish separately with the authorized database operator |
| 7 | Migration lock integrity | LOW | STATICALLY TRACKED | Lock file is checked in; live migration status is unknown |
| 8 | Development/test migration target confusion | MEDIUM | MITIGATED IN DOCS | Keep test migrations on the guarded commands in `test-environment.md` |

---

## 9. Validation Results

The table below is the current milestone status, not the historical results
recorded in earlier versions of this plan.

| Check | Current result |
|-------|----------------|
| PostgreSQL installation/service/utilities | BLOCKED — none found locally |
| Prisma Client generation | PASS — generated with Prisma 6.19.3; no database connection |
| Prisma schema validation | PASS — `prisma validate`; non-routable placeholder URL; no database connection |
| Database-free unit and safety tests | PASS — `pnpm test:unit`, 27/27 suites; includes subprocess safety tests |
| TypeScript | PASS — `pnpm exec tsc --noEmit --incremental false` |
| Scoped ESLint | PASS — `pnpm lint`; 0 errors, 94 unused-variable warnings |
| Migration static checks | PASS — model/enum name coverage and ProductStage dependency tests |
| CI workflow structure | PASS — dependency-free structural check; not a complete YAML/GitHub Actions parser |
| Patch integrity | PASS — `git diff --check` |
| Empty-database migration deployment | BLOCKED — requires provisioned and independently verified local disposable database |
| Schema diff and migration status against PostgreSQL | BLOCKED — same prerequisite |
| Database-backed tests and cleanup | BLOCKED — same prerequisite |
| Provider backups, pooling, and live database state | NOT VERIFIED — outside local static check |
| Parallel database test execution | NOT PROVEN SAFE |

---

## 10. Status Summary

| Deliverable | Current status | Notes |
|-------------|-----------------|-------|
| Local migration and test procedure | DOCUMENTED | See §§1, 3, and `test-environment.md` |
| Provider backup/recovery evidence | NOT VERIFIED | Historical provider claims are not current evidence |
| Test isolation | GUARDED, NOT RUNTIME-VERIFIED | Requires separate local disposable database |
| Environment separation | DOCUMENTED | Local dev/test targets are distinct |
| Live connection management | NOT VERIFIED | Requires runtime instrumentation |
| Fresh database migration chain | BLOCKED | Requires installed PostgreSQL and verified target |
| Concurrent test reliability | NOT PROVEN | Keep tests sequential |