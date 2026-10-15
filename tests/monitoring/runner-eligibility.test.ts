import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  MonitoringRunner,
  monitoringRunnerEligibleAccountFilter,
} from "../../lib/monitoring/monitoring-runner";

const runnerConfig = {
  workerId: "runner-eligibility-test",
  workerTimeoutMs: 20,
  workerMaxAttempts: 1,
  schedulerMaxConcurrent: 1,
  schedulerRetryBaseDelayMs: 1,
  schedulerMaxDelayMs: 1,
  schedulerRetryMultiplier: 1,
};

test("monitoring batch includes active evaluations with a null monitoring status", () => {
  assert.deepEqual(monitoringRunnerEligibleAccountFilter(), {
    OR: [
      { currentMonitoringStatus: null },
      { currentMonitoringStatus: { in: ["HEALTHY", "ERROR", "UNKNOWN"] } },
    ],
    evaluations: { some: { status: "IN_PROGRESS" } },
  });
});

test("monitoring batch always stops its runner and scheduler after a query failure", async () => {
  const fakePrisma = {
    mT5Account: {
      findMany: async () => {
        throw new Error("Mocked query failure; no database connection is configured.");
      },
    },
  } as unknown as PrismaClient;
  const runner = new MonitoringRunner(fakePrisma, runnerConfig);

  await assert.rejects(runner.runAllEligible(), /Mocked query failure/);

  assert.equal(runner.getStatus().isRunning, false);
  assert.equal(runner.getScheduler().getStatus().isRunning, false);
});
