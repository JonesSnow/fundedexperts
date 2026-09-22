-- Migration: MonitoringJob model + MT5Account monitoring fields
-- Generated for Phase 21B
-- Reviewed: No destructive statements, no credential fields, safe for production-like data

-- 0. Create JobStatus enum (required before table creation)
DO $$ BEGIN
    CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Create MonitoringJob table
CREATE TABLE "MonitoringJob" (
    "id" VARCHAR(255) NOT NULL,
    "jobId" VARCHAR(255) NOT NULL,
    "accountId" VARCHAR(255) NOT NULL,
    "workerId" VARCHAR(255),
    "status" "JobStatus" NOT NULL DEFAULT E'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" VARCHAR(255),
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "leaseExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonitoringJob_pkey" PRIMARY KEY ("id")
);

-- 2. Add unique constraint on jobId
CREATE UNIQUE INDEX "MonitoringJob_jobId_unique" ON "MonitoringJob" ("jobId");

-- 3. Add foreign key to MT5Account with cascade delete
ALTER TABLE "MonitoringJob" ADD CONSTRAINT "MonitoringJob_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Indexes for query performance
CREATE INDEX "MonitoringJob_accountId_status_index" ON "MonitoringJob" ("accountId", "status");
CREATE INDEX "MonitoringJob_status_leaseExpiry_index" ON "MonitoringJob" ("status", "leaseExpiry");
CREATE INDEX "MonitoringJob_workerId_index" ON "MonitoringJob" ("workerId");

-- 5. Partial unique index for active-job idempotency (one PENDING/RUNNING job per account)
-- PostgreSQL supports partial indexes directly; Prisma schema does not yet support them natively.
-- This index prevents duplicate active jobs per account at the database level.
CREATE UNIQUE INDEX "MonitoringJob_active_job_per_account" 
    ON "MonitoringJob" ("accountId") 
    WHERE "status" IN ('PENDING', 'RUNNING');

-- 6. Add monitoring fields to MT5Account (nullable - no data loss risk)
ALTER TABLE "MT5Account" ADD COLUMN "lastMonitoringAt" TIMESTAMP(3);
ALTER TABLE "MT5Account" ADD COLUMN "currentMonitoringStatus" VARCHAR(255);
ALTER TABLE "MT5Account" ADD COLUMN "currentMonitoringResult" VARCHAR(255);

-- Migration safety checklist:
-- [x] No DROP TABLE or DROP COLUMN statements
-- [x] No DELETE or TRUNCATE statements
-- [x] All new columns are NULLABLE (safe for existing data)
-- [x] Foreign key has ON DELETE CASCADE for data integrity
-- [x] No credential fields stored
-- [x] Partial index uses documented WHERE clause
-- [x] All indexes serve documented query patterns
-- [x] Enum values match Prisma schema JobStatus enum
