import { PrismaClient } from "@prisma/client";
import { Worker } from "./worker";
import { Scheduler } from "./scheduler";
import { normalizeSnapshot } from "./normalize";
import { evaluateEligibility } from "./eligibility";
import { Logger } from "./logger";
import { MT5Adapter } from "./adapter";
import { completeJob, failJob, updateMonitoringState } from "./monitoring-job";
import { generateCorrelationId } from "../logger";
import { processMonitoringSnapshot, scheduleMonitoringJob } from "../monitoring-pipeline";
import type { ProviderCredentials } from "./credential-boundary";
import { isEncryptionAvailable } from "../encryption";

function resolveCredentials(account: {
  accountNumber: string;
  login: string | null;
  server: string | null;
  credentials: string | null;
}): ProviderCredentials {
  if (account.credentials && isEncryptionAvailable()) {
    return {
      providerType: "mt5",
      server: account.server ?? "default-server",
      login: Number(account.login ?? account.accountNumber),
      password: account.credentials,
      connectionTimeoutMs: 5000,
    };
  }

  let loginNum: number;
  try {
    loginNum = Number(account.login ?? account.accountNumber);
  } catch {
    loginNum = 0;
  }

  return {
    providerType: "mt5",
    server: account.server ?? "default-server",
    login: loginNum,
    password: process.env.MT5_MASTER_PASSWORD ?? "mock-password",
    connectionTimeoutMs: 5000,
  };
}

export interface MonitoringRunnerConfig {
  workerId: string;
  workerTimeoutMs: number;
  workerMaxAttempts: number;
  schedulerMaxConcurrent: number;
  schedulerRetryBaseDelayMs: number;
  schedulerMaxDelayMs: number;
  schedulerRetryMultiplier: number;
}

export interface MonitoringRunnerStatus {
  isRunning: boolean;
  scheduledCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  workerStatus: ReturnType<Worker["getStatus"]>;
}

export interface RunAccountResult {
  accountId: string;
  success: boolean;
  jobId?: string;
  error?: string;
  errorCategory?: string;
  monitoringState?: ProcessSnapshotState;
}

export interface ProcessSnapshotState {
  evaluationId?: string;
  overallResult: string;
  ruleEventsCreated: number;
  passed?: boolean;
  failed?: boolean;
}

export class MonitoringRunner {
  private worker: Worker;
  private scheduler: Scheduler;
  private prisma: PrismaClient;
  private logger: Logger;
  private isRunning: boolean = false;
  private processedCount: number = 0;

  constructor(
    prisma: PrismaClient,
    config: MonitoringRunnerConfig,
    adapter?: MT5Adapter
  ) {
    this.prisma = prisma;
    this.worker = new Worker(
      {
        workerId: config.workerId,
        timeoutMs: config.workerTimeoutMs,
        maxAttempts: config.workerMaxAttempts,
        loggerMaxEntries: 100,
      },
      adapter
    );
    this.scheduler = new Scheduler({
      maxConcurrentJobs: config.schedulerMaxConcurrent,
      retryPolicy: {
        maxAttempts: config.workerMaxAttempts,
        baseDelayMs: config.schedulerRetryBaseDelayMs,
        maxDelayMs: config.schedulerMaxDelayMs,
        multiplier: config.schedulerRetryMultiplier,
      },
    });
    this.logger = new Logger({ workerId: config.workerId, maxEntries: 100 });
  }

  getStatus(): MonitoringRunnerStatus {
    const schedulerStatus = this.scheduler.getStatus();
    return {
      isRunning: this.isRunning,
      scheduledCount: schedulerStatus.totalScheduled,
      activeCount: schedulerStatus.activeJobCount,
      completedCount: schedulerStatus.totalCompleted,
      failedCount: schedulerStatus.totalFailed,
      workerStatus: this.worker.getStatus(),
    };
  }

