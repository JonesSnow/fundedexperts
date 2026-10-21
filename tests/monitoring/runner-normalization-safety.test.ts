import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { MonitoringRunner } from "../../lib/monitoring/monitoring-runner";
import { MT5Adapter } from "../../lib/monitoring/adapter";
import type { ProviderName, ProviderSnapshot } from "../../lib/monitoring/types";

type MonitoringAccountFixture = {
  id: string;
  accountNumber: string;
  login: string | null;
  server: string | null;
  credentials: string | null;
};

function createFakePrisma(account: MonitoringAccountFixture) {
  const jobUpdates: Array<Record<string, unknown>> = [];
  const accountUpdates: Array<Record<string, unknown>> = [];
  let savedJob: Record<string, unknown> | null = null;

  const monitoringJob = {
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
  };
  const prisma = {
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({
      $queryRaw: async () => [{ id: account.id }],
      monitoringJob,
    }),
    monitoringJob,
    mT5Account: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        accountUpdates.push(data);
        return { ...account, ...data };
      },
    },
  } as unknown as PrismaClient;

  return { prisma, jobUpdates, accountUpdates };
}

class MissingAccountInfoAdapter extends MT5Adapter {
  readonly providerName: ProviderName = "MT5";

  constructor(private readonly onFetch: () => void = () => {}) {
    super();
  }

  async fetchSnapshot(): Promise<ProviderSnapshot> {
    this.onFetch();
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
  const account = {
    id: "monitoring-test-account",
    accountNumber: "123456",
    login: "123456",
    server: "mock-server",
    credentials: "opaque-test-credential-envelope",
  };
  const { prisma, jobUpdates, accountUpdates } = createFakePrisma(account);

  const runner = new MonitoringRunner(
    prisma,
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

test("monitoring runner fails closed without per-account credentials and does not call the adapter", async () => {
  const account = {
    id: "monitoring-missing-credentials-account",
    accountNumber: "123456",
    login: null,
    server: null,
    credentials: null,
  };
  const { prisma, jobUpdates, accountUpdates } = createFakePrisma(account);
  let adapterCalls = 0;
  const runner = new MonitoringRunner(
    prisma,
    {
      workerId: "missing-credentials-safety-test",
      workerTimeoutMs: 20,
      workerMaxAttempts: 1,
      schedulerMaxConcurrent: 1,
      schedulerRetryBaseDelayMs: 1,
      schedulerMaxDelayMs: 1,
      schedulerRetryMultiplier: 1,
    },
    new MissingAccountInfoAdapter(() => { adapterCalls += 1; }),
  );

  const previousMasterPassword = process.env.MT5_MASTER_PASSWORD;
  process.env.MT5_MASTER_PASSWORD = "unit-test-only-value";
  try {
    const result = await runner.runAccount(account.id, "test", false);

    assert.equal(result.success, false);
    assert.equal(result.errorCategory, "CREDENTIALS_UNAVAILABLE");
    assert.equal(adapterCalls, 0);
    assert.ok(jobUpdates.some((update) => update.errorCode === "CREDENTIALS_UNAVAILABLE"));
    assert.ok(accountUpdates.some((update) => update.currentMonitoringResult === "FAILED"));
  } finally {
    if (previousMasterPassword === undefined) delete process.env.MT5_MASTER_PASSWORD;
    else process.env.MT5_MASTER_PASSWORD = previousMasterPassword;
  }
});

test("monitoring runner refuses accounts without an explicit inventory server", async () => {
  const account = {
    id: "monitoring-missing-server-account",
    accountNumber: "123456",
    login: "123456",
    server: null,
    credentials: "opaque-test-credential-envelope",
  };
  const { prisma, jobUpdates, accountUpdates } = createFakePrisma(account);
  let adapterCalls = 0;
  const runner = new MonitoringRunner(
    prisma,
    {
      workerId: "missing-server-safety-test",
      workerTimeoutMs: 20,
      workerMaxAttempts: 1,
      schedulerMaxConcurrent: 1,
      schedulerRetryBaseDelayMs: 1,
      schedulerMaxDelayMs: 1,
      schedulerRetryMultiplier: 1,
    },
    new MissingAccountInfoAdapter(() => { adapterCalls += 1; }),
  );

  const result = await runner.runAccount(account.id, "test", false);

  assert.equal(result.success, false);
  assert.equal(result.errorCategory, "CREDENTIALS_UNAVAILABLE");
  assert.equal(adapterCalls, 0);
  assert.ok(jobUpdates.some((update) => update.errorCode === "CREDENTIALS_UNAVAILABLE"));
  assert.ok(accountUpdates.some((update) => update.currentMonitoringResult === "FAILED"));
});
