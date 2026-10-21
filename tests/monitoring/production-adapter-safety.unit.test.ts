import assert from "node:assert/strict";
import test from "node:test";
import { createMT5Adapter } from "../../lib/monitoring/adapter-factory";
import { MockMT5Adapter } from "../../lib/monitoring/mock-adapter";
import { Worker } from "../../lib/monitoring/worker";

const workerConfig = {
  workerId: "production-adapter-safety-test",
  timeoutMs: 1000,
  maxAttempts: 1,
  loggerMaxEntries: 10,
};

function withEnvironment<T>(
  name: string,
  value: string | undefined,
  work: () => T,
): T {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;

  try {
    return work();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("adapter factory refuses mock mode and mock auto-fallback in production", () => {
  withEnvironment("NODE_ENV", "production", () => {
    withEnvironment("MT5_USE_REAL_ADAPTER", "false", () => {
      assert.throws(() => createMT5Adapter(), /disabled in production/);
      assert.throws(() => createMT5Adapter({ mode: "mock" }), /disabled in production/);
      assert.throws(() => createMT5Adapter({ mode: "auto" }), /disabled in production/);
    });
  });
});

test("worker refuses a default or explicitly injected mock adapter in production", () => {
  withEnvironment("NODE_ENV", "production", () => {
    assert.throws(() => new Worker(workerConfig), /disabled in production/);
    assert.throws(
      () => new Worker(workerConfig, new MockMT5Adapter({ accounts: [] })),
      /disabled in production/,
    );
  });
});

test("mock adapters remain available in non-production environments", () => {
  withEnvironment("NODE_ENV", "test", () => {
    withEnvironment("MT5_USE_REAL_ADAPTER", undefined, () => {
      assert.ok(createMT5Adapter() instanceof MockMT5Adapter);
      assert.ok(new Worker(workerConfig).getStatus());
    });
  });
});
