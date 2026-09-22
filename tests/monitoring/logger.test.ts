import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Logger } from "../../lib/monitoring/logger";

function createLogger(overrides?: { workerId?: string; maxEntries?: number }) {
  return new Logger({
    workerId: overrides?.workerId ?? "test-worker",
    maxEntries: overrides?.maxEntries ?? 100,
  });
}

describe("Logger", () => {
  describe("basic logging", () => {
    it("stores log entries", () => {
      const logger = createLogger();
      logger.info("job-1", "test message");
      const entries = logger.getEntries();
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].message, "test message");
      assert.strictEqual(entries[0].workerId, "test-worker");
      assert.strictEqual(entries[0].jobId, "job-1");
      assert.ok(entries[0].timestamp instanceof Date);
    });

    it("assigns workerId to all entries", () => {
      const logger = createLogger({ workerId: "w-1" });
      logger.debug("j1", "d");
      logger.error("j2", "e", "ERR");
      assert.strictEqual(logger.getEntries()[0].workerId, "w-1");
      assert.strictEqual(logger.getEntries()[1].workerId, "w-1");
    });
  });

  describe("severity levels", () => {
    it("logs debug entries", () => {
      const logger = createLogger();
      logger.debug("j1", "debug msg");
      const entry = logger.getEntries()[0];
      assert.strictEqual(entry.severity, "DEBUG");
      assert.strictEqual(entry.eventType, "DEBUG");
    });

    it("logs info entries", () => {
      const logger = createLogger();
      logger.info("j1", "info msg");
      const entry = logger.getEntries()[0];
      assert.strictEqual(entry.severity, "INFO");
      assert.strictEqual(entry.eventType, "INFO");
    });

    it("logs warn entries", () => {
      const logger = createLogger();
      logger.warn("j1", "warn msg");
      const entry = logger.getEntries()[0];
      assert.strictEqual(entry.severity, "WARN");
      assert.strictEqual(entry.eventType, "WARN");
    });

    it("logs error entries with error code", () => {
      const logger = createLogger();
      logger.error("j1", "error msg", "ERR_CODE");
      const entry = logger.getEntries()[0];
      assert.strictEqual(entry.severity, "ERROR");
      assert.strictEqual(entry.errorCode, "ERR_CODE");
      assert.strictEqual(entry.eventType, "ERROR");
    });

    it("error without code sets errorCode to null", () => {
      const logger = createLogger();
      logger.error("j1", "error msg");
      const entry = logger.getEntries()[0];
      assert.strictEqual(entry.errorCode, null);
    });
  });

  describe("metadata", () => {
    it("stores metadata when provided", () => {
      const logger = createLogger();
      logger.info("j1", "msg", { key: "value" });
      assert.deepStrictEqual(logger.getEntries()[0].metadata, { key: "value" });
    });

    it("metadata is undefined when not provided", () => {
      const logger = createLogger();
      logger.info("j1", "msg");
      assert.strictEqual(logger.getEntries()[0].metadata, undefined);
    });
  });

  describe("filtering", () => {
    it("getEntriesByJobId filters by jobId", () => {
      const logger = createLogger();
      logger.info("job-a", "msg1");
      logger.info("job-b", "msg2");
      logger.info("job-a", "msg3");
      const filtered = logger.getEntriesByJobId("job-a");
      assert.strictEqual(filtered.length, 2);
      assert.strictEqual(filtered[0].jobId, "job-a");
      assert.strictEqual(filtered[1].jobId, "job-a");
    });

    it("getRecentEntries returns last N entries", () => {
      const logger = createLogger();
      logger.info("j1", "1");
      logger.info("j2", "2");
      logger.info("j3", "3");
      const recent = logger.getRecentEntries(2);
      assert.strictEqual(recent.length, 2);
      assert.strictEqual(recent[0].message, "2");
      assert.strictEqual(recent[1].message, "3");
    });
  });

  describe("max entries", () => {
    it("limits entries to maxEntries", () => {
      const logger = createLogger({ maxEntries: 3 });
      logger.info("j1", "1");
      logger.info("j2", "2");
      logger.info("j3", "3");
      logger.info("j4", "4");
      assert.strictEqual(logger.getEntries().length, 3);
      assert.strictEqual(logger.getEntries()[0].message, "2");
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      const logger = createLogger();
      logger.info("j1", "msg");
      logger.clear();
      assert.strictEqual(logger.getEntries().length, 0);
    });
  });

  describe("empty logger", () => {
    it("returns empty array when no entries", () => {
      const logger = createLogger();
      assert.strictEqual(logger.getEntries().length, 0);
      assert.strictEqual(logger.getEntriesByJobId("none").length, 0);
      assert.strictEqual(logger.getRecentEntries(5).length, 0);
    });
  });
});
