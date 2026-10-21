export interface MonitoringWorkerSettings {
  workerId: string;
  pollIntervalMs: number;
  workerTimeoutMs: number;
  adapterTimeoutMs: number;
  pythonPath: string;
}

type WorkerEnvironment = Readonly<Record<string, string | undefined>>;

function readBoundedInteger(
  environment: WorkerEnvironment,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = environment[name];
  if (rawValue === undefined || rawValue.trim() === "") return defaultValue;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

/** Validate worker configuration without logging or echoing secret values. */
export function readMonitoringWorkerSettings(
  environment: WorkerEnvironment,
): MonitoringWorkerSettings {
  if (environment.MONITORING_WORKER_ENABLED !== "true") {
    throw new Error("MONITORING_WORKER_ENABLED must be true to start this process.");
  }
  if (!environment.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for the monitoring worker.");
  }
  const encryptionKey = environment.MT5_ENCRYPTION_KEY;
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("MT5_ENCRYPTION_KEY must be configured and at least 32 characters long.");
  }

  const workerId = environment.WORKER_ID?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(workerId)) {
    throw new Error("WORKER_ID must contain 1 to 64 letters, digits, dots, underscores, or hyphens.");
  }

  const pollIntervalMs = readBoundedInteger(environment, "MONITORING_POLL_INTERVAL_MS", 60_000, 1_000, 3_600_000);
  const adapterTimeoutMs = readBoundedInteger(environment, "MT5_SCRIPT_TIMEOUT_MS", 15_000, 1_000, 120_000);
  const workerTimeoutMs = readBoundedInteger(environment, "WORKER_TIMEOUT_MS", 20_000, 2_000, 122_000);
  if (workerTimeoutMs <= adapterTimeoutMs) {
    throw new Error("WORKER_TIMEOUT_MS must exceed MT5_SCRIPT_TIMEOUT_MS.");
  }

  return {
    workerId,
    pollIntervalMs,
    workerTimeoutMs,
    adapterTimeoutMs,
    pythonPath: environment.MT5_PYTHON_PATH?.trim() || "python",
  };
}

export interface MonitoringBatchRunner {
  runAllEligible(): Promise<readonly { success: boolean }[]>;
}

export interface MonitoringCycleSummary {
  attempted: number;
  succeeded: number;
  failed: number;
}

export interface MonitoringWorkerReporter {
  onCycleComplete?: (summary: MonitoringCycleSummary) => void;
  onCycleFailure?: () => void;
}

function waitForNextCycle(intervalMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, intervalMs);
    signal.addEventListener("abort", finish, { once: true });
  });
}

/** Run serial monitoring batches and wait between them without overlapping cycles. */
export async function runMonitoringWorkerLoop(
  runner: MonitoringBatchRunner,
  pollIntervalMs: number,
  signal: AbortSignal,
  reporter: MonitoringWorkerReporter = {},
): Promise<void> {
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new Error("The monitoring poll interval must be a positive integer.");
  }

  while (!signal.aborted) {
    let results: readonly { success: boolean }[];
    try {
      results = await runner.runAllEligible();
    } catch {
      reporter.onCycleFailure?.();
      if (signal.aborted) return;
      await waitForNextCycle(pollIntervalMs, signal);
      continue;
    }

    const succeeded = results.filter((result) => result.success).length;
    reporter.onCycleComplete?.({
      attempted: results.length,
      succeeded,
      failed: results.length - succeeded,
    });
    if (signal.aborted) return;
    await waitForNextCycle(pollIntervalMs, signal);
  }
}
