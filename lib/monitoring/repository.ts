import type { Prisma, PrismaClient, MonitoringJob, JobStatus } from "@prisma/client";

export const DEFAULT_GRACE_PERIOD_MS = 60000;
export const DEFAULT_RECOVERY_INTERVAL_MS = 30000;
export const DEFAULT_TIMEOUT_MS = 10000;

/** Serialize active-job checks and inserts for one account across workers. */
export async function withAccountMonitoringLock<T>(
  prisma: PrismaClient,
  accountId: string,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (transaction) => {
    const account = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MT5Account" WHERE "id" = ${accountId} FOR UPDATE
    `;
    if (account.length === 0) {
      throw new Error("Monitoring account does not exist.");
    }
    return operation(transaction);
  });
}

export interface CreateJobInput {
  accountId: string;
  workerId: string;
  timeoutMs?: number;
}

export interface ClaimJobInput {
  jobId: string;
  workerId: string;
}

export interface JobResult {
  job: MonitoringJob;
  duplicate: boolean;
}

export interface MonitoringStateUpdate {
  accountId: string;
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "RECOVERED";
  jobId: string;
  errorCode?: string;
}

export function computeLeaseExpiry(startedAt: Date, timeoutMs: number, graceMs = DEFAULT_GRACE_PERIOD_MS): Date {
  return new Date(startedAt.getTime() + timeoutMs + graceMs);
}

export function isJobActive(status: JobStatus): boolean {
  return status === "PENDING" || status === "RUNNING";
}

export function isJobStale(job: Pick<MonitoringJob, "status" | "leaseExpiry">): boolean {
  if (job.status !== "RUNNING") return false;
  if (!job.leaseExpiry) return false;
  return new Date(job.leaseExpiry) < new Date();
}
