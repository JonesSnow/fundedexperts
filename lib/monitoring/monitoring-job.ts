import { PrismaClient, MonitoringJob, JobStatus } from "@prisma/client";
import {
  DEFAULT_GRACE_PERIOD_MS,
  DEFAULT_TIMEOUT_MS,
  computeLeaseExpiry,
  type CreateJobInput,
} from "./repository";

export interface CreateJobResult {
  job: MonitoringJob;
  duplicate: boolean;
}

export interface ClaimResult {
  job: MonitoringJob | null;
  claimed: boolean;
}

export interface RecoveryResult {
  recovered: number;
  errors: string[];
}

export async function createJobSafe(
  prisma: PrismaClient,
  input: CreateJobInput
): Promise<CreateJobResult> {
  const activeJob = await prisma.monitoringJob.findFirst({
    where: {
      accountId: input.accountId,
      status: { in: ["PENDING", "RUNNING"] as JobStatus[] },
    },
  });

  if (activeJob) {
    return { job: activeJob, duplicate: true };
  }

  const job = await prisma.monitoringJob.create({
    data: {
      jobId: `job-${input.accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      accountId: input.accountId,
      workerId: input.workerId,
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    },
  });

  return { job, duplicate: false };
}

export async function claimJob(
  prisma: PrismaClient,
  jobId: string,
  workerId: string
): Promise<ClaimResult> {
  try {
    const now = new Date();
    const job = await prisma.monitoringJob.update({
      where: {
        id: jobId,
        status: "PENDING",
      },
      data: {
        status: "RUNNING",
        workerId,
        startedAt: now,
        leaseExpiry: computeLeaseExpiry(now, DEFAULT_TIMEOUT_MS),
      },
    });

    return { job, claimed: true };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2025") {
      const existing = await prisma.monitoringJob.findUnique({ where: { id: jobId } });
      if (existing && existing.status === "RUNNING" && existing.workerId !== workerId) {
        return { job: existing, claimed: false };
      }
      return { job: null, claimed: false };
    }
    throw e;
  }
}

export async function completeJob(
  prisma: PrismaClient,
  jobId: string
): Promise<MonitoringJob | null> {
  return prisma.monitoringJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      leaseExpiry: null,
    },
  });
}

export async function failJob(
  prisma: PrismaClient,
  jobId: string,
  errorCode: string,
  errorMessage: string,
  retryable: boolean
): Promise<MonitoringJob | null> {
  return prisma.monitoringJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorCode,
      errorMessage,
      retryable,
      leaseExpiry: null,
    },
  });
}

export async function timeoutJob(
  prisma: PrismaClient,
  jobId: string
): Promise<MonitoringJob | null> {
  return prisma.monitoringJob.update({
    where: { id: jobId },
    data: {
      status: "TIMEOUT",
      completedAt: new Date(),
      errorCode: "TIMEOUT",
      leaseExpiry: null,
    },
  });
}

export async function cancelJob(
  prisma: PrismaClient,
  jobId: string
): Promise<MonitoringJob | null> {
  return prisma.monitoringJob.update({
    where: { id: jobId },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
      leaseExpiry: null,
    },
  });
}

export async function findStaleJobs(
  prisma: PrismaClient,
  graceMs = DEFAULT_GRACE_PERIOD_MS
): Promise<MonitoringJob[]> {
  const expiryThreshold = new Date(Date.now() - DEFAULT_TIMEOUT_MS - graceMs);
  return prisma.monitoringJob.findMany({
    where: {
      status: "RUNNING",
      leaseExpiry: { lt: expiryThreshold },
    },
  });
}

export async function recoverJob(
  prisma: PrismaClient,
  jobId: string,
  recoveryWorkerId: string
): Promise<MonitoringJob | null> {
  const now = new Date();
  try {
    return await prisma.monitoringJob.update({
      where: {
        id: jobId,
        status: "RUNNING",
        leaseExpiry: { lt: now },
      },
      data: {
        status: "FAILED",
        completedAt: now,
        errorCode: "LEASE_EXPIRED",
        errorMessage: `Job lease expired; recovered by worker ${recoveryWorkerId}`,
        retryable: true,
        leaseExpiry: null,
        workerId: recoveryWorkerId,
      },
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2025") {
      return null;
    }
    throw e;
  }
}

export async function recoverAllStaleJobs(
  prisma: PrismaClient,
  recoveryWorkerId: string,
  graceMs = DEFAULT_GRACE_PERIOD_MS
): Promise<RecoveryResult> {
  const staleJobs = await findStaleJobs(prisma, graceMs);
  const errors: string[] = [];
  let recovered = 0;

  for (const job of staleJobs) {
    try {
      const result = await recoverJob(prisma, job.id, recoveryWorkerId);
      if (result) {
        recovered++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Job ${job.id}: ${msg}`);
    }
  }

  return { recovered, errors };
}

export async function getJobById(
  prisma: PrismaClient,
  jobId: string
): Promise<MonitoringJob | null> {
  return prisma.monitoringJob.findUnique({ where: { id: jobId } });
}

export async function getActiveJobByAccountId(
  prisma: PrismaClient,
  accountId: string
): Promise<MonitoringJob | null> {
  return prisma.monitoringJob.findFirst({
    where: {
      accountId,
      status: { in: ["PENDING", "RUNNING"] as JobStatus[] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateMonitoringState(
  prisma: PrismaClient,
  accountId: string,
  result: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "RECOVERED",
  lastMonitoringAt: Date = new Date()
): Promise<void> {
  await prisma.mT5Account.update({
    where: { id: accountId },
    data: {
      lastMonitoringAt,
      currentMonitoringStatus: result === "SUCCEEDED" ? "HEALTHY" : "ERROR",
      currentMonitoringResult: result,
    },
  });
}
