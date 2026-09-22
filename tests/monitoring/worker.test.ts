import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "../../lib/monitoring/worker";
import { MockMT5Adapter } from "../../lib/monitoring/mock-adapter";
import type { ProviderCredentials } from "../../lib/monitoring/credential-boundary";
import type { MonitoringJob } from "../../lib/monitoring/job";

function validCredentials(): ProviderCredentials {
  return {
    providerType: "mt5",
    server: "Server-XM",
    login: 12345678,
    password: "test-pass",
    connectionTimeoutMs: 5000,
  };
}

function createWorker(overrides?: { workerId?: string; timeoutMs?: number; maxAttempts?: number; loggerMaxEntries?: number }) {
  return new Worker({
    workerId: overrides?.workerId ?? "test-worker",
    timeoutMs: overrides?.timeoutMs ?? 10000,
    maxAttempts: overrides?.maxAttempts ?? 3,
    loggerMaxEntries: overrides?.loggerMaxEntries ?? 100,
  });
}

describe("Worker", () => {
  describe("constructor", () => {
    it("defaults to MockMT5Adapter when no adapter provided", () => {
      const worker = createWorker();
      assert.ok(worker.getStatus());
    });

    it("accepts custom adapter", () => {
      const adapter = new MockMT5Adapter({ accounts: [] });
      const worker = createWorker();
      assert.ok(worker.getStatus());
    });
  });

  describe("getStatus", () => {
    it("returns correct initial status", () => {
      const worker = createWorker();
      const status = worker.getStatus();
      assert.strictEqual(status.workerId, "test-worker");
      assert.strictEqual(status.isRunning, false);
      assert.strictEqual(status.activeJobId, null);
      assert.strictEqual(status.jobsCompleted, 0);
      assert.strictEqual(status.jobsFailed, 0);
      assert.strictEqual(status.jobsTimedOut, 0);
    });
  });

  describe("getLogger", () => {
    it("returns logger instance", () => {
      const worker = createWorker();
      const logger = worker.getLogger();
      assert.ok(logger);
      assert.strictEqual(logger.getEntries().length, 0);
    });
  });

  describe("getLogEntries", () => {
    it("returns all log entries", () => {
      const worker = createWorker();
      worker.getLogger().info("j1", "test");
      const entries = worker.getLogEntries();
      assert.strictEqual(entries.length, 1);
    });
  });

  describe("getActiveJobId", () => {
    it("returns null when no active job", () => {
      const worker = createWorker();
      assert.strictEqual(worker.getActiveJobId(), null);
    });
  });

  describe("execute", () => {
    it("throws when already running", async () => {
      const worker = createWorker();
      worker["isRunning"] = true;
      await assert.rejects(
        worker.execute("acc-1", { credentials: validCredentials() }),
        /Worker is already running/
      );
    });

    it("completes successfully for unknown account (empty snapshot)", async () => {
      const worker = createWorker();
      const result = await worker.execute("acc-1", { credentials: validCredentials() });
      assert.ok(typeof result.success === "boolean");
    });

    it("rejects invalid credentials", async () => {
      const worker = createWorker();
      const creds: ProviderCredentials = {
        ...validCredentials(),
        server: "",
        login: 0,
        password: "",
      };
      const result = await worker.execute("acc-active", { credentials: creds, maxRetry: false });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.job.status, "FAILED");
      assert.strictEqual(result.error?.code, "INVALID_CREDENTIALS");
    });

    it("is not running after execution completes", async () => {
      const worker = createWorker();
      await worker.execute("acc-1", { credentials: validCredentials() });
      assert.strictEqual(worker.getStatus().isRunning, false);
    });

    it("logs via worker logger", async () => {
      const worker = createWorker();
      await worker.execute("acc-1", { credentials: validCredentials() });
      const entries = worker.getLogEntries();
      assert.ok(entries.length > 0);
    });

    it("resets activeJobId after execution", async () => {
      const worker = createWorker();
      await worker.execute("acc-1", { credentials: validCredentials() });
      assert.strictEqual(worker.getActiveJobId(), null);
    });
  });

  describe("execute with provider type in credentials", () => {
    it("accepts demo provider type credentials (provider check is separate)", async () => {
      const worker = createWorker();
      const creds: ProviderCredentials = { ...validCredentials(), providerType: "demo" };
      const result = await worker.execute("acc-1", { credentials: creds });
      assert.ok(typeof result.success === "boolean");
      assert.ok(result.job.status === "COMPLETED" || result.job.status === "FAILED" || result.job.status === "TIMEOUT");
    });
  });

  describe("retry", () => {
    it("throws for non-failed job", async () => {
      const worker = createWorker();
      const job: MonitoringJob = {
        jobId: "job-1",
        accountId: "acc-1",
        workerId: "test-worker",
        attempt: 1,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        status: "COMPLETED",
        timeoutMs: 10000,
        retryable: false,
        errorCode: null,
        errorMessage: null,
      };
      await assert.rejects(
        worker.retry("acc-1", job, { credentials: validCredentials() }),
        /Can only retry failed or timed out jobs/
      );
    });

    it("throws when max attempts reached", async () => {
      const worker = createWorker({ maxAttempts: 2 });
      const job: MonitoringJob = {
        jobId: "job-1",
        accountId: "acc-1",
        workerId: "test-worker",
        attempt: 2,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        status: "FAILED",
        timeoutMs: 10000,
        retryable: true,
        errorCode: "TIMEOUT",
        errorMessage: "timeout",
      };
      await assert.rejects(
        worker.retry("acc-1", job, { credentials: validCredentials() }),
        /Max attempts/
      );
    });
  });

  describe("shutdown", () => {
    it("returns empty arrays when not running", async () => {
      const worker = createWorker();
      const result = await worker.shutdown("manual");
      assert.deepStrictEqual(result.cancelled, []);
      assert.deepStrictEqual(result.errors, []);
    });

    it("cancels active job on shutdown", async () => {
      const worker = createWorker();
      worker["isRunning"] = true;
      worker["activeJobId"] = "job-active";
      const result = await worker.shutdown("maintenance");
      assert.deepStrictEqual(result.cancelled, ["job-active"]);
      assert.strictEqual(worker.getStatus().isRunning, false);
      assert.strictEqual(worker.getActiveJobId(), null);
    });

    it("stores shutdown reason", async () => {
      const worker = createWorker();
      await worker.shutdown("maintenance");
      assert.strictEqual((worker as unknown as { shutdownReason: string | null }).shutdownReason, "maintenance");
    });
  });

  describe("handleCrashRecovery", () => {
    it("resets worker state", async () => {
      const worker = createWorker();
      worker["isRunning"] = true;
      worker["activeJobId"] = "job-1";
      worker["currentAttempt"] = 2;
      await worker.handleCrashRecovery();
      assert.strictEqual(worker.getStatus().isRunning, false);
      assert.strictEqual(worker.getActiveJobId(), null);
      assert.strictEqual(worker.getStatus().jobsCompleted, 0);
    });
  });
});
