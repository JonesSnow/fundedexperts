import assert from "node:assert/strict";
import test from "node:test";
import { hasValidNormalizedSnapshot } from "../../lib/monitoring/normalize";
import type { NormalizeResult } from "../../lib/monitoring/normalize";
import type { MonitoringSnapshot } from "../../lib/monitoring/types";

const partialSnapshot = {
  accountId: "account-1",
  accountLoginMasked: "****",
  accountNumber: "account-1",
  server: null,
  broker: null,
  balance: null,
  equity: null,
  freeMargin: null,
  margin: null,
  marginLevel: null,
  currency: null,
  leverage: null,
  isDemo: null,
  positions: [],
  orders: [],
  historySummary: { dealCount: 0, totalRealizedPnl: null, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
  terminalConnected: null,
  terminalVersion: null,
  dataTimestamp: null,
  provider: "MT5",
  snapshotTimestamp: new Date(),
  activityEvents: null,
  historicalPeakEquity: null,
  tradeHistoryComplete: false,
  activityEventsComplete: false,
  equityHistoryComplete: false,
  dailyPnl: null,
  dataQuality: { positionsAvailable: false, ordersAvailable: false, historyAvailable: false },
} satisfies MonitoringSnapshot;

test("rejects partial snapshot objects when critical normalization failed", () => {
  const result: NormalizeResult = {
    success: false,
    snapshot: partialSnapshot,
    accountInfo: null,
    errors: [{ code: "NULL_ACCOUNT_INFO", message: "Missing account info", severity: "CRITICAL" }],
  };

  assert.equal(hasValidNormalizedSnapshot(result), false);
});

test("accepts only successful normalization results with a snapshot", () => {
  const result: NormalizeResult = {
    success: true,
    snapshot: partialSnapshot,
    accountInfo: null,
    errors: [],
  };

  assert.equal(hasValidNormalizedSnapshot(result), true);
  assert.equal(hasValidNormalizedSnapshot({ ...result, snapshot: null }), false);
});
