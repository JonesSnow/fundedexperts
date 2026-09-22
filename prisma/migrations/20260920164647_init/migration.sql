-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TRADER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TraderStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('IN_PROGRESS', 'PASSED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "FundedAccountStatus" AS ENUM ('ACTIVE', 'CLOSED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AccountAssignmentStatus" AS ENUM ('ASSIGNED', 'RETURNED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MT5AccountPurpose" AS ENUM ('EVALUATION', 'FUNDED', 'OTHER');

-- CreateEnum
CREATE TYPE "MT5HealthStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('PROFIT_TARGET', 'DRAWDOWN_LIMIT', 'TRADING_HOURS', 'MIN_TRADES', 'MAX_DAILY_LOSS', 'MAX_OPEN_TRADES', 'MAX_LEVERAGE', 'TRADING_SESSION');

-- CreateEnum
CREATE TYPE "RulesetVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('EVALUATION_STARTED', 'EVALUATION_COMPLETED', 'EVALUATION_FAILED', 'RULE_CHANGED', 'RULE_VERSION_CREATED', 'RULE_CREATED', 'RULE_UPDATED', 'RULE_DELETED', 'TRADER_CREATED', 'TRADER_UPDATED', 'TRADER_SUSPENDED', 'ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'ACCOUNT_ASSIGNED', 'ACCOUNT_RETURNED', 'ACCOUNT_REVOKED', 'FUNDED_ACCOUNT_CREATED', 'FUNDED_ACCOUNT_CLOSED', 'FUNDED_ACCOUNT_SUSPENDED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'RULESET_CREATED', 'RULESET_UPDATED', 'RULESET_VERSION_CREATED', 'RULESET_VERSION_PUBLISHED', 'CONFIGURATION_CHANGED', 'SYSTEM_EVENT');

-- CreateEnum
CREATE TYPE "RuleResult" AS ENUM ('PASS', 'FAIL', 'WARNING');

-- CreateTable
CREATE TABLE "Trader" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TRADER',
    "firstName" TEXT,
    "lastName" TEXT,
    "status" "TraderStatus" NOT NULL DEFAULT 'PENDING',
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pricingPlan" TEXT,
    "settings" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accountSize" DECIMAL(18,2),
    "price" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "rulesetId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ruleset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ruleset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesetVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "rulesetId" TEXT NOT NULL,
    "status" "RulesetVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RulesetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "rulesetVersionId" TEXT NOT NULL,
    "ruleType" "RuleType" NOT NULL,
    "name" TEXT NOT NULL,
    "value" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MT5Account" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "broker" TEXT,
    "server" TEXT,
    "login" TEXT,
    "accountSize" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "purpose" "MT5AccountPurpose",
    "status" "AccountStatus" NOT NULL DEFAULT 'AVAILABLE',
    "healthStatus" "MT5HealthStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "credentials" TEXT,
    "notes" TEXT,
    "lastHealthCheck" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MT5Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "rulesetVersionId" TEXT NOT NULL,
    "accountId" TEXT,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalPnl" DECIMAL(18,2),
    "maxDrawdown" DECIMAL(18,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundedAccount" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "accountId" TEXT,
    "rulesetVersionId" TEXT,
    "status" "FundedAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "allocatedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "totalPnl" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountAssignment" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "AccountAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleEvaluation" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "result" "RuleResult" NOT NULL,
    "actualValue" JSONB,
    "expectedValue" JSONB,
    "details" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT,
    "message" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RuleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "performedBy" TEXT,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AuditLogToTrader" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AuditLogToTrader_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AuditLogToProduct" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AuditLogToProduct_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AuditLogToRuleset" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AuditLogToRuleset_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AuditLogToMT5Account" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AuditLogToMT5Account_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AuditLogToEvaluation" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AuditLogToEvaluation_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AuditLogToFundedAccount" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AuditLogToFundedAccount_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trader_email_key" ON "Trader"("email");

-- CreateIndex
CREATE INDEX "Trader_role_idx" ON "Trader"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Ruleset_name_key" ON "Ruleset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RulesetVersion_rulesetId_version_key" ON "RulesetVersion"("rulesetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MT5Account_accountNumber_key" ON "MT5Account"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AccountAssignment_traderId_accountId_assignedAt_key" ON "AccountAssignment"("traderId", "accountId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RuleEvaluation_evaluationId_ruleId_key" ON "RuleEvaluation"("evaluationId", "ruleId");

-- CreateIndex
CREATE INDEX "_AuditLogToTrader_B_index" ON "_AuditLogToTrader"("B");

-- CreateIndex
CREATE INDEX "_AuditLogToProduct_B_index" ON "_AuditLogToProduct"("B");

-- CreateIndex
CREATE INDEX "_AuditLogToRuleset_B_index" ON "_AuditLogToRuleset"("B");

-- CreateIndex
CREATE INDEX "_AuditLogToMT5Account_B_index" ON "_AuditLogToMT5Account"("B");

-- CreateIndex
CREATE INDEX "_AuditLogToEvaluation_B_index" ON "_AuditLogToEvaluation"("B");

-- CreateIndex
CREATE INDEX "_AuditLogToFundedAccount_B_index" ON "_AuditLogToFundedAccount"("B");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "Ruleset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulesetVersion" ADD CONSTRAINT "RulesetVersion_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "Ruleset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_rulesetVersionId_fkey" FOREIGN KEY ("rulesetVersionId") REFERENCES "RulesetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_rulesetVersionId_fkey" FOREIGN KEY ("rulesetVersionId") REFERENCES "RulesetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundedAccount" ADD CONSTRAINT "FundedAccount_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundedAccount" ADD CONSTRAINT "FundedAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundedAccount" ADD CONSTRAINT "FundedAccount_rulesetVersionId_fkey" FOREIGN KEY ("rulesetVersionId") REFERENCES "RulesetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAssignment" ADD CONSTRAINT "AccountAssignment_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAssignment" ADD CONSTRAINT "AccountAssignment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleEvaluation" ADD CONSTRAINT "RuleEvaluation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleEvaluation" ADD CONSTRAINT "RuleEvaluation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleEvent" ADD CONSTRAINT "RuleEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToTrader" ADD CONSTRAINT "_AuditLogToTrader_A_fkey" FOREIGN KEY ("A") REFERENCES "AuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToTrader" ADD CONSTRAINT "_AuditLogToTrader_B_fkey" FOREIGN KEY ("B") REFERENCES "Trader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToProduct" ADD CONSTRAINT "_AuditLogToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "AuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToProduct" ADD CONSTRAINT "_AuditLogToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToRuleset" ADD CONSTRAINT "_AuditLogToRuleset_A_fkey" FOREIGN KEY ("A") REFERENCES "AuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToRuleset" ADD CONSTRAINT "_AuditLogToRuleset_B_fkey" FOREIGN KEY ("B") REFERENCES "Ruleset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToMT5Account" ADD CONSTRAINT "_AuditLogToMT5Account_A_fkey" FOREIGN KEY ("A") REFERENCES "AuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToMT5Account" ADD CONSTRAINT "_AuditLogToMT5Account_B_fkey" FOREIGN KEY ("B") REFERENCES "MT5Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToEvaluation" ADD CONSTRAINT "_AuditLogToEvaluation_A_fkey" FOREIGN KEY ("A") REFERENCES "AuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToEvaluation" ADD CONSTRAINT "_AuditLogToEvaluation_B_fkey" FOREIGN KEY ("B") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToFundedAccount" ADD CONSTRAINT "_AuditLogToFundedAccount_A_fkey" FOREIGN KEY ("A") REFERENCES "AuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditLogToFundedAccount" ADD CONSTRAINT "_AuditLogToFundedAccount_B_fkey" FOREIGN KEY ("B") REFERENCES "FundedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
