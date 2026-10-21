import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  MonitoringRunner,
  monitoringRunnerEligibleAccountFilter,
} from "../../lib/monitoring/monitoring-runner";
import { scheduleMonitoringJob } from "../../lib/monitoring-pipeline";
import { createJobSafe } from "../../lib/monitoring/monitoring-job";

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
      { currentMonitoringStatus: { in: ["HEALTHY", "DEGRADED", "ERROR", "UNKNOWN"] } },
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

test("monitoring job creation serializes competing schedulers on the account row", async () => {
  const accountId = "monitoring-job-race-account";
  const jobs: Array<{ id: string; jobId: string; accountId: string; status: string }> = [];
  const lockEvents: string[] = [];
  let lockTail = Promise.resolve();

  const transactionClient = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert.match(strings.join(""), /FOR UPDATE/i);
      assert.equal(values[0], accountId);

      const previous = lockTail;
      let unlock: () => void = () => undefined;
      lockTail = new Promise<void>((resolve) => { unlock = resolve; });
      await previous;
      lockEvents.push("locked");
      return [{ id: accountId, unlock }];
    },
    monitoringJob: {
      findFirst: async (args: { where: { accountId: string; status: { in: string[] } } }) => {
        lockEvents.push("checked");
        return jobs.find((job) =>
          job.accountId === args.where.accountId && args.where.status.in.includes(job.status)
        ) ?? null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const job = {
          ...args.data,
          id: `monitoring-job-${jobs.length + 1}`,
          jobId: String(args.data.jobId),
          accountId: String(args.data.accountId),
          status: "PENDING",
        };
        jobs.push(job);
        lockEvents.push("created");
        return job;
      },
    },
  };

  const fakePrisma = {
    $transaction: async <T>(operation: (transaction: typeof transactionClient) => Promise<T>) => {
      let unlock: (() => void) | undefined;
      try {
        return await operation({
          ...transactionClient,
          $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const rows = await transactionClient.$queryRaw(strings, ...values);
            unlock = rows[0]?.unlock;
            return rows;
          },
        });
      } finally {
        unlock?.();
      }
    },
  } as unknown as PrismaClient;

  const [scheduled, safelyCreated] = await Promise.all([
    scheduleMonitoringJob(fakePrisma, accountId, "worker-a"),
    createJobSafe(fakePrisma, { accountId, workerId: "worker-b" }),
  ]);

  assert.equal(jobs.length, 1);
  assert.equal(scheduled.duplicate, false);
  assert.equal(safelyCreated.duplicate, true);
  assert.equal(scheduled.jobId, safelyCreated.job.jobId);
  assert.deepEqual(lockEvents, ["locked", "checked", "created", "locked", "checked"]);
});
