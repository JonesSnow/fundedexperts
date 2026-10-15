import assert from "node:assert/strict";
import test from "node:test";
import { adminSnapshotIngestionEnabled } from "../../lib/monitoring/ingestion-policy";

test("admin-supplied monitoring snapshots are disabled in production", () => {
  assert.equal(adminSnapshotIngestionEnabled("production"), false);
});

test("mock monitoring ingestion remains available outside production", () => {
  assert.equal(adminSnapshotIngestionEnabled("development"), true);
  assert.equal(adminSnapshotIngestionEnabled("test"), true);
  assert.equal(adminSnapshotIngestionEnabled(undefined), false);
  assert.equal(adminSnapshotIngestionEnabled("unexpected"), false);
});
