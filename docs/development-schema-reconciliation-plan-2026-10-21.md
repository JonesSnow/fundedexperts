# Development Schema Reconciliation Plan

**Date:** 2026-10-21
**Status:** Code-side forward migration and fail-closed execution check prepared; database reconciliation remains blocked pending disposable replay and current database availability.

## Safety boundary

This plan covers the isolated development target only. The development database passed the repository guard and its canonical identity differed from the configured production reference. No production connection was made. The Neon dashboard was reported to show a separate schema-only branch, but its branch ID and parent lineage have not been independently verified through Neon control-plane metadata.

No migration, seed, reset, cleanup, or database write was performed. Do not run `pnpm db:dev:migrate -- --apply` against the current target: the migration ledger is empty while the application schema already exists.

## Verified state and limits

- The last successful read-only inspection found 28 public tables including `_prisma_migrations`; all application tables were empty and the migration ledger had zero rows.
- `ProductStage` and the other product-domain objects exist.
- Before the new local migration was added, guarded `prisma migrate status` found 14 migrations and listed all 14 as pending.
- A guarded schema diff found that `Evaluation.productId` and its foreign key were missing, while `RuleEvaluation.sourceDataTimestamp` was stored as `TIMESTAMPTZ` and the Prisma model requested the default `TIMESTAMP(3)`.
- `EmailDelivery_idempotencyKey_key` was a full unique index in the database; migration 11 creates a partial unique index. Both permit multiple null keys and enforce uniqueness for non-null keys, but their physical definitions differ.
- The database objects' origin cannot be established from the available migration ledger. `db push`, manual SQL, restore, and other tools remain possible explanations; none is proven.
- After the code-side migration was added, a guarded read-only schema comparison could not reconnect (Prisma `P1001`). Therefore the updated database diff and migration status are unverified. The repository now contains 15 migration directories; 15 pending is expected but not confirmed.
- No local PostgreSQL client/server or container command was found. The existing test-environment documentation also records that no disposable local database is provisioned.

## Migration-by-migration plan

All existing migrations are pending in the ledger. The observed effects below are based on the latest successful read-only inspection; they do not mean Prisma recorded those migrations as applied.

| Migration | Intended effect and observed state | Risk on the existing schema | Proposed handling |
|---|---|---|---|
| `20260920164647_init` | Creates the base enums, core tables, indexes, foreign keys, and audit join tables. Those objects are present. | Starts with `CREATE TYPE "Role"`; an existing type can make it fail immediately. Other statements are also non-idempotent and can partially apply. | Never replay on this database. Baseline only after a clean replay and a complete comparison prove the cumulative schema. |
| `20260920164648_active_assignment_unique` | Adds the partial unique index for assigned accounts. The index is present. | Duplicate index creation fails; unique creation can fail if conflicting assignment rows exist. | Verify its exact predicate on scratch and target before baselining. |
| `20260920170000_evaluation_linking_enhancements` | Adds evaluation-link and recovery values to `AuditAction`. The values are present. | Re-adding enum labels can fail; enum changes are not a convenient rollback. | Preserve the historical migration and confirm all labels before baselining. |
| `20260921130000_monitoring_persistence` | Creates `JobStatus`, `MonitoringJob`, account monitoring fields, indexes, and an active-job partial unique index. Those objects are present. | The table, columns, and indexes are not idempotent; only enum creation handles duplicates. | Replay only on a clean scratch database; retain and verify the partial index. |
| `20260921140238_monitoring_persistence` | Converts monitoring columns to `TEXT`, rebuilds a primary key and foreign key, and renames indexes. The aligned objects are present. | Drops constraints before recreating them; a partial failure can leave integrity constraints missing. | Verify the whole ordered pair on scratch. Do not replay against the existing schema. |
| `20260922105355_add_order_model` | Creates order enums, `Order`, `OrderItem`, indexes, and relations. Those objects are present. | Duplicate type/table/index creation fails; dropping these later could lose records. | Preserve and validate on scratch. |
| `20260922111800_add_ledger_entry` | Creates ledger enums, `LedgerEntry`, indexes, and relations. Those objects are present. | Duplicate creation fails; removing the table would risk financial records. | Preserve and validate on scratch. |
| `20260922130000_funded_account_lifecycle` | Extends funded-account statuses and adds `evaluationId`, an index, and relation. The field and relation exist; later migrations intentionally change the index. | Duplicate enum values, column, index, or constraint can fail. | Compare the final cumulative state, not this migration in isolation. |
| `20260922140000_audit_log_immutability` | Creates/replaces the immutability function and creates its trigger. The trigger is present and enabled. | Duplicate trigger creation fails after the function has already been replaced. | Verify the function body and trigger state; do not replay. |
| `20260923010524_phase20_business_readiness` | Changes the funded-account default, removes the earlier evaluation index, adds verification fields, and creates notification/coupon tables. Those final objects are present. | Assumes prior index state; the index drop and later additions are not idempotent. | Verify both the intended index removal and the added objects before baseline. |
| `20260924000000_email_delivery` | Creates email-delivery enums/table, indexes, and relation. The table exists. Its idempotency index differs physically from the migration definition. | Duplicate creation fails. The full-versus-partial index difference needs fresh-chain comparison. | Keep the original migration unchanged. Decide on a forward alignment only if scratch comparison shows a meaningful incompatibility. |
| `20260927000000_evaluation_starting_balance` | Adds nullable `startingBalance` and backfills from MT5 account size. The column exists; the verified tables were empty. | Re-adding the column fails. Skipping the backfill is unsafe if qualifying rows exist. | Reconfirm emptiness before baseline and validate the backfill on scratch. |
| `20261013000000_product_domain_foundation` | Adds product enums/fields, `ProductStage`, relations/indexes, rule metadata/backfill, order snapshots, and evaluation stage/order links. Those objects are present. | Non-idempotent type/table/column/index creation; it also backfills rule disposition. | Preserve and verify every effect and backfill assumption on scratch. |
| `20261014000000_evaluation_integrity` | Adds rule-outcome state, `sourceDataTimestamp`, rule-event idempotency, and a unique funded-evaluation index. Those objects are present. Its timestamp type matches the migration, not the former Prisma model. | Duplicate type/column/index creation fails. | Preserve the migration's timezone-aware storage semantics and align the Prisma model. |
| `20261021000000_evaluation_product_link` | Newly added forward migration: nullable `Evaluation.productId` and its optional relation to `Product`. Not yet applied or validated against PostgreSQL. | Additive and nullable; it does not infer product attribution or alter existing rows. It still needs clean-chain execution and FK validation. | Apply only after the complete chain and this migration pass on the disposable scratch database, then after the target is reverified. |

