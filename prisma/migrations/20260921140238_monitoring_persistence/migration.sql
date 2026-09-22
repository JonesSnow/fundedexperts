/*
  Warnings:

  - The primary key for the `MonitoringJob` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "MonitoringJob" DROP CONSTRAINT "MonitoringJob_accountId_fkey";

-- AlterTable
ALTER TABLE "MT5Account" ALTER COLUMN "currentMonitoringStatus" SET DATA TYPE TEXT,
ALTER COLUMN "currentMonitoringResult" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "MonitoringJob" DROP CONSTRAINT "MonitoringJob_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "jobId" SET DATA TYPE TEXT,
ALTER COLUMN "accountId" SET DATA TYPE TEXT,
ALTER COLUMN "workerId" SET DATA TYPE TEXT,
ALTER COLUMN "errorCode" SET DATA TYPE TEXT,
ADD CONSTRAINT "MonitoringJob_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "MonitoringJob" ADD CONSTRAINT "MonitoringJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "MonitoringJob_accountId_status_index" RENAME TO "MonitoringJob_accountId_status_idx";

-- RenameIndex
ALTER INDEX "MonitoringJob_jobId_unique" RENAME TO "MonitoringJob_jobId_key";

-- RenameIndex
ALTER INDEX "MonitoringJob_status_leaseExpiry_index" RENAME TO "MonitoringJob_status_leaseExpiry_idx";

-- RenameIndex
ALTER INDEX "MonitoringJob_workerId_index" RENAME TO "MonitoringJob_workerId_idx";
