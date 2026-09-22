import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Scheduler } from "../../lib/monitoring/scheduler";

function defaultConfig() {
  return {
    maxConcurrentJobs: 2,
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      multiplier: 2,
    },
  };
}

describe("Scheduler", () => {
  describe("constructor", () => {
    it("initializes with empty queue", () => {
      const scheduler = new Scheduler(defaultConfig());
      assert.strictEqual(scheduler.getQueue().length, 0);
      assert.strictEqual(scheduler.getActiveJobs().length, 0);
      assert.strictEqual(scheduler.getCompletedJobs().length, 0);
      assert.strictEqual(scheduler.getFailedJobs().length, 0);
    });
  });

  describe("schedule", () => {
    it("adds job to queue", () => {
      const scheduler = new Scheduler(defaultConfig());
      const result = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" });
      assert.strictEqual(result.queued, true);
      assert.strictEqual(scheduler.getQueue().length, 1);
      assert.strictEqual(result.job.accountId, "acc-1");
      assert.strictEqual(result.job.status, "PENDING");
      assert.ok(result.scheduleId.startsWith("schedule-"));
      assert.ok(result.job.jobId.startsWith("job-"));
    });

    it("assigns correct workerId", () => {
      const scheduler = new Scheduler(defaultConfig());
      const result = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" });
      assert.strictEqual(result.job.workerId, "w-1");
    });

    it("uses default timeoutMs", () => {
      const scheduler = new Scheduler(defaultConfig());
      const result = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" });
      assert.strictEqual(result.job.timeoutMs, 10000);
    });

    it("uses provided timeoutMs", () => {
      const scheduler = new Scheduler(defaultConfig());
      const result = scheduler.schedule({ accountId: "acc-1", workerId: "w-1", timeoutMs: 5000 });
      assert.strictEqual(result.job.timeoutMs, 5000);
    });

    it("increments totalScheduled", () => {
      const scheduler = new Scheduler(defaultConfig());
      scheduler.schedule({ accountId: "acc-1", workerId: "w-1" });
      scheduler.schedule({ accountId: "acc-2", workerId: "w-1" });
      assert.strictEqual(scheduler.getStatus().totalScheduled, 2);
    });

    it("generates unique scheduleIds", () => {
      const scheduler = new Scheduler(defaultConfig());
      const r1 = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" });
      const r2 = scheduler.schedule({ accountId: "acc-2", workerId: "w-1" });
      assert.notStrictEqual(r1.scheduleId, r2.scheduleId);
    });
  });

  describe("getStatus", () => {
    it("returns correct initial status", () => {
      const scheduler = new Scheduler(defaultConfig());
      const status = scheduler.getStatus();
      assert.strictEqual(status.isRunning, false);
      assert.strictEqual(status.queueLength, 0);
      assert.strictEqual(status.activeJobCount, 0);
      assert.strictEqual(status.maxConcurrentJobs, 2);
      assert.strictEqual(status.totalScheduled, 0);
      assert.strictEqual(status.totalCompleted, 0);
      assert.strictEqual(status.totalFailed, 0);
    });
  });

  describe("start/stop", () => {
    it("starts the scheduler", () => {
      const scheduler = new Scheduler(defaultConfig());
      scheduler.start();
      assert.strictEqual(scheduler.getStatus().isRunning, true);
    });

    it("stops the scheduler", () => {
      const scheduler = new Scheduler(defaultConfig());
      scheduler.start();
      scheduler.stop();
      assert.strictEqual(scheduler.getStatus().isRunning, false);
    });

    it("does not restart when already running", () => {
      const scheduler = new Scheduler(defaultConfig());
      scheduler.start();
      scheduler.start();
      assert.strictEqual(scheduler.getStatus().isRunning, true);
    });
  });

  describe("isQueueEmpty", () => {
    it("returns true for empty queue", () => {
      const scheduler = new Scheduler(defaultConfig());
      assert.strictEqual(scheduler.isQueueEmpty(), true);
    });

    it("returns false when queue has jobs", () => {
      const scheduler = new Scheduler(defaultConfig());
      scheduler.schedule({ accountId: "acc-1", workerId: "w-1" });
      assert.strictEqual(scheduler.isQueueEmpty(), false);
    });
  });

  describe("getNextJob", () => {
    it("returns null when queue is empty", () => {
      const scheduler = new Scheduler(defaultConfig());
      assert.strictEqual(scheduler.getNextJob(), null);
    });

    it("returns next job from queue", () => {
      const scheduler = new Scheduler(defaultConfig());
      scheduler.schedule({ accountId: "acc-1", workerId: "w-1" });
      const job = scheduler.getNextJob();
      assert.ok(job !== null);
      assert.strictEqual(job!.accountId, "acc-1");
      assert.strictEqual(scheduler.getQueue().length, 0);
    });

    it("returns null when at max concurrent", () => {
      const scheduler = new Scheduler(defaultConfig());
      scheduler.schedule({ accountId: "acc-1", workerId: "w-1" });
      scheduler.schedule({ accountId: "acc-2", workerId: "w-1" });
      scheduler.schedule({ accountId: "acc-3", workerId: "w-1" });
      scheduler.activateJob(scheduler.getNextJob()!);
      scheduler.activateJob(scheduler.getNextJob()!);
      const next = scheduler.getNextJob();
      assert.strictEqual(next, null);
    });
  });

  describe("activateJob", () => {
    it("moves job to active jobs", () => {
      const scheduler = new Scheduler(defaultConfig());
      const job = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" }).job;
      scheduler.activateJob(job);
      assert.strictEqual(scheduler.getActiveJobs().length, 1);
      assert.strictEqual(scheduler.getActiveJobs()[0].status, "RUNNING");
      assert.ok(scheduler.getActiveJobs()[0].startedAt instanceof Date);
    });
  });

  describe("completeJob", () => {
    it("moves job to completed", () => {
      const scheduler = new Scheduler(defaultConfig());
      const job = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" }).job;
      scheduler.activateJob(job);
      scheduler.completeJob(job.jobId);
      assert.strictEqual(scheduler.getCompletedJobs().length, 1);
      assert.strictEqual(scheduler.getActiveJobs().length, 0);
      assert.strictEqual(scheduler.getStatus().totalCompleted, 1);
    });

    it("ignores unknown jobId", () => {
      const scheduler = new Scheduler(defaultConfig());
      scheduler.completeJob("nonexistent");
      assert.strictEqual(scheduler.getStatus().totalCompleted, 0);
    });
  });

  describe("failJob", () => {
    it("moves job to failed", () => {
      const scheduler = new Scheduler(defaultConfig());
      const job = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" }).job;
      scheduler.activateJob(job);
      scheduler.failJob(job.jobId, "TIMEOUT", "Timed out");
      assert.strictEqual(scheduler.getFailedJobs().length, 1);
      assert.strictEqual(scheduler.getStatus().totalFailed, 1);
    });

    it("sets retryable based on attempt count", () => {
      const scheduler = new Scheduler(defaultConfig());
      const job = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" }).job;
      scheduler.activateJob(job);
      scheduler.failJob(job.jobId, "TIMEOUT", "Timed out");
      const failed = scheduler.getFailedJobs()[0];
      assert.strictEqual(failed.retryable, true);
    });
  });

  describe("getRetryableJobs", () => {
    it("returns jobs that can be retried", () => {
      const scheduler = new Scheduler(defaultConfig());
      const job = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" }).job;
      scheduler.activateJob(job);
      scheduler.failJob(job.jobId, "TIMEOUT", "Timed out");
      const retryable = scheduler.getRetryableJobs();
      assert.strictEqual(retryable.length, 1);
    });

    it("excludes non-retryable jobs", () => {
      const scheduler = new Scheduler(defaultConfig());
      const job = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" }).job;
      scheduler.activateJob(job);
      job.attempt = 3;
      scheduler.failJob(job.jobId, "INELIGIBLE", "Ineligible");
      const retryable = scheduler.getRetryableJobs();
      assert.strictEqual(retryable.length, 0);
    });
  });

  describe("requeueJob", () => {
    it("moves failed job back to queue", () => {
      const scheduler = new Scheduler(defaultConfig());
      const job = scheduler.schedule({ accountId: "acc-1", workerId: "w-1" }).job;
      scheduler.activateJob(job);
      scheduler.failJob(job.jobId, "TIMEOUT", "Timed out");
      const requeued = scheduler.requeueJob(job.jobId);
      assert.ok(requeued !== null);
      assert.strictEqual(requeued!.status, "PENDING");
      assert.strictEqual(requeued!.attempt, 2);
      assert.strictEqual(scheduler.getQueue().length, 1);
      assert.strictEqual(scheduler.getFailedJobs().length, 0);
    });

    it("returns null for unknown jobId", () => {
      const scheduler = new Scheduler(defaultConfig());
      const result = scheduler.requeueJob("nonexistent");
      assert.strictEqual(result, null);
    });
  });

  describe("getDelayForAttempt", () => {
    it("returns base delay for first attempt", () => {
      const scheduler = new Scheduler(defaultConfig());
      assert.strictEqual(scheduler.getDelayForAttempt(1), 1000);
    });

    it("applies multiplier", () => {
      const scheduler = new Scheduler(defaultConfig());
      assert.strictEqual(scheduler.getDelayForAttempt(2), 2000);
      assert.strictEqual(scheduler.getDelayForAttempt(3), 4000);
    });

    it("caps at maxDelayMs", () => {
      const scheduler = new Scheduler(defaultConfig());
      assert.strictEqual(scheduler.getDelayForAttempt(10), 10000);
    });
  });
});
