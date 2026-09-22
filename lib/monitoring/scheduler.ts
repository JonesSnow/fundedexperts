import type { MonitoringJob, JobStatus, CreateJobInput } from "./job";
import type { WorkerStatus } from "./worker";

export interface RetryPolicyConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
}

export interface SchedulerConfig {
  maxConcurrentJobs: number;
  retryPolicy: RetryPolicyConfig;
}

export interface ScheduledJob extends MonitoringJob {
  scheduledAt: Date;
  scheduleId: string;
}

export interface SchedulerStatus {
  isRunning: boolean;
  queueLength: number;
  activeJobCount: number;
  maxConcurrentJobs: number;
  totalScheduled: number;
  totalCompleted: number;
  totalFailed: number;
  retryPolicy: RetryPolicyConfig;
}

export interface ScheduleResult {
  scheduleId: string;
  job: ScheduledJob;
  queued: boolean;
}

export class Scheduler {
  private config: SchedulerConfig;
  private queue: ScheduledJob[] = [];
  private activeJobs: Map<string, ScheduledJob> = new Map();
  private completedJobs: ScheduledJob[] = [];
  private failedJobs: ScheduledJob[] = [];
  private isRunning: boolean = false;
  private totalScheduled: number = 0;
  private totalCompleted: number = 0;
  private totalFailed: number = 0;

  constructor(config: SchedulerConfig) {
    this.config = config;
  }

  schedule(input: CreateJobInput): ScheduleResult {
    const job: ScheduledJob = {
      ...this.createMonitoringJob(input),
      scheduledAt: new Date(),
      scheduleId: `schedule-${input.accountId}-${Date.now()}`,
    };

    this.queue.push(job);
    this.totalScheduled++;

    return { scheduleId: job.scheduleId, job, queued: true };
  }

  getQueue(): readonly ScheduledJob[] {
    return this.queue;
  }

  getActiveJobs(): readonly ScheduledJob[] {
    return Array.from(this.activeJobs.values());
  }

  getCompletedJobs(): readonly ScheduledJob[] {
    return this.completedJobs;
  }

  getFailedJobs(): readonly ScheduledJob[] {
    return this.failedJobs;
  }

  getStatus(): SchedulerStatus {
    return {
      isRunning: this.isRunning,
      queueLength: this.queue.length,
      activeJobCount: this.activeJobs.size,
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      totalScheduled: this.totalScheduled,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      retryPolicy: this.config.retryPolicy,
    };
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;
  }

  isQueueEmpty(): boolean {
    return this.queue.length === 0;
  }

  getNextJob(): ScheduledJob | null {
    if (this.queue.length === 0) return null;
    if (this.activeJobs.size >= this.config.maxConcurrentJobs) return null;
    return this.queue.shift() ?? null;
  }

  activateJob(job: ScheduledJob): void {
    const idx = this.queue.findIndex((j) => j.jobId === job.jobId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }
    job.status = "RUNNING";
    job.startedAt = new Date();
    this.activeJobs.set(job.jobId, job);
  }

  completeJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.status = "COMPLETED";
      job.completedAt = new Date();
      this.activeJobs.delete(jobId);
      this.completedJobs.push(job);
      this.totalCompleted++;
    }
  }

  failJob(jobId: string, errorCode: string, errorMessage: string): void {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.status = "FAILED";
      job.completedAt = new Date();
      job.errorCode = errorCode;
      job.errorMessage = errorMessage;
      job.retryable = this.shouldRetry(job);
      this.activeJobs.delete(jobId);
      this.failedJobs.push(job);
      this.totalFailed++;
    }
  }

  getRetryableJobs(): readonly ScheduledJob[] {
    return this.failedJobs.filter((job) => job.retryable && job.attempt < this.config.retryPolicy.maxAttempts);
  }

  requeueJob(jobId: string): ScheduledJob | null {
    const jobIndex = this.failedJobs.findIndex((j) => j.jobId === jobId);
    if (jobIndex === -1) return null;
    const job = this.failedJobs[jobIndex];
    job.status = "PENDING";
    job.attempt += 1;
    job.startedAt = null;
    job.completedAt = null;
    job.errorCode = null;
    job.errorMessage = null;
    job.retryable = false;
    this.failedJobs.splice(jobIndex, 1);
    this.queue.unshift(job);
    return job;
  }

  private createMonitoringJob(input: CreateJobInput): MonitoringJob {
    return {
      jobId: `job-${input.accountId}-${Date.now()}`,
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

  private shouldRetry(job: ScheduledJob): boolean {
    const policy = this.config.retryPolicy;
    return job.attempt < policy.maxAttempts;
  }

  getDelayForAttempt(attempt: number): number {
    const policy = this.config.retryPolicy;
    const delay = Math.min(policy.baseDelayMs * Math.pow(policy.multiplier, attempt - 1), policy.maxDelayMs);
    return delay;
  }
}
