-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CUSTOMER_PAYMENT', 'REFUND', 'PLATFORM_FEE', 'TRADER_PAYOUT', 'INTERNAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "traderId" TEXT,
    "orderId" TEXT,
    "referenceId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_entryNumber_key" ON "LedgerEntry"("entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_referenceId_key" ON "LedgerEntry"("referenceId");

-- CreateIndex
CREATE INDEX "LedgerEntry_traderId_entryType_idx" ON "LedgerEntry"("traderId", "entryType");

-- CreateIndex
CREATE INDEX "LedgerEntry_orderId_idx" ON "LedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "LedgerEntry_referenceId_idx" ON "LedgerEntry"("referenceId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
