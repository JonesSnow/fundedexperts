import { createJob, markRunning, markCompleted, markFailed, markTimeout, type MonitoringJob } from "./job";
import { Logger, type LogEntry } from "./logger";
import { evaluateEligibility, type EligibilityResult } from "./eligibility";
import { validateCredentials, createCredentialSet, type ProviderCredentials } from "./credential-boundary";
import type { MonitoringSnapshot, ProviderSnapshot, ProviderName } from "./types";
import { MockMT5Adapter } from "./mock-adapter";
import type { MT5Adapter } from "./adapter";
import type { AdapterAccountInput } from "./adapter";

export interface WorkerConfig {
  workerId: string;
  timeoutMs: number;
  maxAttempts: number;
  loggerMaxEntries: number;
}

export interface WorkerExecuteOptions {
  credentials: ProviderCredentials;
  maxRetry?: boolean;
}

export interface WorkerShutdownResult {
  cancelled: string[];
  errors: string[];
}

export interface WorkerStatus {
  workerId: string;
  isRunning: boolean;
  activeJobId: string | null;
  jobsCompleted: number;
  jobsFailed: number;
  jobsTimedOut: number;
}

export interface WorkerExecuteResult {
  job: MonitoringJob;
  success: boolean;
  snapshot?: MonitoringSnapshot;
  error?: WorkerErrorDetail;
}

export interface WorkerErrorDetail {
  code: string;
  message: string;
  isTimeout?: boolean;
}

function providerNameToMonitor(provider: string): ProviderName {
  switch (provider) {
    case "mt5":
      return "MT5";
    case "xm":
      return "XM";
    default:
      return "OTHER";
  }
}

export class Worker {
  private config: WorkerConfig;
  private adapter: MT5Adapter;
  private logger: Logger;
  private isRunning: boolean = false;
  private activeJobId: string | null = null;
  private jobsCompleted: number = 0;
  private jobsFailed: number = 0;
  private jobsTimedOut: number = 0;
  private currentAttempt: number = 1;
  private shutdownReason: string | null = null;

  constructor(config: WorkerConfig, adapter?: MT5Adapter) {
    this.config = config;
    this.adapter = adapter ?? new MockMT5Adapter({ accounts: [] });
    this.logger = new Logger({ workerId: config.workerId, maxEntries: config.loggerMaxEntries });
  }

  getStatus(): WorkerStatus {
    return {
      workerId: this.config.workerId,
      isRunning: this.isRunning,
      activeJobId: this.activeJobId,
      jobsCompleted: this.jobsCompleted,
      jobsFailed: this.jobsFailed,
      jobsTimedOut: this.jobsTimedOut,
    };
  }

  getLogger(): Logger {
    return this.logger;
  }

  getLogEntries(): readonly LogEntry[] {
    return this.logger.getEntries();
  }

  getActiveJobId(): string | null {
    return this.activeJobId;
  }

  async execute(accountId: string, options: WorkerExecuteOptions): Promise<WorkerExecuteResult> {
    if (this.isRunning) {
      throw new Error("Worker is already running");
    }

    const job = createJob({ accountId, workerId: this.config.workerId, timeoutMs: this.config.timeoutMs });

    this.isRunning = true;
    this.activeJobId = job.jobId;
    this.currentAttempt = 1;

    try {
      const eligibility: EligibilityResult = evaluateEligibility({ accountId });
      if (!eligibility.eligible) {
        const failedJob = markFailed(job, "INELIGIBLE", `Account ineligible: ${eligibility.reasons.map((r) => r.code).join(", ")}`);
        this.jobsFailed++;
        this.logger.error(failedJob.jobId, "Account ineligible", "INELIGIBLE", { reasons: eligibility.reasons });
        return { job: failedJob, success: false, error: { code: "INELIGIBLE", message: "Account ineligible" } };
      }

      const credentialValidation = validateCredentials(options.credentials);
      if (!credentialValidation.valid) {
        const failedJob = markFailed(job, "INVALID_CREDENTIALS", credentialValidation.errors.join("; "));
        this.jobsFailed++;
        this.logger.error(failedJob.jobId, "Invalid credentials", "INVALID_CREDENTIALS", { errors: credentialValidation.errors });
        return { job: failedJob, success: false, error: { code: "INVALID_CREDENTIALS", message: credentialValidation.errors.join("; ") } };
      }

      const runningJob = markRunning(job);
      this.logger.info(runningJob.jobId, "Job started", { credentialSet: createCredentialSet(options.credentials) });

      const result = await this.runWithTimeout(runningJob, options.credentials);

      if (result.success) {
        const completedJob = markCompleted(runningJob);
        this.jobsCompleted++;
        this.logger.info(completedJob.jobId, "Job completed successfully");
        return { job: completedJob, success: true, snapshot: result.snapshot };
      }

      if (result.error?.isTimeout) {
        const timeoutJob = markTimeout(runningJob);
        this.jobsTimedOut++;
        this.logger.error(timeoutJob.jobId, "Job timed out", "TIMEOUT");
        return { job: timeoutJob, success: false, error: { code: "TIMEOUT", message: result.error.message, isTimeout: true } };
      }

      const failedJob = markFailed(runningJob, result.error?.code ?? "UNKNOWN", result.error?.message ?? "Unknown error", options.maxRetry ?? false);
      this.jobsFailed++;
      this.logger.error(failedJob.jobId, "Job failed", result.error?.code ?? "UNKNOWN", { attempt: this.currentAttempt });
      return { job: failedJob, success: false, error: { code: result.error?.code ?? "UNKNOWN", message: result.error?.message ?? "Unknown error" } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedJob = markFailed(job, "WORKER_ERROR", message, options.maxRetry ?? false);
      this.jobsFailed++;
      this.logger.error(job.jobId, "Worker error", "WORKER_ERROR", { error: message });
      return { job: failedJob, success: false, error: { code: "WORKER_ERROR", message } };
    } finally {
      this.isRunning = false;
      this.activeJobId = null;
      if (this.currentAttempt > 1) {
        this.currentAttempt = 1;
      }
    }
  }

  private async runWithTimeout(
    job: MonitoringJob,
    credentials: ProviderCredentials
  ): Promise<{ success: true; snapshot: MonitoringSnapshot; job: MonitoringJob } | { success: false; error: WorkerErrorDetail; job: MonitoringJob }> {
    const timeoutMs = this.config.timeoutMs;

    const input: AdapterAccountInput = {
      accountId: job.accountId,
      accountNumber: String(credentials.login),
      provider: providerNameToMonitor(credentials.providerType),
      credentials: credentials.password,
      timeoutMs: credentials.connectionTimeoutMs,
    };

    const executePromise = this.adapter.fetchSnapshot(input);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Job timed out")), timeoutMs);
    });

