import { PrismaClient, MonitoringJob, JobStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

export const DEFAULT_GRACE_PERIOD_MS = 60000;
export const DEFAULT_RECOVERY_INTERVAL_MS = 30000;
export const DEFAULT_TIMEOUT_MS = 10000;

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
