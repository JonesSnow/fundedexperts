import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { MonitoringRunner } from "../../lib/monitoring/monitoring-runner";
import { MT5Adapter } from "../../lib/monitoring/adapter";
import type { ProviderName, ProviderSnapshot } from "../../lib/monitoring/types";

class MissingAccountInfoAdapter extends MT5Adapter {
  readonly providerName: ProviderName = "MT5";

  async fetchSnapshot(): Promise<ProviderSnapshot> {
    return {
      accountInfo: null,
      positions: [],
      orders: [],
      history: [],
      terminalInfo: { connected: true, version: "test", build: "test" },
      timestamp: new Date(),
      provider: "MT5",
    };
  }

  async testConnection(): Promise<{ connected: boolean; message: string }> {
    return { connected: true, message: "Mock connection" };
  }

  async disconnect(): Promise<void> {}
}

test("monitoring runner fails a critical normalization result before completing or processing it", async () => {
  const jobUpdates: Array<Record<string, unknown>> = [];
  const accountUpdates: Array<Record<string, unknown>> = [];
  let savedJob: Record<string, unknown> | null = null;
  const account = {
    id: "monitoring-test-account",
    accountNumber: "123456",
    login: null,
    server: null,
    credentials: null,
  };

  const fakePrisma = {
    monitoringJob: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        savedJob = { id: "monitoring-test-job-id", ...data, status: "PENDING" };
        return savedJob;
      },
      findUnique: async () => (savedJob ? { ...savedJob, account } : null),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        jobUpdates.push(data);
        savedJob = savedJob ? { ...savedJob, ...data } : null;
        return savedJob;
      },
    },
    mT5Account: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        accountUpdates.push(data);
        return { ...account, ...data };
      },
    },
  } as unknown as PrismaClient;

  const runner = new MonitoringRunner(
    fakePrisma,
    {
      workerId: "normalization-safety-test",
      workerTimeoutMs: 20,
      workerMaxAttempts: 1,
      schedulerMaxConcurrent: 1,
      schedulerRetryBaseDelayMs: 1,
      schedulerMaxDelayMs: 1,
      schedulerRetryMultiplier: 1,
    },
    new MissingAccountInfoAdapter(),
  );

  const result = await runner.runAccount(account.id, "test", false);

  assert.equal(result.success, false);
  assert.equal(result.errorCategory, "NORMALIZATION_FAILED");
  assert.ok(jobUpdates.some((update) => update.status === "FAILED"));
  assert.equal(jobUpdates.some((update) => update.status === "COMPLETED"), false);
  assert.ok(accountUpdates.some((update) => update.currentMonitoringResult === "FAILED"));
});