    try {
      const snapshot = await Promise.race([executePromise, timeoutPromise]);
      return { success: true, snapshot: snapshot as unknown as MonitoringSnapshot, job };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = message === "Job timed out";
      return {
        success: false,
        error: {
          code: isTimeout ? "TIMEOUT" : "ADAPTER_ERROR",
          message,
          isTimeout,
        },
        job,
      };
    }
  }

  async retry(accountId: string, previousJob: MonitoringJob, options: WorkerExecuteOptions): Promise<WorkerExecuteResult> {
    if (previousJob.status !== "FAILED" && previousJob.status !== "TIMEOUT") {
      throw new Error("Can only retry failed or timed out jobs");
    }
    if (previousJob.attempt >= this.config.maxAttempts) {
      throw new Error(`Max attempts (${this.config.maxAttempts}) reached`);
    }

    this.currentAttempt = previousJob.attempt + 1;
    const retryJob = createJob({
      accountId,
      workerId: this.config.workerId,
      timeoutMs: this.config.timeoutMs,
    });
    retryJob.attempt = this.currentAttempt;

    return this.executeWithJob(retryJob, options);
  }

  private async executeWithJob(job: MonitoringJob, options: WorkerExecuteOptions): Promise<WorkerExecuteResult> {
    this.isRunning = true;
    this.activeJobId = job.jobId;

    try {
      const eligibility: EligibilityResult = evaluateEligibility({ accountId: job.accountId });
      if (!eligibility.eligible) {
        this.jobsFailed++;
        return { job, success: false, error: { code: "INELIGIBLE", message: "Account ineligible" } };
      }

      const credentialValidation = validateCredentials(options.credentials);
      if (!credentialValidation.valid) {
        this.jobsFailed++;
        return { job, success: false, error: { code: "INVALID_CREDENTIALS", message: credentialValidation.errors.join("; ") } };
      }

      this.logger.info(job.jobId, "Retry job started", { attempt: job.attempt });
      return await this.runWithTimeout(job, options.credentials);
    } finally {
      this.isRunning = false;
      this.activeJobId = null;
    }
  }

  async shutdown(reason: string = "manual"): Promise<WorkerShutdownResult> {
    this.shutdownReason = reason;
    const cancelled: string[] = [];
    const errors: string[] = [];

    if (this.isRunning && this.activeJobId) {
      try {
        cancelled.push(this.activeJobId);
        this.logger.error(this.activeJobId, "Job cancelled due to shutdown", "SHUTDOWN", { reason });
      } catch (error) {
        errors.push(String(error));
      }
    }

    this.isRunning = false;
    this.activeJobId = null;

    return { cancelled, errors };
  }

  async handleCrashRecovery(): Promise<void> {
    this.isRunning = false;
    this.activeJobId = null;
    this.currentAttempt = 1;
    this.logger.info("CRASH_RECOVERY", "Worker crash recovery completed");
  }
}
