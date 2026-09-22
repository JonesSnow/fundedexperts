import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createJob, markRunning, markCompleted, markFailed, markTimeout, markCancelled, isRetryable, type MonitoringJob, type JobStatus, type CreateJobInput } from "../../lib/monitoring/job";

function baseInput(): CreateJobInput {
  return { accountId: "acc-001", workerId: "worker-1", timeoutMs: 10000 };
}

describe("createJob", () => {
  it("creates a job with PENDING status", () => {
    const job = createJob(baseInput());
    assert.strictEqual(job.status, "PENDING");
    assert.strictEqual(job.accountId, "acc-001");
    assert.strictEqual(job.workerId, "worker-1");
    assert.strictEqual(job.attempt, 1);
    assert.ok(job.createdAt instanceof Date);
    assert.strictEqual(job.startedAt, null);
    assert.strictEqual(job.completedAt, null);
    assert.strictEqual(job.timeoutMs, 10000);
    assert.strictEqual(job.retryable, false);
    assert.strictEqual(job.errorCode, null);
    assert.strictEqual(job.errorMessage, null);
  });

  it("generates a unique jobId", () => {
    const job1 = createJob(baseInput());
    const job2 = createJob(baseInput());
    assert.notStrictEqual(job1.jobId, job2.jobId);
  });

  it("jobId contains accountId", () => {
    const job = createJob(baseInput());
    assert.match(job.jobId, /acc-001/);
  });

  it("uses default timeoutMs when not provided", () => {
    const job = createJob({ accountId: "acc", workerId: "w" });
    assert.strictEqual(job.timeoutMs, 10000);
  });
});

describe("markRunning", () => {
  it("sets status to RUNNING and records startedAt", () => {
    const job = createJob(baseInput());
    const running = markRunning(job);
    assert.strictEqual(running.status, "RUNNING");
    assert.ok(running.startedAt instanceof Date);
    assert.strictEqual(running.completedAt, null);
    assert.strictEqual(running.errorCode, null);
    assert.strictEqual(running.errorMessage, null);
  });

  it("does not mutate original job", () => {
    const job = createJob(baseInput());
    markRunning(job);
    assert.strictEqual(job.status, "PENDING");
    assert.strictEqual(job.startedAt, null);
  });
});

describe("markCompleted", () => {
  it("sets status to COMPLETED and records completedAt", () => {
    const job = markRunning(createJob(baseInput()));
    const completed = markCompleted(job);
    assert.strictEqual(completed.status, "COMPLETED");
    assert.ok(completed.completedAt instanceof Date);
  });
});

describe("markFailed", () => {
  it("sets status to FAILED with error details", () => {
    const job = createJob(baseInput());
    const failed = markFailed(job, "TIMEOUT", "Connection timed out");
    assert.strictEqual(failed.status, "FAILED");
    assert.strictEqual(failed.errorCode, "TIMEOUT");
    assert.strictEqual(failed.errorMessage, "Connection timed out");
    assert.ok(failed.completedAt instanceof Date);
    assert.strictEqual(failed.retryable, false);
  });

  it("supports retryable flag", () => {
    const job = createJob(baseInput());
    const failed = markFailed(job, "TIMEOUT", "Timeout", true);
    assert.strictEqual(failed.retryable, true);
  });

  it("does not mutate original job", () => {
    const job = createJob(baseInput());
    markFailed(job, "ERR", "msg");
    assert.strictEqual(job.status, "PENDING");
  });
});

describe("markTimeout", () => {
  it("sets status to TIMEOUT with TIMEOUT error code", () => {
    const job = createJob(baseInput());
    const timedOut = markTimeout(job);
    assert.strictEqual(timedOut.status, "TIMEOUT");
    assert.strictEqual(timedOut.errorCode, "TIMEOUT");
    assert.ok(timedOut.completedAt instanceof Date);
  });
});

describe("markCancelled", () => {
  it("sets status to CANCELLED", () => {
    const job = createJob(baseInput());
    const cancelled = markCancelled(job);
    assert.strictEqual(cancelled.status, "CANCELLED");
    assert.ok(cancelled.completedAt instanceof Date);
  });
});

describe("isRetryable", () => {
  it("returns false for non-retryable failed jobs", () => {
    const job = markFailed(createJob(baseInput()), "INELIGIBLE", "Not eligible");
    assert.strictEqual(isRetryable(job), false);
  });

  it("returns true for retryable failed jobs", () => {
    const job = markFailed(createJob(baseInput()), "TIMEOUT", "Timeout", true);
    assert.strictEqual(isRetryable(job), true);
  });

  it("returns false for non-FAILED jobs", () => {
    const job = markRunning(createJob(baseInput()));
    assert.strictEqual(isRetryable(job), false);
  });
});

describe("all statuses", () => {
  it("has all expected JobStatus values", () => {
    const statuses: JobStatus[] = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "TIMEOUT", "CANCELLED"];
    assert.strictEqual(statuses.length, 6);
  });
});
