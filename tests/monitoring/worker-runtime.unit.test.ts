import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  readMonitoringWorkerSettings,
  runMonitoringWorkerLoop,
} from "../../lib/monitoring/worker-runtime";

const workerEntrypoint = readFileSync(
  new URL("../../lib/monitoring/worker-entrypoint.ts", import.meta.url),
  "utf8",
);

function validEnvironment(): Record<string, string> {
  return {
    MONITORING_WORKER_ENABLED: "true",
    DATABASE_URL: "configured-isolated-target",
    MT5_ENCRYPTION_KEY: "t".repeat(32),
    WORKER_ID: "unit-test-worker",
  };
}

test("standalone monitoring worker requires an explicit enable flag and dependencies", () => {
  assert.throws(
    () => readMonitoringWorkerSettings({ ...validEnvironment(), MONITORING_WORKER_ENABLED: "false" }),
    /MONITORING_WORKER_ENABLED/,
  );
  assert.throws(
    () => readMonitoringWorkerSettings({ ...validEnvironment(), DATABASE_URL: "" }),
    /DATABASE_URL/,
  );
  assert.throws(
    () => readMonitoringWorkerSettings({ ...validEnvironment(), MT5_ENCRYPTION_KEY: "short" }),
    /MT5_ENCRYPTION_KEY/,
  );
});

test("worker configuration defaults are bounded and keep adapter timeout below worker timeout", () => {
  const settings = readMonitoringWorkerSettings(validEnvironment());

  assert.equal(settings.workerId, "unit-test-worker");
  assert.equal(settings.pollIntervalMs, 60_000);
  assert.equal(settings.adapterTimeoutMs, 15_000);
  assert.equal(settings.workerTimeoutMs, 20_000);
  assert.equal(settings.pythonPath, "python");
  assert.throws(
    () => readMonitoringWorkerSettings({
      ...validEnvironment(),
      WORKER_TIMEOUT_MS: "15000",
      MT5_SCRIPT_TIMEOUT_MS: "15000",
    }),
    /WORKER_TIMEOUT_MS/,
  );
});

test("worker validates configuration before loading the Prisma client", () => {
  const validation = workerEntrypoint.indexOf("readMonitoringWorkerSettings(process.env)");
  const prismaImport = workerEntrypoint.indexOf('await import("../db")');

  assert.notEqual(validation, -1);
  assert.ok(prismaImport > validation);
  assert.match(workerEntrypoint, /mode: "real"/);
});

test("worker loops serially, reports only cycle counts, and stops on abort", async () => {
  const controller = new AbortController();
  const summaries: Array<{ attempted: number; succeeded: number; failed: number }> = [];
  let calls = 0;
  let activeCalls = 0;
  let maximumActiveCalls = 0;

  await runMonitoringWorkerLoop({
    runAllEligible: async () => {
      calls++;
      activeCalls++;
      maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
      await Promise.resolve();
      activeCalls--;
      return [{ success: true }, { success: false }];
    },
  }, 60_000, controller.signal, {
    onCycleComplete: (summary) => {
      summaries.push(summary);
      controller.abort();
    },
  });

  assert.equal(calls, 1);
  assert.equal(maximumActiveCalls, 1);
  assert.deepEqual(summaries, [{ attempted: 2, succeeded: 1, failed: 1 }]);
});

test("worker reports a failed cycle without exposing the underlying error", async () => {
  const controller = new AbortController();
  let attempts = 0;
  let failures = 0;

  await runMonitoringWorkerLoop({
    runAllEligible: async () => {
      attempts++;
      throw new Error("sensitive database detail");
    },
  }, 60_000, controller.signal, {
    onCycleFailure: () => {
      failures++;
      controller.abort();
    },
  });

  assert.equal(attempts, 1);
  assert.equal(failures, 1);
});
