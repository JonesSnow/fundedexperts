import { describe, it, beforeEach, after, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  createJobSafe,
  completeJob,
  failJob,
  timeoutJob,
  cancelJob,
  findStaleJobs,
  recoverJob,
  recoverAllStaleJobs,
  updateMonitoringState,
  claimJob,
} from "../../lib/monitoring/monitoring-job";
import {
  DEFAULT_GRACE_PERIOD_MS,
  DEFAULT_TIMEOUT_MS,
  computeLeaseExpiry,
  isJobActive,
  isJobStale,
} from "../../lib/monitoring/repository";
import { runCleanupSteps, assertCleanup, type CleanupResult } from "../../lib/cleanup-helper";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});
const RUN_ID = Date.now().toString(36);
const TEST_ACCOUNT_ID = `acc-monitoring-${RUN_ID}`;
const CONNECTION_RETRY_MS = 2000;
const CONNECTION_MAX_RETRIES = 5;

async function connectWithRetry(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CONNECTION_MAX_RETRIES; attempt++) {
    try {
      await prisma.$connect();
      const health = await prisma.$queryRaw<{ result: string }[]>`SELECT 1 as result`;
      if (health.length > 0) {
        console.log(`[persistence] Connected to database (attempt ${attempt})`);
        return;
      }
    } catch (e) {
      lastError = e;
      console.warn(`[persistence] Connection attempt ${attempt}/${CONNECTION_MAX_RETRIES} failed: ${e instanceof Error ? e.message : String(e)}`);
      if (attempt < CONNECTION_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, CONNECTION_RETRY_MS * attempt));
      }
    }
  }
  throw new Error(`[persistence] Failed to connect after ${CONNECTION_MAX_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function createTestAccount(): Promise<void> {
  await prisma.mT5Account.upsert({
    where: { id: TEST_ACCOUNT_ID },
    update: {},
    create: {
      id: TEST_ACCOUNT_ID,
      accountNumber: "80012345",
      broker: "XM",
      server: "Server-XM",
      login: "12345678",
      status: "IN_USE",
      credentials: "encrypted-test-credentials",
    },
  });
}

async function cleanupData(): Promise<CleanupResult> {
  const steps = [
    { label: "monitoringJob.deleteMany", fn: () => prisma.monitoringJob.deleteMany({ where: { accountId: TEST_ACCOUNT_ID } }) },
    { label: "mT5Account.deleteMany", fn: () => prisma.mT5Account.deleteMany({ where: { id: TEST_ACCOUNT_ID } }) },
  ];
  return runCleanupSteps(prisma, steps);
}

before(async () => {
  await connectWithRetry();
});

after(async () => {
  await prisma.$disconnect();
});

describe("MonitoringJob Schema", () => {
  beforeEach(async () => {
    await createTestAccount();
  });

  afterEach(async () => {
    const result = await cleanupData();
    assertCleanup(result, "persistence afterEach");
  });

  it("should create a monitoring job with all required fields", async () => {
    const result = await createJobSafe(prisma, {
      accountId: TEST_ACCOUNT_ID,
      workerId: "worker-1",
      timeoutMs: 5000,
    });

    assert.equal(result.duplicate, false);
    assert.ok(result.job.id);
    assert.ok(result.job.jobId);
    assert.equal(result.job.accountId, TEST_ACCOUNT_ID);
    assert.equal(result.job.status, "PENDING");
    assert.equal(result.job.workerId, "worker-1");
    assert.equal(result.job.attempt, 1);
    assert.equal(result.job.timeoutMs, 5000);
    assert.equal(result.job.retryable, false);
    assert.equal(result.job.errorCode, null);
    assert.equal(result.job.errorMessage, null);
    assert.equal(result.job.startedAt, null);
    assert.equal(result.job.completedAt, null);
    assert.equal(result.job.leaseExpiry, null);
    assert.ok(result.job.createdAt instanceof Date);
    assert.ok(result.job.updatedAt instanceof Date);
  });

  it("should enforce unique jobId constraint", async () => {
    await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-1" });
    const result2 = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-2" });
    assert.equal(result2.duplicate, true);
  });

  it("should prevent duplicate PENDING jobs for same account", async () => {
    const result1 = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-1" });
    assert.equal(result1.duplicate, false);

    const result2 = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-2" });
    assert.equal(result2.duplicate, true);
  });

  it("should prevent duplicate RUNNING jobs for same account", async () => {
    await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-1" });

    const job = await prisma.monitoringJob.findFirst({
      where: { accountId: TEST_ACCOUNT_ID, status: "PENDING" },
    });
    assert.ok(job);

    await prisma.monitoringJob.update({
      where: { id: job.id },
      data: { status: "RUNNING" },
    });

    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-3" });
    assert.equal(result.duplicate, true);
    assert.equal(result.job.status, "RUNNING");
  });

  it("should allow new job after PENDING job completes", async () => {
    const result1 = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-1" });
    assert.equal(result1.duplicate, false);

    const job = await prisma.monitoringJob.findFirst({
      where: { accountId: TEST_ACCOUNT_ID, status: "PENDING" },
    });
    assert.ok(job);

    await prisma.monitoringJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const result2 = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-2" });
    assert.equal(result2.duplicate, false);
  });

  it("should allow new job after FAILED job", async () => {
    const result1 = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-1" });
    assert.equal(result1.duplicate, false);

    const job = await prisma.monitoringJob.findFirst({
      where: { accountId: TEST_ACCOUNT_ID, status: "PENDING" },
    });
    assert.ok(job);

    await failJob(prisma, job.id, "TEST_ERROR", "Test error", true);

    const result2 = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-2" });
    assert.equal(result2.duplicate, false);
  });

  it("should allow new job after CANCELLED job", async () => {
    const result1 = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-1" });
    assert.equal(result1.duplicate, false);

    const job = await prisma.monitoringJob.findFirst({
      where: { accountId: TEST_ACCOUNT_ID, status: "PENDING" },
    });
    assert.ok(job);

    await cancelJob(prisma, job.id);

    const result2 = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-2" });
    assert.equal(result2.duplicate, false);
  });

  it("should store no credential fields in MonitoringJob", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "worker-1" });

    const job = await prisma.monitoringJob.findUnique({ where: { id: result.job.id } });
    assert.ok(job);

    const jobJson = JSON.stringify(job);
    assert.ok(!jobJson.includes("password"));
    assert.ok(!jobJson.includes("credentials"));
    assert.ok(!jobJson.includes("secret"));
    assert.ok(!jobJson.includes("encryption"));
  });
});

describe("MonitoringJob Lifecycle", () => {
  beforeEach(async () => {
    await createTestAccount();
  });

  afterEach(async () => {
    const result = await cleanupData();
    assertCleanup(result, "persistence afterEach");
  });

  it("should complete a PENDING job", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    const job = await completeJob(prisma, result.job.id);
    assert.ok(job);
    assert.equal(job.status, "COMPLETED");
    assert.ok(job.completedAt instanceof Date);
    assert.equal(job.leaseExpiry, null);
  });

  it("should timeout a PENDING job", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    const job = await timeoutJob(prisma, result.job.id);
    assert.ok(job);
    assert.equal(job.status, "TIMEOUT");
    assert.equal(job.errorCode, "TIMEOUT");
  });

  it("should fail a PENDING job", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    const job = await failJob(prisma, result.job.id, "ERROR_CODE", "Error message", true);
    assert.ok(job);
    assert.equal(job.status, "FAILED");
    assert.equal(job.errorCode, "ERROR_CODE");
    assert.equal(job.retryable, true);
  });

  it("should cancel a PENDING job", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    const job = await cancelJob(prisma, result.job.id);
    assert.ok(job);
    assert.equal(job.status, "CANCELLED");
  });

  it("should reject completing an already-completed job", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    await completeJob(prisma, result.job.id);
    const job = await completeJob(prisma, result.job.id);
    assert.equal(job?.status, "COMPLETED");
  });
});

describe("Lease and Claiming", () => {
  beforeEach(async () => {
    await createTestAccount();
  });

  afterEach(async () => {
    const result = await cleanupData();
    assertCleanup(result, "persistence afterEach");
  });

  it("should claim a pending job atomically", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    const claim = await claimJob(prisma, result.job.id, "worker-A");
    assert.equal(claim.claimed, true);
    assert.ok(claim.job);
    assert.equal(claim.job!.status, "RUNNING");
    assert.equal(claim.job!.workerId, "worker-A");
    assert.ok(claim.job!.startedAt instanceof Date);
    assert.ok(claim.job!.leaseExpiry instanceof Date);
  });

  it("should reject claim by another worker", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    const claim1 = await claimJob(prisma, result.job.id, "worker-A");
    assert.equal(claim1.claimed, true);

    const claim2 = await claimJob(prisma, result.job.id, "worker-B");
    assert.equal(claim2.claimed, false);
    assert.ok(claim2.job);
    assert.equal(claim2.job!.status, "RUNNING");
    assert.equal(claim2.job!.workerId, "worker-A");
  });

  it("should reject claiming a completed job", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    await completeJob(prisma, result.job.id);
    const claim = await claimJob(prisma, result.job.id, "worker-A");
    assert.equal(claim.claimed, false);
    assert.ok(!claim.job);
  });

  it("should set lease expiry in the future", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1", timeoutMs: 5000 });
    await claimJob(prisma, result.job.id, "worker-A");
    const job = await prisma.monitoringJob.findFirst({ where: { id: result.job.id } });
    assert.ok(job);
    assert.ok(job!.leaseExpiry instanceof Date);
    assert.ok(job!.leaseExpiry > new Date());
  });
});

describe("Stale Job Recovery", () => {
  beforeEach(async () => {
    await createTestAccount();
  });

  afterEach(async () => {
    const result = await cleanupData();
    assertCleanup(result, "persistence afterEach");
  });

  it("unexpired running job should NOT be recovered", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    const claim = await claimJob(prisma, result.job.id, "worker-A");
    assert.ok(claim.job);

    const staleJobs = await findStaleJobs(prisma);
    const found = staleJobs.some((j) => j.id === claim.job!.id);
    assert.equal(found, false);
  });

  it("expired running job should be recoverable", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    await claimJob(prisma, result.job.id, "worker-A");
    const job = await prisma.monitoringJob.findUnique({ where: { id: result.job.id } });
    assert.ok(job);

    const expiredDate = new Date(Date.now() - DEFAULT_TIMEOUT_MS - DEFAULT_GRACE_PERIOD_MS - 1000);
    await prisma.monitoringJob.update({
      where: { id: job.id },
      data: { leaseExpiry: expiredDate },
    });

    const staleJobs = await findStaleJobs(prisma);
    const found = staleJobs.some((j) => j.id === job.id);
    assert.equal(found, true);

    const recovered = await recoverJob(prisma, job.id, "recovery-worker");
    assert.ok(recovered);
    assert.equal(recovered.status, "FAILED");
    assert.equal(recovered.errorCode, "LEASE_EXPIRED");
  });

  it("concurrent recovery should not duplicate work", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    await claimJob(prisma, result.job.id, "worker-A");
    const job = await prisma.monitoringJob.findUnique({ where: { id: result.job.id } });
    assert.ok(job);

    const expiredDate = new Date(Date.now() - DEFAULT_TIMEOUT_MS - DEFAULT_GRACE_PERIOD_MS - 1000);
    await prisma.monitoringJob.update({
      where: { id: job.id },
      data: { leaseExpiry: expiredDate },
    });

    const recovered1 = await recoverJob(prisma, job.id, "recovery-worker-1");
    assert.ok(recovered1);
    assert.equal(recovered1.status, "FAILED");

    const recovered2 = await recoverJob(prisma, job.id, "recovery-worker-2");
    assert.ok(!recovered2);
  });

  it("recovered job should have bounded retry count", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    await claimJob(prisma, result.job.id, "worker-A");
    const job = await prisma.monitoringJob.findUnique({ where: { id: result.job.id } });
    assert.ok(job);

    const expiredDate = new Date(Date.now() - DEFAULT_TIMEOUT_MS - DEFAULT_GRACE_PERIOD_MS - 1000);
    await prisma.monitoringJob.update({
      where: { id: job.id },
      data: { leaseExpiry: expiredDate },
    });

    const recovered = await recoverJob(prisma, job.id, "recovery-worker");
    assert.ok(recovered);
    assert.equal(recovered.attempt, 1);
  });

  it("recovery should be auditable", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    await claimJob(prisma, result.job.id, "worker-A");
    const job = await prisma.monitoringJob.findUnique({ where: { id: result.job.id } });
    assert.ok(job);

    const expiredDate = new Date(Date.now() - DEFAULT_TIMEOUT_MS - DEFAULT_GRACE_PERIOD_MS - 1000);
    await prisma.monitoringJob.update({
      where: { id: job.id },
      data: { leaseExpiry: expiredDate },
    });

    const recovered = await recoverJob(prisma, job.id, "recovery-worker");
    assert.ok(recovered);
    assert.equal(recovered.workerId, "recovery-worker");
    assert.ok(recovered.errorMessage?.includes("recovery-worker"));
  });

  it("should not recover a fresh job", async () => {
    const r = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    await claimJob(prisma, r.job.id, "worker-A");

    const staleJobs = await findStaleJobs(prisma);
    assert.equal(staleJobs.length, 0);
  });

  it("recoverAllStaleJobs should return accurate count", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    await claimJob(prisma, result.job.id, "worker-A");
    const job = await prisma.monitoringJob.findUnique({ where: { id: result.job.id } });
    assert.ok(job);

    const expiredDate = new Date(Date.now() - DEFAULT_TIMEOUT_MS - DEFAULT_GRACE_PERIOD_MS - 1000);
    await prisma.monitoringJob.update({
      where: { id: job.id },
      data: { leaseExpiry: expiredDate },
    });

    const recovery = await recoverAllStaleJobs(prisma, "batch-recovery");
    assert.equal(recovery.recovered, 1);
    assert.equal(recovery.errors.length, 0);
  });
});

describe("Monitoring State", () => {
  beforeEach(async () => {
    await createTestAccount();
  });

  afterEach(async () => {
    const result = await cleanupData();
    assertCleanup(result, "persistence afterEach");
  });

  it("should update monitoring state after successful job", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    await completeJob(prisma, result.job.id);
    await updateMonitoringState(prisma, TEST_ACCOUNT_ID, "SUCCEEDED");

    const account = await prisma.mT5Account.findUnique({ where: { id: TEST_ACCOUNT_ID } });
    assert.ok(account);
    assert.equal(account.currentMonitoringResult, "SUCCEEDED");
    assert.ok(account.lastMonitoringAt instanceof Date);
  });

  it("should update monitoring state after failed job", async () => {
    const result = await createJobSafe(prisma, { accountId: TEST_ACCOUNT_ID, workerId: "w1" });
    await failJob(prisma, result.job.id, "ERROR", "Error", true);
    await updateMonitoringState(prisma, TEST_ACCOUNT_ID, "FAILED");

    const account = await prisma.mT5Account.findUnique({ where: { id: TEST_ACCOUNT_ID } });
    assert.ok(account);
    assert.equal(account.currentMonitoringResult, "FAILED");
  });
});

describe("Helper Functions", () => {
  it("isJobActive should return true for PENDING and RUNNING", () => {
    assert.equal(isJobActive("PENDING"), true);
    assert.equal(isJobActive("RUNNING"), true);
    assert.equal(isJobActive("COMPLETED"), false);
    assert.equal(isJobActive("FAILED"), false);
    assert.equal(isJobActive("TIMEOUT"), false);
    assert.equal(isJobActive("CANCELLED"), false);
  });

  it("isJobStale should return false for non-running jobs", () => {
    assert.equal(isJobStale({ status: "PENDING", leaseExpiry: null }), false);
    assert.equal(isJobStale({ status: "COMPLETED", leaseExpiry: new Date() }), false);
    assert.equal(isJobStale({ status: "FAILED", leaseExpiry: new Date() }), false);
  });

  it("isJobStale should return false for valid lease", () => {
    const futureDate = new Date(Date.now() + 600000);
    assert.equal(isJobStale({ status: "RUNNING", leaseExpiry: futureDate }), false);
  });

  it("isJobStale should return true for expired lease", () => {
    const pastDate = new Date(Date.now() - 600000);
    assert.equal(isJobStale({ status: "RUNNING", leaseExpiry: pastDate }), true);
  });

  it("isJobStale should return false if leaseExpiry is null", () => {
    assert.equal(isJobStale({ status: "RUNNING", leaseExpiry: null }), false);
  });

  it("computeLeaseExpiry should be future-dated", () => {
    const now = new Date();
    const lease = computeLeaseExpiry(now, 5000);
    assert.ok(lease > now);
    assert.equal(lease.getTime() - now.getTime(), 5000 + DEFAULT_GRACE_PERIOD_MS);
  });
});
