export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "TIMEOUT" | "CANCELLED";

export interface MonitoringJob {
  jobId: string;
  accountId: string;
  workerId: string;
  attempt: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  status: JobStatus;
  timeoutMs: number;
  retryable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface CreateJobInput {
  accountId: string;
  workerId: string;
  timeoutMs?: number;
}

export function createJob(input: CreateJobInput): MonitoringJob {
  return {
    jobId: generateJobId(input.accountId),
    accountId: input.accountId,
    workerId: input.workerId,
    attempt: 1,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    status: "PENDING",
    timeoutMs: input.timeoutMs ?? 10000,
    retryable: false,
    errorCode: null,
    errorMessage: null,
  };
}

export function markRunning(job: MonitoringJob): MonitoringJob {
  return { ...job, status: "RUNNING", startedAt: new Date() };
}

export function markCompleted(job: MonitoringJob): MonitoringJob {
  return { ...job, status: "COMPLETED", completedAt: new Date() };
}

export function markFailed(
  job: MonitoringJob,
  errorCode: string,
  errorMessage: string,
  retryable = false
): MonitoringJob {
  return {
    ...job,
    status: "FAILED",
    completedAt: new Date(),
    errorCode,
    errorMessage,
    retryable,
  };
}

export function markTimeout(job: MonitoringJob): MonitoringJob {
  return { ...job, status: "TIMEOUT", completedAt: new Date(), errorCode: "TIMEOUT" };
}

export function markCancelled(job: MonitoringJob): MonitoringJob {
  return { ...job, status: "CANCELLED", completedAt: new Date() };
}

export function isRetryable(job: MonitoringJob): boolean {
  return job.retryable && job.status === "FAILED";
}

function generateJobId(accountId: string): string {
  return `job-${accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
