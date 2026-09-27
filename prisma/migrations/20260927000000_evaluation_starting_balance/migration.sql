-- Migration: Add startingBalance to Evaluation model
-- Generated for Phase 29: Financial metric hardening
-- Reviewed: No destructive statements, no credential fields, safe for existing data

-- 1. Add startingBalance column (nullable - no data loss for existing rows)
ALTER TABLE "Evaluation" ADD COLUMN "startingBalance" DECIMAL(18, 2);

-- 2. Backfill startingBalance from MT5Account.accountSize for existing evaluations
--    This populates the historical starting balance so drawdown calculations are reproducible
UPDATE "Evaluation" e
SET "startingBalance" = a."accountSize"
FROM "MT5Account" a
WHERE e."accountId" = a."id"
  AND e."startingBalance" IS NULL
  AND a."accountSize" IS NOT NULL;

-- Migration safety checklist:
-- [x] No DROP TABLE or DROP COLUMN statements
-- [x] No DELETE or TRUNCATE statements
-- [x] New column is NULLABLE (safe for existing data)
-- [x] Backfill uses safe UPDATE with WHERE clause (idempotent)
-- [x] No credential fields stored
-- [x] Foreign key references preserved