The existing migration SQL contains no `DROP TABLE`, `DROP COLUMN`, `DELETE`, or `TRUNCATE`. It does contain constraint/index drops, a primary-key rebuild, and two data updates: the starting-balance backfill and rule-disposition backfill. Those still require ordered validation. The two backfills affected no rows in the last verified empty database snapshot.

## Code-side reconciliation prepared

- `RuleEvaluation.sourceDataTimestamp` now uses `@db.Timestamptz(6)`, matching the existing migration's timezone-aware PostgreSQL type. This avoids a schema-driven conversion to `TIMESTAMP(3)`.
- The new migration adds only nullable `Evaluation.productId` and a foreign key with `ON DELETE SET NULL ON UPDATE CASCADE`. No backfill is attempted because an evaluation's product cannot be inferred safely from the available relation data.
- The guarded development migration command now connects only in `--apply` mode, verifies the connected database name/schema/port, and checks migration-ledger state before starting Prisma Migrate. It blocks if application tables exist without successful migration history or if an incomplete migration is recorded. Its default preflight mode still does not connect. The guard has not been exercised against the live target because the latest read-only connection attempt returned `P1001`.
- The migration CLI invocation now runs through a small tested boundary that cannot invoke Prisma Migrate when connected-target verification rejects or cannot inspect the target.
- The original 14 migration files were not edited.
- The email index difference is intentionally unresolved pending a clean replay. Do not alter or replace that index based on assumption.
- A guarded, idempotent non-public development catalog fixture command is prepared in `scripts/seed-development-catalog.ts`. It contains no account size, price, denomination, evaluation structure, or rule values; it remains draft/inactive and uses an E2E ruleset marker. The command requires an explicit `--apply`, validates the connected target and exact successful migration chain before its transaction, and refuses to adopt fixture identifiers if they have become public or contain commercial terms. It has not been run because the Neon target is currently unreachable and its recovery path is unverified.

## Validation required before any database write