  async runAccount(
    accountId: string,
    performedBy: string = "system",
    sendEmails: boolean = true
  ): Promise<RunAccountResult> {
    const correlationId = generateCorrelationId();
    this.logger.info(`RUN-${accountId}`, "Starting monitoring for account", { correlationId });

    const eligibility = evaluateEligibility({ accountId });
    if (!eligibility.eligible) {
      const reason = eligibility.reasons.map((r) => r.message).join("; ");
      this.logger.error(`RUN-${accountId}`, "Account ineligible", "INELIGIBLE", {
        correlationId,
        reasons: eligibility.reasons,
      });
      return {
        accountId,
        success: false,
        error: `Account ineligible: ${reason}`,
        errorCategory: "INELIGIBLE",
      };
    }

    const { jobId, duplicate } = await scheduleMonitoringJob(
      this.prisma,
      accountId,
      this.worker.getStatus().workerId
    );

    if (duplicate) {
      this.logger.info(`RUN-${accountId}`, "Job already in progress, skipping", {
        correlationId,
        jobId,
      });
      return {
        accountId,
        success: false,
        jobId,
        error: "Job already in progress",
        errorCategory: "DUPLICATE_JOB",
      };
    }

    const job = await this.prisma.monitoringJob.findUnique({
      where: { jobId },
      include: { account: true },
    });

    if (!job) {
      return {
        accountId,
        success: false,
        error: "Job not found",
        errorCategory: "JOB_NOT_FOUND",
      };
    }

    await this.prisma.monitoringJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const account = job.account;
    const credentials: ProviderCredentials = resolveCredentials(account);

    try {
      const result = await this.worker.execute(accountId, { credentials });

      if (!result.success || !result.snapshot) {
        await failJob(
          this.prisma,
          job.id,
          result.error?.code ?? "WORKER_ERROR",
          result.error?.message ?? "Unknown error",
          true
        );
        await updateMonitoringState(this.prisma, accountId, "FAILED", new Date());
        return {
          accountId,
          success: false,
          jobId,
          error: result.error?.message ?? "Worker failed",
          errorCategory: result.error?.code ?? "WORKER_ERROR",
        };
      }

      const providerSnapshot = result.snapshot;
      const normalizationResult = normalizeSnapshot(
        accountId,
        account.accountNumber,
        "MT5",
        providerSnapshot as unknown as Parameters<typeof normalizeSnapshot>[3]
      );

      if (!normalizationResult.snapshot) {
        await failJob(
          this.prisma,
          job.id,
          "NORMALIZATION_FAILED",
          normalizationResult.errors.map((e) => e.message).join("; "),
          false
        );
        await updateMonitoringState(this.prisma, accountId, "FAILED", new Date());
        return {
          accountId,
          success: false,
          jobId,
          error: "Snapshot normalization failed",
          errorCategory: "NORMALIZATION_FAILED",
        };
      }

      await completeJob(this.prisma, job.id);

      const pipelineResult = await processMonitoringSnapshot(this.prisma, {
        accountId,
        snapshot: normalizationResult.snapshot,
        performedBy,
        sendEmails,
      });

      if (!pipelineResult.success) {
        await updateMonitoringState(this.prisma, accountId, "FAILED", new Date());
        return {
          accountId,
          success: false,
          jobId,
          error: pipelineResult.error,
          errorCategory: pipelineResult.errorCategory,
        };
      }

      const monitoringState: ProcessSnapshotState = {
        evaluationId: pipelineResult.evaluationId,
        overallResult: pipelineResult.overallResult,
        ruleEventsCreated: pipelineResult.ruleEventsCreated,
        passed: pipelineResult.passed,
        failed: pipelineResult.failed,
      };

      await updateMonitoringState(this.prisma, accountId, "SUCCEEDED", new Date());
      this.processedCount++;

      return {
        accountId,
        success: true,
        jobId,
        monitoringState,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`RUN-${accountId}`, "Unexpected error in runAccount", "UNEXPECTED_ERROR", {
        correlationId,
        error: message,
      });

      await failJob(this.prisma, job.id, "UNEXPECTED_ERROR", message, false);
      await updateMonitoringState(this.prisma, accountId, "FAILED", new Date());

      return {
        accountId,
        success: false,
        jobId,
        error: message,
        errorCategory: "UNEXPECTED_ERROR",
      };
    }
  }

  async runAllEligible(): Promise<RunAccountResult[]> {
    if (this.isRunning) {
      throw new Error("Runner is already running");
    }

    this.isRunning = true;
    this.scheduler.start();

    this.logger.info("RUN_ALL", "Starting batch monitoring run");

    const eligibleAccounts = await this.prisma.mT5Account.findMany({
      where: {
        currentMonitoringStatus: { in: ["HEALTHY", "ERROR", "UNKNOWN"] },
        evaluations: {
          some: {
            status: "IN_PROGRESS",
          },
        },
      },
      select: { id: true },
    });

    this.logger.info("RUN_ALL", `Found ${eligibleAccounts.length} eligible accounts`);

    const results: RunAccountResult[] = [];
    for (const account of eligibleAccounts) {
      const result = await this.runAccount(account.id, "system", true);
      results.push(result);
    }

    this.isRunning = false;
    this.scheduler.stop();

    this.logger.info("RUN_ALL", `Completed batch monitoring run: ${results.length} accounts processed`);

    return results;
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  getWorker(): Worker {
    return this.worker;
  }

  getScheduler(): Scheduler {
    return this.scheduler;
  }
}
