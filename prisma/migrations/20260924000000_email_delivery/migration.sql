-- CreateEnum for email delivery status
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum for email provider type
CREATE TYPE "EmailProviderType" AS ENUM ('GMAIL_SMTP', 'CONSOLE', 'NONE');

-- CreateEnum for email event type
CREATE TYPE "EmailEventType" AS ENUM (
  'EMAIL_VERIFICATION_REQUESTED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_CHANGED',
  'WELCOME',
  'LOGIN_SECURITY_ALERT',
  'ORDER_CREATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'EVALUATION_STARTED',
  'EVALUATION_PASSED',
  'EVALUATION_FAILED',
  'ACCOUNT_ALLOCATED',
  'FUNDED_ACCOUNT_ACTIVATED',
  'ACCOUNT_STATUS_CHANGED',
  'RULE_BREACH_CONFIRMED',
  'PAYOUT_REQUESTED',
  'PAYOUT_APPROVED',
  'PAYOUT_REJECTED'
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "traderId" TEXT,
    "recipient" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" "EmailProviderType" NOT NULL DEFAULT 'NONE',
    "providerMessageId" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "idempotencyKey" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDelivery_idempotencyKey_key" ON "EmailDelivery"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- CreateIndex
CREATE INDEX "EmailDelivery_traderId_fkey" ON "EmailDelivery"("traderId");

-- CreateIndex
CREATE INDEX "EmailDelivery_status_fkey" ON "EmailDelivery"("status");

-- CreateIndex
CREATE INDEX "EmailDelivery_relatedEntityType_relatedEntityId_fkey" ON "EmailDelivery"("relatedEntityType", "relatedEntityId");

-- CreateIndex
CREATE INDEX "EmailDelivery_template_fkey" ON "EmailDelivery"("template");

-- CreateIndex
CREATE INDEX "EmailDelivery_createdAt_fkey" ON "EmailDelivery"("createdAt");

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE SET NULL ON UPDATE CASCADE;