1. Confirm the Neon development branch ID, parent, and recovery/restore procedure in Neon control-plane metadata. The URL identity guard alone does not prove branch lineage or recoverability.
2. Provision a separate disposable PostgreSQL database under local operator control. The current test guard requires a loopback target and explicit disposable confirmation; a remote Neon development database is not accepted as the disposable test target.
3. Configure only the guarded test settings in `.env.test.local` and independently verify the database identity and ownership. Do not place production or development URLs in that file.
4. Apply the checked-in chain to the empty scratch target with `pnpm db:test:migrate`. Then run `pnpm exec tsx scripts/prisma-status.ts` and `pnpm db:test:diff`. Verify the partial indexes, trigger, enum labels, foreign keys, and backfills. Do not run database-backed tests until status and schema comparison are clean.
5. If the fresh chain exposes migration/schema incompatibility, repair it with a new forward migration; do not rewrite original migration history or use `migrate reset`.
6. Reinspect the development target read-only after it is reachable. Compare all tables, columns, native types, defaults, indexes, constraints, enum labels, triggers, and migration ledger against the validated post-migration-14 scratch state.
7. Only if that comparison proves the existing schema is the cumulative state of migrations 1–14, add a development-only guarded baseline operation that records those 14 migrations as applied in chronological order. The repository currently has no guarded development `migrate resolve` helper; do not run raw Prisma `migrate resolve` commands.
8. After baselining only the proven 14 migrations, apply migration 15 with `pnpm db:dev:migrate -- --apply`. Verify status and schema through a development-guarded read-only helper. The current status/diff helpers are test-target-only and should not be pointed at development by changing their guard.
9. Seed only clearly identified non-public fixtures after schema verification. Keep test products/rules unpublished and never use unapproved prices, sizes, targets, drawdown limits, splits, or payout terms.

## Recovery and rollback

No verified Neon restore process is currently documented. Before the baseline write, establish a branch snapshot or tested restore point. Do not delete migration-history rows as a rollback. Treat migrations as forward-only; do not drop tables, truncate data, or reset the branch. The new nullable relation is additive, but a future populated `productId` would make dropping the column data-destructive.

## Checks performed

- `pnpm db:dev:migrate`: guard passed again; preflight mode made no connection or migration.
- Guarded read-only migration status before migration 15 was added: 14 of 14 migrations were listed as pending.
- Guarded read-only schema diff before the schema annotation change: missing `Evaluation.productId` column/FK and a timestamp conversion to `TIMESTAMP(3)` were reported.
- After the local schema/migration change, the guarded live diff could not reconnect (`P1001`). No database write occurred.
- Prisma schema validation with a loopback placeholder URL: passed without a database connection.
- `tests/migration-chain-static.test.ts`: 5/5 passed after adding a regression check for migration 15 and the timestamp annotation.
- `tests/development-migration-command.unit.test.ts`: 8/8 passed, including mismatched connected identity, existing tables with an empty ledger, and incomplete migration history.
- `pnpm test:unit`: 74/74 database-free suites passed after adding explicit connection/identity-verification failure coverage.
- Focused migration and safety tests: 25/25 passed, including connection/identity-verification failure blocking the Prisma CLI callback, no broad destructive operations across the checked-in migration chain, and an explicit inventory of the two row backfills.
- Development catalog seed preflight and fixture tests: 4/4 passed using in-memory fixtures and static command checks only; no Prisma client or database was created.
- TypeScript (`pnpm exec tsc --noEmit --incremental false`): passed after the guarded execution change.
- Targeted ESLint (`pnpm exec eslint lib/development-migration-execution.ts scripts/run-development-migration.ts lib/development-migration-preflight.ts lib/development-migration-plan.ts tests/development-migration-command.unit.test.ts tests/migration-chain-static.test.ts tests/test-db-safety.test.ts`): passed.
- Prisma schema validation: passed with a temporary loopback placeholder URL; no database connection was made.
- Local PostgreSQL/Docker/Podman/Neon CLI commands were unavailable, and no listener was detected on local PostgreSQL ports 5432/5433. The Windows service-manager query was denied by the current account.
- Local browser inspection is unavailable because browser use is disabled in Work settings. No Neon control-plane branch/parent verification was possible through the available tools.
- A direct trailing-whitespace scan of all eight task files: clean.
- Git status/diff inspection remains blocked by the repository's dubious-ownership safeguard; no Git settings or ownership were changed.

## Current stop condition

Do not baseline or migrate the development branch yet. The latest live connection attempt failed, no disposable PostgreSQL target is available, and Neon branch lineage/recovery evidence is incomplete. These are the exact prerequisites to clear before Phase B can be completed and any database mutation considered.
