import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient, Rule } from "@prisma/client";
import { MonitoringRunner } from "../../lib/monitoring/monitoring-runner";
import { MT5Adapter } from "../../lib/monitoring/adapter";
import type { ProviderName, ProviderSnapshot } from "../../lib/monitoring/types";

class BreachSnapshotAdapter extends MT5Adapter {
  readonly providerName: ProviderName = "MT5";

  async fetchSnapshot(): Promise<ProviderSnapshot> {
    const positions = [1, 2].map((ticket) => ({
      ticket,
      symbol: "EURUSD",
      type: 0,
      volume: 0.1,
      price: 1.1,
      sl: 1.09,
      tp: 1.12,
      profit: 0,
      swap: 0,
      time: new Date(),
    }));
    return {
      accountInfo: {
        login: 123456,
        server: "Demo-Server",
        broker: "Demo-Broker",
        balance: 10000,
        equity: 10000,
        currency: "USD",
        leverage: 100,
        isDemo: true,
      },
      positions,
      orders: [],
      history: [],
      timestamp: new Date(),
      provider: "MT5",
    };
  }

  async testConnection(): Promise<{ connected: boolean; message: string }> {
    return { connected: true, message: "Mock connection" };
  }

  async disconnect(): Promise<void> {}
}

test("pipeline release failure leaves evaluation in progress and marks its job failed", async () => {
  const jobUpdates: Array<Record<string, unknown>> = [];
  const evaluationUpdates: Array<Record<string, unknown>> = [];
  const accountUpdates: Array<Record<string, unknown>> = [];
  let job: Record<string, unknown> | null = null;
  let pipelineTransactionCount = 0;

  const rule = {
    id: "rule-max-open-positions",
    ruleType: "MAX_OPEN_TRADES",
    name: "Maximum open trades",
    disposition: "REQUIRED",
    isRequired: true,
    value: { maxTrades: 1 },
    calculation: {
      schemaVersion: 1,
      method: "COUNT_OPEN_POSITIONS_AND_PENDING_ORDERS",
      maxSnapshotAgeMs: 120000,
      breachComparison: "GREATER_THAN",
    },
  } as unknown as Rule;

  const account = {
    id: "monitoring-release-failure-account",
    accountNumber: "ACC-REVIEW-01",
    login: "123456",
    server: "Demo-Server",
    credentials: "opaque-test-credential-envelope", // Test fixture only; the fake adapter does not decrypt it.
    lastMonitoringAt: null,
    currentMonitoringStatus: null,
    currentMonitoringResult: null,
    evaluations: [{
      id: "monitoring-release-failure-evaluation",
      accountId: "monitoring-release-failure-account",
      traderId: "monitoring-release-failure-trader",
      status: "IN_PROGRESS",
      startingBalance: 10000,
      totalPnl: null,
      maxDrawdown: null,
      trader: { id: "monitoring-release-failure-trader", email: "trader@example.invalid", firstName: null },
      rulesetVersion: { rules: [rule], ruleset: { name: "Mock evaluation" } },
    }],
  };

  const persistenceTransaction = {
    $queryRaw: async () => [],
    ruleEvaluation: { upsert: async () => ({}) },
    ruleEvent: { findUnique: async () => null, create: async () => ({}) },
    auditLog: { create: async () => ({}) },
    evaluation: { update: async (input: Record<string, unknown>) => evaluationUpdates.push(input) },
  };
  const releaseTransaction = {
    $queryRaw: async () => [],
    accountAssignment: { findFirst: async () => null },
  };

  const monitoringJob = {
    findFirst: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      job = { id: "monitoring-release-failure-job", ...data, status: "PENDING" };
      return job;
    },
    findUnique: async () => job ? { ...job, account } : null,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      jobUpdates.push(data);
      job = job ? { ...job, ...data } : null;
      return job;
    },
  };
  const jobLockTransaction = {
    $queryRaw: async () => [{ id: account.id }],
    monitoringJob,
  };

  const fakePrisma = {
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
      pipelineTransactionCount += 1;
      if (pipelineTransactionCount === 1) return callback(jobLockTransaction);
      return callback(pipelineTransactionCount === 2 ? persistenceTransaction : releaseTransaction);
    },
    mT5Account: {
      findUnique: async () => account,
      update: async (input: Record<string, unknown>) => {
        accountUpdates.push(input);
        return account;
      },
    },
    monitoringJob,
    evaluation: {
      update: async (input: Record<string, unknown>) => evaluationUpdates.push(input),
    },
  } as unknown as PrismaClient;

  const runner = new MonitoringRunner(fakePrisma, {
    workerId: "release-failure-test",
    workerTimeoutMs: 1000,
    workerMaxAttempts: 1,
    schedulerMaxConcurrent: 1,
    schedulerRetryBaseDelayMs: 1,
    schedulerMaxDelayMs: 1,
    schedulerRetryMultiplier: 1,
  }, new BreachSnapshotAdapter());

  const result = await runner.runAccount(account.id, "test", false);

  assert.equal(result.success, false);
  assert.equal(result.errorCategory, "EVALUATION_RELEASE_FAILED");
  assert.equal(jobUpdates.some((update) => update.status === "FAILED"), true);
  assert.equal(jobUpdates.some((update) => update.status === "COMPLETED"), false);
  assert.equal(evaluationUpdates.length, 0);
  assert.equal(accountUpdates.some((update) => {
    const data = update.data as Record<string, unknown> | undefined;
    return data?.currentMonitoringResult === "FAILED";
  }), true);
});
