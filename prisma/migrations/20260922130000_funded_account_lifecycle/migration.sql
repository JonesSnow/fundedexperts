-- AddEnumValue
ALTER TYPE "FundedAccountStatus" ADD VALUE 'PENDING';
ALTER TYPE "FundedAccountStatus" ADD VALUE 'ELIGIBLE';
ALTER TYPE "FundedAccountStatus" ADD VALUE 'APPROVED';
ALTER TYPE "FundedAccountStatus" ADD VALUE 'TERMINATED';
ALTER TYPE "FundedAccountStatus" ADD VALUE 'COMPLETED';

-- AddColumn
ALTER TABLE "FundedAccount" ADD COLUMN "evaluationId" TEXT;

-- CreateIndex
CREATE INDEX "FundedAccount_evaluationId_idx" ON "FundedAccount"("evaluationId");

-- AddForeignKey
ALTER TABLE "FundedAccount" ADD CONSTRAINT "FundedAccount_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
