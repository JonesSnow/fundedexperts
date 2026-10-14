ALTER TYPE "RuleType" ADD VALUE IF NOT EXISTS 'MIN_TRADING_DAYS';

CREATE TYPE "RuleOutcomeState" AS ENUM ('PASS', 'FAIL', 'INCOMPLETE', 'PENDING', 'STALE', 'UNAVAILABLE');

ALTER TABLE "RuleEvaluation"
  ADD COLUMN "state" "RuleOutcomeState" NOT NULL DEFAULT 'UNAVAILABLE',
  ADD COLUMN "sourceDataTimestamp" TIMESTAMPTZ;

ALTER TABLE "RuleEvent"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "RuleEvent_idempotencyKey_key"
  ON "RuleEvent"("idempotencyKey");

CREATE UNIQUE INDEX "FundedAccount_evaluationId_key"
  ON "FundedAccount"("evaluationId");
