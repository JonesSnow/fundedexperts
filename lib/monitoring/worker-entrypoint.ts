import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createMT5Adapter } from "./adapter-factory";
import { MonitoringRunner } from "./monitoring-runner";
import { readMonitoringWorkerSettings, runMonitoringWorkerLoop } from "./worker-runtime";

export async function startMonitoringWorker(): Promise<void> {
  const settings = readMonitoringWorkerSettings(process.env);
  const adapter = createMT5Adapter({
    mode: "real",
    realConfig: {
      pythonPath: settings.pythonPath,
      scriptTimeoutMs: settings.adapterTimeoutMs,
    },
  });

  // Load the lazy Prisma proxy only after the explicit worker-enable and
  // required-configuration checks have passed.
  const { prisma } = await import("../db");
  const runner = new MonitoringRunner(prisma, {
    workerId: settings.workerId,
    workerTimeoutMs: settings.workerTimeoutMs,
    workerMaxAttempts: 1,
    schedulerMaxConcurrent: 1,
    schedulerRetryBaseDelayMs: 1_000,
    schedulerMaxDelayMs: 10_000,
    schedulerRetryMultiplier: 2,
  }, adapter);

  const shutdown = new AbortController();
  const requestShutdown = () => shutdown.abort();
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);

  console.info(JSON.stringify({
    event: "monitoring_worker_started",
    workerId: settings.workerId,
    pollIntervalMs: settings.pollIntervalMs,
  }));

  try {
    await runMonitoringWorkerLoop(runner, settings.pollIntervalMs, shutdown.signal, {
      onCycleComplete: (summary) => console.info(JSON.stringify({
        event: "monitoring_cycle_complete",
        ...summary,
      })),
      onCycleFailure: () => console.error("Monitoring cycle failed; retrying after the configured interval."),
    });
  } finally {
    process.off("SIGINT", requestShutdown);
    process.off("SIGTERM", requestShutdown);
    await prisma.$disconnect();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  void startMonitoringWorker().catch(() => {
    console.error("Monitoring worker did not start or stopped unexpectedly; sensitive error details are withheld.");
    process.exitCode = 1;
  });
}
