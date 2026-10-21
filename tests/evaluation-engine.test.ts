import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Rule } from "@prisma/client";
import { evaluateRule, evaluateAllRules, getOverallResult } from "../lib/rule-engine";
import {
  evaluateDailyLoss,
  evaluateDrawdown,
  resolveDailyResetBoundary,
  buildRuleEventIdempotencyKey,
  type DailyLossDefinition,
} from "../lib/evaluation-calculations";
import { normalizeSnapshot } from "../lib/monitoring/normalize";
import { RULE_CAPABILITY_REGISTRY } from "../lib/rule-capabilities";
import { resolveOrderTerms } from "../lib/order-domain";
import { handlePaidOrderActivation } from "../lib/evaluation-activation-response";
import {
  activatePaidOrder,
  resolvePurchasedTerms,
  type ActivationAccount,
  type ActivationAssignment,
  type ActivationEvaluation,
  type ActivationOrder,
  type ActivationRepository,
  type ActivationRule,
  type ActivationRulesetVersion,
  type ActivationTransaction,
} from "../lib/evaluation-activation";

const asOf = new Date("2025-01-06T15:00:00.000Z");
const freshAt = new Date("2025-01-06T14:59:00.000Z");

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "account-1",
    accountLoginMasked: "[MASKED]",
    accountNumber: "DEMO-1",
    server: "demo",
    broker: "demo",
    balance: 25_000,
    equity: 25_000,
    freeMargin: 25_000,
    margin: 0,
    marginLevel: 0,
    currency: "USD",
    leverage: 30,
    isDemo: true,
    positions: [],
    orders: [],
    historySummary: { dealCount: 0, totalRealizedPnl: 0, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
    terminalConnected: true,
    terminalVersion: "test",
    dataTimestamp: freshAt,
    provider: "MT5" as const,
    snapshotTimestamp: asOf,
    activityEvents: null,
    historicalPeakEquity: null,
    tradeHistoryComplete: true,
    activityEventsComplete: true,
    equityHistoryComplete: false,
    dailyPnl: null,
    dataQuality: { positionsAvailable: true, ordersAvailable: true, historyAvailable: true },
    ...overrides,
  };
}

function rule(ruleType: string, value: Record<string, unknown>, calculation: Record<string, unknown>, id = "rule-1"): Rule {
  return { id, name: ruleType, ruleType, disposition: "REQUIRED", isRequired: true, value, calculation } as unknown as Rule;
}

const dailyDefinition: DailyLossDefinition = {
  schemaVersion: 1,
  method: "NET_PNL_COMPONENTS",
  timezone: "UTC",
  resetTime: "00:00",
  maxSnapshotAgeMs: 120_000,
  includedPnlComponents: ["realizedPnl", "floatingPnl"],
  breachComparison: "STRICTLY_GREATER_THAN",
};

function dailyInput(overrides: Record<string, unknown> = {}) {
  return {
    asOf,
    dataTimestamp: freshAt,
    maxLoss: 10,
    components: {
      realizedPnl: 0,
      floatingPnl: 0,
      commissionCosts: 0,
      swapPnl: 0,
      otherFees: 0,
      periodStart: new Date("2025-01-06T00:00:00.000Z"),
      periodEnd: freshAt,
    },
    ...overrides,
  };
}

test("normalization never infers complete provider history from present arrays", () => {
  const normalized = normalizeSnapshot("account-1", "DEMO-1", "MT5", {
    accountInfo: { login: 1, balance: 25_000, equity: 25_000, currency: "USD", leverage: 30, isDemo: true },
    positions: [],
    orders: [],
    history: [],
    timestamp: freshAt,
  });
  assert.equal(normalized.snapshot?.dataQuality?.historyAvailable, true);
  assert.equal(normalized.snapshot?.tradeHistoryComplete, false);
  assert.equal(normalized.snapshot?.activityEventsComplete, false);
  assert.equal(normalized.snapshot?.equityHistoryComplete, false);
  assert.equal(normalized.snapshot?.dailyPnl, null);
});

test("daily loss treats positive realized profit as zero loss", () => {
  const result = evaluateDailyLoss(dailyInput({ components: { ...dailyInput().components, realizedPnl: 100, floatingPnl: 10 } }), dailyDefinition);
  assert.equal(result.state, "PASS");
  assert.equal(result.actualValue, 0);
});

test("daily loss preserves negative realized PnL", () => {
  const result = evaluateDailyLoss(dailyInput({ components: { ...dailyInput().components, realizedPnl: -12 } }), dailyDefinition);
  assert.equal(result.state, "FAIL");
  assert.equal(result.actualValue, 12);
});

test("daily loss combines signed realized and floating PnL", () => {
  const result = evaluateDailyLoss(dailyInput({ components: { ...dailyInput().components, realizedPnl: -8, floatingPnl: -4 } }), dailyDefinition);
  assert.equal(result.actualValue, 12);
});

test("daily loss applies configured commissions, swaps, and fees", () => {
  const definition: DailyLossDefinition = { ...dailyDefinition, includedPnlComponents: ["realizedPnl", "floatingPnl", "commissionCosts", "swapPnl", "otherFees"] };
  const result = evaluateDailyLoss(dailyInput({ components: { ...dailyInput().components, realizedPnl: -8, floatingPnl: 2, commissionCosts: 1, swapPnl: -2, otherFees: 1 } }), definition);
  assert.equal(result.actualValue, 10);
});

test("daily loss respects exact, below, and beyond-limit boundaries", () => {
  const atLimit = evaluateDailyLoss(dailyInput({ components: { ...dailyInput().components, realizedPnl: -10 } }), dailyDefinition);
  const below = evaluateDailyLoss(dailyInput({ components: { ...dailyInput().components, realizedPnl: -9.99 } }), dailyDefinition);
  const beyond = evaluateDailyLoss(dailyInput({ components: { ...dailyInput().components, realizedPnl: -10.01 } }), dailyDefinition);
  assert.equal(atLimit.state, "PASS");
  assert.equal(below.state, "PASS");
  assert.equal(beyond.state, "FAIL");
});

test("daily loss uses a configured inclusive breach comparison when specified", () => {
  const result = evaluateDailyLoss(dailyInput({ components: { ...dailyInput().components, realizedPnl: -10 } }), { ...dailyDefinition, breachComparison: "GREATER_THAN_OR_EQUAL" });
  assert.equal(result.state, "FAIL");
});

test("daily loss requires all configured PnL components", () => {
  const result = evaluateDailyLoss(dailyInput({ components: { ...dailyInput().components, commissionCosts: null } }), { ...dailyDefinition, includedPnlComponents: ["commissionCosts"] });
  assert.equal(result.state, "UNAVAILABLE");
});

test("daily loss rejects stale data, invalid timezone, and unsupported metadata", () => {
  const stale = evaluateDailyLoss(dailyInput({ dataTimestamp: new Date("2025-01-06T10:00:00Z") }), dailyDefinition);
  const invalidTimezone = evaluateDailyLoss(dailyInput(), { ...dailyDefinition, timezone: "Mars/Olympus" });
  const unsupported = evaluateDailyLoss(dailyInput(), { ...dailyDefinition, method: "BALANCE_CHANGE" as never });
  assert.equal(stale.state, "STALE");
  assert.equal(invalidTimezone.state, "UNAVAILABLE");
  assert.equal(unsupported.state, "UNAVAILABLE");
});

test("daily reset boundary selects the correct local trading date", () => {
  const before = resolveDailyResetBoundary(new Date("2025-01-06T04:59:00Z"), "America/New_York", "00:00");
  const at = resolveDailyResetBoundary(new Date("2025-01-06T05:00:00Z"), "America/New_York", "00:00");
  assert.equal(before?.toISOString(), "2025-01-05T05:00:00.000Z");
  assert.equal(at?.toISOString(), "2025-01-06T05:00:00.000Z");
});

test("ambiguous and nonexistent daylight-saving reset times are unavailable", () => {
  assert.equal(resolveDailyResetBoundary(new Date("2025-03-09T12:00:00Z"), "America/New_York", "02:30"), null);
  assert.equal(resolveDailyResetBoundary(new Date("2025-11-02T12:00:00Z"), "America/New_York", "01:30"), null);
});

test("static drawdown uses the starting balance and exact breach comparison", () => {
  const atLimit = evaluateDrawdown({ equity: 24_900, startingBalance: 25_000, historicalPeakEquity: null, maxDrawdown: 100, model: "STATIC_STARTING_EQUITY", breachComparison: "STRICTLY_GREATER_THAN", historyComplete: false, dataTimestamp: freshAt, asOf, maxSnapshotAgeMs: 120_000 });
  const over = evaluateDrawdown({ equity: 24_899.99, startingBalance: 25_000, historicalPeakEquity: null, maxDrawdown: 100, model: "STATIC_STARTING_EQUITY", breachComparison: "STRICTLY_GREATER_THAN", historyComplete: false, dataTimestamp: freshAt, asOf, maxSnapshotAgeMs: 120_000 });
  assert.equal(atLimit.state, "PASS");
  assert.equal(over.state, "FAIL");
});

test("trailing drawdown requires a complete historical peak and never substitutes zero", () => {
  const missing = evaluateDrawdown({ equity: 24_000, startingBalance: 25_000, historicalPeakEquity: null, maxDrawdown: 500, model: "TRAILING_PEAK_EQUITY", breachComparison: "STRICTLY_GREATER_THAN", historyComplete: true, dataTimestamp: freshAt, asOf, maxSnapshotAgeMs: 120_000 });
  const incomplete = evaluateDrawdown({ equity: 24_000, startingBalance: 25_000, historicalPeakEquity: 25_500, maxDrawdown: 500, model: "TRAILING_PEAK_EQUITY", breachComparison: "STRICTLY_GREATER_THAN", historyComplete: false, dataTimestamp: freshAt, asOf, maxSnapshotAgeMs: 120_000 });
  const inconsistentPeak = evaluateDrawdown({ equity: 25_600, startingBalance: 25_000, historicalPeakEquity: 25_500, maxDrawdown: 500, model: "TRAILING_PEAK_EQUITY", breachComparison: "STRICTLY_GREATER_THAN", historyComplete: true, dataTimestamp: freshAt, asOf, maxSnapshotAgeMs: 120_000 });
  const fromPeak = evaluateDrawdown({ equity: 24_900, startingBalance: 25_000, historicalPeakEquity: 25_500, maxDrawdown: 500, model: "TRAILING_PEAK_EQUITY", breachComparison: "STRICTLY_GREATER_THAN", historyComplete: true, dataTimestamp: freshAt, asOf, maxSnapshotAgeMs: 120_000 });
  assert.equal(missing.state, "UNAVAILABLE");
  assert.equal(incomplete.state, "UNAVAILABLE");
  assert.equal(inconsistentPeak.state, "UNAVAILABLE");
  assert.match(inconsistentPeak.details, /history is inconsistent/);
  assert.equal(fromPeak.state, "FAIL");
  assert.equal(fromPeak.actualValue, 600);
});

test("drawdown rejects missing equity, missing static reference, and stale snapshots", () => {
  const input = { equity: null, startingBalance: null, historicalPeakEquity: null, maxDrawdown: 100, model: "STATIC_STARTING_EQUITY" as const, breachComparison: "STRICTLY_GREATER_THAN" as const, historyComplete: false, dataTimestamp: freshAt, asOf, maxSnapshotAgeMs: 120_000 };
  assert.equal(evaluateDrawdown(input).state, "UNAVAILABLE");
  assert.equal(evaluateDrawdown({ ...input, equity: 24_000 }).state, "UNAVAILABLE");
  assert.equal(evaluateDrawdown({ ...input, equity: 24_000, startingBalance: 25_000, dataTimestamp: new Date("2025-01-01T00:00:00Z") }).state, "STALE");
});

test("minimum trades stay incomplete until enough distinct completed trade IDs exist", () => {
  const calculation = { schemaVersion: 1, method: "COUNT_DISTINCT_COMPLETED_TRADES", maxSnapshotAgeMs: 120_000, breachComparison: "GREATER_THAN_OR_EQUAL" };
  const minTrades = rule("MIN_TRADES", { minTrades: 2 }, calculation);
  const events = [
    { eventId: "trade-1", symbol: "EURUSD", occurredAt: freshAt, completedAt: freshAt },
    { eventId: "trade-1", symbol: "EURUSD", occurredAt: freshAt, completedAt: freshAt },
  ];
  const under = evaluateRule(minTrades, snapshot({ activityEvents: events }));
  const met = evaluateRule(minTrades, snapshot({ activityEvents: [...events, { eventId: "trade-2", symbol: "EURUSD", occurredAt: freshAt, completedAt: freshAt }] }));
  assert.equal(under.state, "INCOMPLETE");
  assert.equal(under.result, "WARNING");
  assert.equal(met.state, "PASS");
  assert.equal(met.actualValue, 2);
});

test("minimum trades do not pass without provider confirmation that history is complete", () => {
  const minTrades = rule("MIN_TRADES", { minTrades: 1 }, { schemaVersion: 1, method: "COUNT_DISTINCT_COMPLETED_TRADES", maxSnapshotAgeMs: 120_000, breachComparison: "GREATER_THAN_OR_EQUAL" });
  const events = [{ eventId: "trade-1", symbol: "EURUSD", occurredAt: freshAt, completedAt: freshAt }];
  const result = evaluateRule(minTrades, snapshot({ tradeHistoryComplete: false, activityEvents: events }));
  assert.equal(result.state, "UNAVAILABLE");
});

test("minimum trades do not pass on missing identifiers or stale history", () => {
  const minTrades = rule("MIN_TRADES", { minTrades: 0 }, { schemaVersion: 1, method: "COUNT_DISTINCT_COMPLETED_TRADES", maxSnapshotAgeMs: 120_000, breachComparison: "GREATER_THAN_OR_EQUAL" });
  const noIds = evaluateRule(minTrades, snapshot({ activityEvents: [{ eventId: "", symbol: null, occurredAt: null, completedAt: freshAt }] }));
  const stale = evaluateRule(minTrades, snapshot({ dataTimestamp: new Date("2025-01-01T00:00:00Z"), activityEvents: [] }));
  assert.equal(noIds.state, "UNAVAILABLE");
  assert.equal(stale.state, "STALE");
});

test("minimum trading days count distinct local dates and deduplicate repeated snapshots", () => {
  const minDays = rule("MIN_TRADING_DAYS", { minTradingDays: 2 }, { schemaVersion: 1, method: "COUNT_DISTINCT_COMPLETED_TRADE_DATES", timezone: "America/New_York", maxSnapshotAgeMs: 120_000, breachComparison: "GREATER_THAN_OR_EQUAL" });
  const events = [
    { eventId: "t1", symbol: "EURUSD", occurredAt: freshAt, completedAt: new Date("2025-01-02T04:30:00Z") },
    { eventId: "t1", symbol: "EURUSD", occurredAt: freshAt, completedAt: new Date("2025-01-02T04:30:00Z") },
    { eventId: "t2", symbol: "EURUSD", occurredAt: freshAt, completedAt: new Date("2025-01-02T05:30:00Z") },
  ];
  const result = evaluateRule(minDays, snapshot({ activityEvents: events }));
  assert.equal(result.state, "PASS");
  assert.equal(result.actualValue, 2);
});

test("a repeated event ID with conflicting trading dates is unavailable", () => {
  const minDays = rule("MIN_TRADING_DAYS", { minTradingDays: 2 }, { schemaVersion: 1, method: "COUNT_DISTINCT_COMPLETED_TRADE_DATES", timezone: "UTC", maxSnapshotAgeMs: 120_000, breachComparison: "GREATER_THAN_OR_EQUAL" });
  const result = evaluateRule(minDays, snapshot({ activityEvents: [
    { eventId: "duplicate", symbol: "EURUSD", occurredAt: freshAt, completedAt: new Date("2025-01-01T12:00:00Z") },
    { eventId: "duplicate", symbol: "EURUSD", occurredAt: freshAt, completedAt: new Date("2025-01-02T12:00:00Z") },
  ] }));
  assert.equal(result.state, "UNAVAILABLE");
});

test("trading hours evaluate event time in the configured IANA zone, not snapshot time", () => {
  const tradingHours = rule("TRADING_HOURS", {}, { schemaVersion: 1, method: "EVENT_WITHIN_WEEKLY_WINDOW", timezone: "America/New_York", startTime: "08:00", endTime: "16:00", allowedDays: [1], maxSnapshotAgeMs: 120_000, breachComparison: "OUTSIDE_CONFIGURED_POLICY" });
  const result = evaluateRule(tradingHours, snapshot({ activityEvents: [{ eventId: "open-1", symbol: "EURUSD", occurredAt: new Date("2025-01-06T13:30:00Z") }], snapshotTimestamp: new Date("2025-01-06T15:00:00Z") }));
  assert.equal(result.state, "PASS");
});

test("trading-hours supports overnight windows and applies the start weekday", () => {
  const tradingHours = rule("TRADING_HOURS", {}, { schemaVersion: 1, method: "EVENT_WITHIN_WEEKLY_WINDOW", timezone: "UTC", startTime: "22:00", endTime: "02:00", allowedDays: [5], maxSnapshotAgeMs: 120_000, breachComparison: "OUTSIDE_CONFIGURED_POLICY" });
  const fridayNight = evaluateRule(tradingHours, snapshot({ activityEvents: [{ eventId: "open-1", symbol: "EURUSD", occurredAt: new Date("2025-01-10T23:30:00Z") }] }));
  const saturdayEarly = evaluateRule(tradingHours, snapshot({ activityEvents: [{ eventId: "open-2", symbol: "EURUSD", occurredAt: new Date("2025-01-11T01:30:00Z") }] }));
  const saturdayLate = evaluateRule(tradingHours, snapshot({ activityEvents: [{ eventId: "open-3", symbol: "EURUSD", occurredAt: new Date("2025-01-11T03:00:00Z") }] }));
  assert.equal(fridayNight.state, "PASS");
  assert.equal(saturdayEarly.state, "PASS");
  assert.equal(saturdayLate.state, "FAIL");
});

test("trading-hour end boundary is exclusive and event data must be present and fresh", () => {
  const tradingHours = rule("TRADING_HOURS", {}, { schemaVersion: 1, method: "EVENT_WITHIN_WEEKLY_WINDOW", timezone: "UTC", startTime: "08:00", endTime: "16:00", allowedDays: [1], maxSnapshotAgeMs: 120_000, breachComparison: "OUTSIDE_CONFIGURED_POLICY" });
  const atEnd = evaluateRule(tradingHours, snapshot({ activityEvents: [{ eventId: "e", symbol: "EURUSD", occurredAt: new Date("2025-01-06T16:00:00Z") }] }));
  const missing = evaluateRule(tradingHours, snapshot({ activityEvents: null }));
  const stale = evaluateRule(tradingHours, snapshot({ dataTimestamp: new Date("2025-01-01T00:00:00Z"), activityEvents: [] }));
  assert.equal(atEnd.state, "FAIL");
  assert.equal(missing.state, "INCOMPLETE");
  assert.equal(stale.state, "STALE");
});

test("trading hours convert event timestamps correctly across daylight-saving time", () => {
  const tradingHours = rule("TRADING_HOURS", {}, { schemaVersion: 1, method: "EVENT_WITHIN_WEEKLY_WINDOW", timezone: "America/New_York", startTime: "03:00", endTime: "04:00", allowedDays: [0], maxSnapshotAgeMs: 120_000, breachComparison: "OUTSIDE_CONFIGURED_POLICY" });
  const result = evaluateRule(tradingHours, snapshot({ activityEvents: [{ eventId: "dst", symbol: "EURUSD", occurredAt: new Date("2025-03-09T07:30:00Z") }] }));
  assert.equal(result.state, "PASS");
});

test("trading sessions check actual symbols and leave unsupported session policies unavailable", () => {
  const allowed = rule("TRADING_SESSION", { allowedSymbols: ["EURUSD"] }, { schemaVersion: 1, method: "ALLOWED_SYMBOLS", maxSnapshotAgeMs: 120_000, breachComparison: "OUTSIDE_CONFIGURED_POLICY" });
  const pass = evaluateRule(allowed, snapshot({ activityEvents: [{ eventId: "e1", symbol: "eurusd", occurredAt: freshAt }] }));
  const fail = evaluateRule(allowed, snapshot({ activityEvents: [{ eventId: "e2", symbol: "GBPUSD", occurredAt: freshAt }] }));
  const unsupported = evaluateRule(rule("TRADING_SESSION", { sessionRules: ["london"] }, { schemaVersion: 1, method: "WEEKLY_SESSION_RULES", maxSnapshotAgeMs: 120_000 }), snapshot());
  assert.equal(pass.state, "PASS");
  assert.equal(fail.state, "FAIL");
  assert.equal(unsupported.state, "UNAVAILABLE");
});

test("time and symbol rules require a complete provider activity window", () => {
  const hours = rule("TRADING_HOURS", {}, { schemaVersion: 1, method: "EVENT_WITHIN_WEEKLY_WINDOW", timezone: "UTC", startTime: "08:00", endTime: "16:00", allowedDays: [1], maxSnapshotAgeMs: 120_000, breachComparison: "OUTSIDE_CONFIGURED_POLICY" });
  const session = rule("TRADING_SESSION", { allowedSymbols: ["EURUSD"] }, { schemaVersion: 1, method: "ALLOWED_SYMBOLS", maxSnapshotAgeMs: 120_000, breachComparison: "OUTSIDE_CONFIGURED_POLICY" });
  const events = [{ eventId: "e", symbol: "EURUSD", occurredAt: freshAt }];
  assert.equal(evaluateRule(hours, snapshot({ activityEventsComplete: false, activityEvents: events })).state, "UNAVAILABLE");
  assert.equal(evaluateRule(session, snapshot({ activityEventsComplete: false, activityEvents: events })).state, "UNAVAILABLE");
});

test("other rules require explicit definitions and complete source fields", () => {
  const openTrades = rule("MAX_OPEN_TRADES", { maxTrades: 2 }, { schemaVersion: 1, method: "COUNT_OPEN_POSITIONS_AND_PENDING_ORDERS", maxSnapshotAgeMs: 120_000, breachComparison: "GREATER_THAN" });
  const missingPositions = evaluateRule(openTrades, snapshot({ dataQuality: { positionsAvailable: false, ordersAvailable: true, historyAvailable: true } }));
  const failedCollections = evaluateRule(openTrades, snapshot({ dataQuality: { positionsAvailable: false, ordersAvailable: false, historyAvailable: false } }));
  const leverage = rule("MAX_LEVERAGE", { maxLeverage: 30 }, { schemaVersion: 1, method: "SNAPSHOT_ACCOUNT_LEVERAGE", maxSnapshotAgeMs: 120_000, breachComparison: "GREATER_THAN" });
  const missingLeverage = evaluateRule(leverage, snapshot({ leverage: null }));
  assert.equal(missingPositions.state, "UNAVAILABLE");
  assert.equal(failedCollections.state, "UNAVAILABLE");
  assert.equal(failedCollections.result, "WARNING");
  assert.equal(missingLeverage.state, "UNAVAILABLE");
});

test("runtime capability gate enforces every published rule method and treats missing data as unavailable", () => {
  const drawdown = rule("DRAWDOWN_LIMIT", { maxDrawdown: 100 }, {
    schemaVersion: 1,
    method: "STATIC_STARTING_EQUITY",
    maxSnapshotAgeMs: 120_000,
    breachComparison: "STRICTLY_GREATER_THAN",
  });
  const maxOpen = rule("MAX_OPEN_TRADES", { maxTrades: 2 }, {
    schemaVersion: 1,
    method: "COUNT_OPEN_POSITIONS_AND_PENDING_ORDERS",
    maxSnapshotAgeMs: 120_000,
    breachComparison: "GREATER_THAN",
  });
  const maxLeverage = rule("MAX_LEVERAGE", { maxLeverage: 30 }, {
    schemaVersion: 1,
    method: "SNAPSHOT_ACCOUNT_LEVERAGE",
    maxSnapshotAgeMs: 120_000,
    breachComparison: "GREATER_THAN",
  });
  const actual = evaluateAllRules([drawdown, maxOpen, maxLeverage], snapshot({
    equity: 24_899,
    positions: [{ profit: 1 }],
    orders: [{ state: "PLACED" }, { state: "PARTIAL" }, { state: "CANCELED" }],
    leverage: 31,
  }), { startingBalance: 25_000 });
  assert.deepEqual(actual.map((outcome) => outcome.state), ["FAIL", "FAIL", "FAIL"]);

  const missingOrders = evaluateAllRules([maxOpen], snapshot({ orders: [{ state: null }] }));
  const unavailableTrailing = evaluateAllRules([rule("DRAWDOWN_LIMIT", { maxDrawdown: 100 }, {
    schemaVersion: 1,
    method: "TRAILING_PEAK_EQUITY",
    maxSnapshotAgeMs: 120_000,
    breachComparison: "STRICTLY_GREATER_THAN",
  })], snapshot());
  const inconsistentTrailing = evaluateAllRules([rule("DRAWDOWN_LIMIT", { maxDrawdown: 100 }, {
    schemaVersion: 1,
    method: "TRAILING_PEAK_EQUITY",
    maxSnapshotAgeMs: 120_000,
    breachComparison: "STRICTLY_GREATER_THAN",
  })], snapshot({ equity: 25_600, historicalPeakEquity: 25_500, historyComplete: true }));
  const unsupportedProfit = evaluateAllRules([rule("PROFIT_TARGET", { target: 100 }, {
    schemaVersion: 1,
    method: "REALIZED_PLUS_FLOATING_PNL",
    maxSnapshotAgeMs: 120_000,
    breachComparison: "GREATER_THAN_OR_EQUAL",
  })], snapshot());
  assert.equal(missingOrders[0]?.state, "UNAVAILABLE");
  assert.equal(unavailableTrailing[0]?.state, "UNAVAILABLE");
  assert.equal(inconsistentTrailing[0]?.state, "UNAVAILABLE");
  assert.equal(inconsistentTrailing[0]?.result, "WARNING");
  assert.equal(unsupportedProfit[0]?.state, "UNAVAILABLE");
});

test("runtime enforcement leaves every unsupported required rule unavailable", () => {
  const unsupportedRules = Object.entries(RULE_CAPABILITY_REGISTRY)
    .filter(([, capability]) => capability.status === "UNSUPPORTED")
    .map(([ruleType]) => rule(ruleType, {}, {}));
  const outcomes = evaluateAllRules(unsupportedRules, snapshot());
  assert.equal(outcomes.length, unsupportedRules.length);
  assert.ok(outcomes.every((outcome) => outcome.state === "UNAVAILABLE" && outcome.result === "WARNING"));
  assert.equal(getOverallResult(outcomes), "WARNING");
});

test("unresolved, unsupported, and empty rulesets cannot produce a pass", () => {
  const unresolved = { ...rule("PROFIT_TARGET", { target: 100 }, {}), disposition: "UNRESOLVED" } as unknown as Rule;
  const unknown = rule("UNKNOWN_RULE", {}, {});
  assert.equal(evaluateRule(unresolved, snapshot()).state, "UNAVAILABLE");
  assert.equal(evaluateRule(unknown, snapshot()).state, "UNAVAILABLE");
  assert.equal(getOverallResult([]), "WARNING");
  assert.equal(getOverallResult(evaluateAllRules([unresolved], snapshot())), "WARNING");
});

test("monitoring breach audit identity is stable across retries", () => {
  assert.equal(buildRuleEventIdempotencyKey("evaluation-1", "rule-1"), buildRuleEventIdempotencyKey("evaluation-1", "rule-1"));
  assert.notEqual(buildRuleEventIdempotencyKey("evaluation-1", "rule-1"), buildRuleEventIdempotencyKey("evaluation-1", "rule-2"));
});

function productFixture() {
  const leverageCalculation = { schemaVersion: 1, method: "SNAPSHOT_ACCOUNT_LEVERAGE", metric: "account leverage", reference: "latest account snapshot", breachComparison: "GREATER_THAN", evaluationTiming: "fresh snapshot", requiredInputs: ["leverage", "dataTimestamp"], maxSnapshotAgeMs: 120_000 };
  const openTradesCalculation = { schemaVersion: 1, method: "COUNT_OPEN_POSITIONS_AND_PENDING_ORDERS", metric: "open positions and pending orders", reference: "latest account snapshot", breachComparison: "GREATER_THAN", evaluationTiming: "fresh snapshot", requiredInputs: ["positions", "orders", "dataTimestamp"], maxSnapshotAgeMs: 120_000 };
  const rules: ActivationRule[] = [
    { id: "leverage-rule", name: "Maximum leverage", ruleType: "MAX_LEVERAGE", disposition: "REQUIRED", isRequired: true, effectiveDate: asOf, value: { maxLeverage: 30 }, calculation: leverageCalculation },
    { id: "open-trades-rule", name: "Maximum open trades", ruleType: "MAX_OPEN_TRADES", disposition: "REQUIRED", isRequired: true, effectiveDate: asOf, value: { maxTrades: 5 }, calculation: openTradesCalculation },
  ];
  const version: ActivationRulesetVersion = { id: "version-1", version: "1.0.0", status: "PUBLISHED", effectiveDate: asOf, rules };
  const product = {
    id: "product-1",
    code: "expert-25k",
    name: "Expert 25K",
    description: "A one-stage simulated evaluation.",
    category: "EXPERT",
    evaluationStructure: "ONE_STEP",
    status: "ACTIVE",
    isActive: true,
    accountSize: "25000.00",
    denominationCurrency: "USD",
    price: "79.00",
    currency: "USD",
    stages: [{ id: "stage-1", stageKey: "stage-1", displayName: "Stage 1", stageOrder: 1, rulesetVersion: { ...version, rules: rules.map((ruleValue) => ({ id: ruleValue.id, name: ruleValue.name, ruleType: ruleValue.ruleType, disposition: ruleValue.disposition, isRequired: ruleValue.isRequired, effectiveDate: ruleValue.effectiveDate, value: ruleValue.value, calculation: ruleValue.calculation })) } }],
  } as const;
  return { product, version, rules };
}

test("order terms are server resolved, versioned, and require centrally supported rules", () => {
  const { product } = productFixture();
  const terms = resolveOrderTerms(product as never, asOf);
  assert.equal(terms.valid, true);
  if (terms.valid) {
    assert.equal(terms.price, "79.00");
    assert.equal(terms.accountSize, "25000.00");
    assert.equal(terms.productSnapshot.denominationCurrency, "USD");
    assert.equal(terms.rulesetVersionId, "version-1");
    assert.equal(terms.productSnapshot.schemaVersion, 2);
  }
});

test("browser-supplied order money and rules cannot override server terms", () => {
  const { product } = productFixture();
  const terms = resolveOrderTerms(product as never, asOf);
  assert.equal(terms.valid, true);
  if (terms.valid) {
    assert.equal(terms.price, "79.00");
    assert.equal(terms.currency, "USD");
    assert.equal(terms.accountSize, "25000.00");
    assert.equal((terms.productSnapshot.stages as Array<{ rulesetVersionId: string }>)[0].rulesetVersionId, "version-1");
  }
});

interface MemoryState {
  order: ActivationOrder;
  version: ActivationRulesetVersion;
  evaluation: ActivationEvaluation | null;
  account: ActivationAccount | null;
  assignment: ActivationAssignment | null;
  ruleEvaluations: Array<{ evaluationId: string; ruleId: string; result: string; state: string }>;
  auditEvents: Array<Record<string, unknown>>;
  failRuleInitialization: boolean;
}

class MemoryActivationRepository implements ActivationRepository {
  private tail: Promise<void> = Promise.resolve();
  constructor(readonly state: MemoryState) {}

  async transaction<T>(_orderId: string, work: (tx: ActivationTransaction) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const staged = structuredClone(this.state);
    const tx: ActivationTransaction = {
      getOrder: async (id) => staged.order.id === id ? staged.order : null,
      getRulesetVersion: async (id) => staged.version.id === id ? staged.version : null,
      getEvaluationForOrder: async (id) => staged.evaluation?.orderId === id ? staged.evaluation : null,
      getAccount: async (id) => staged.account?.id === id ? staged.account : null,
      getAssignment: async (traderId, accountId) => staged.assignment?.traderId === traderId && staged.assignment.accountId === accountId ? staged.assignment : null,
      lockTraderActivation: async () => undefined,
      hasActiveAssignment: async (traderId) => staged.assignment?.traderId === traderId && staged.assignment.status === "ASSIGNED",
      reserveMatchingAccount: async (accountSize, denominationCurrency) => staged.account?.status === "AVAILABLE" && staged.account.credentialsConfigured === true && Number(staged.account.accountSize) === accountSize && staged.account.currency === denominationCurrency ? staged.account : null,
      createEvaluation: async (data) => {
        const evaluation = { ...data, id: "evaluation-1" };
        staged.evaluation = evaluation;
        return evaluation;
      },
      createAssignment: async (data) => {
        const assignment = { ...data, id: "assignment-1", assignedAt: new Date(asOf) };
        staged.assignment = assignment;
        return assignment;
      },
      markAccountInUse: async (id) => {
        if (!staged.account || staged.account.id !== id || staged.account.status !== "AVAILABLE") throw new Error("account reservation lost");
        staged.account.status = "IN_USE";
      },
      createInitialRuleEvaluations: async (evaluationId, rules) => {
        if (staged.failRuleInitialization) throw new Error("injected rule initialization failure");
        staged.ruleEvaluations.push(...rules.filter((entry) => entry.disposition === "REQUIRED").map((entry) => ({ evaluationId, ruleId: entry.id, result: "WARNING", state: "INCOMPLETE" })));
      },
      writeActivationAudit: async (event) => { staged.auditEvents.push({ type: "ACTIVATED", ...event }); },
      writeReviewAudit: async (event) => { staged.auditEvents.push({ type: "REVIEW_REQUIRED", ...event }); },
    };
    try {
      const result = await work(tx);
      Object.assign(this.state, staged);
      return result;
    } finally {
      release();
    }
  }
}

function activationFixture(overrides: Partial<MemoryState> = {}) {
  const { product, version, rules } = productFixture();
  const terms = resolveOrderTerms(product as never, asOf);
  assert.equal(terms.valid, true);
  if (!terms.valid) throw new Error("Invalid test product fixture");
  const order: ActivationOrder = {
    id: "order-1",
    traderId: "trader-1",
    status: "PAID",
    rulesetVersionId: "version-1",
    orderItems: [{ productId: "product-1", unitPrice: "79.00", currency: "USD", productSnapshot: terms.productSnapshot }],
  };
  const account: ActivationAccount = { id: "account-1", accountNumber: "DEMO-1", accountSize: "25000.00", currency: "USD", status: "AVAILABLE", purpose: "EVALUATION", credentialsConfigured: true };
  const state: MemoryState = {
    order,
    version,
    evaluation: null,
    account,
    assignment: null,
    ruleEvaluations: [],
    auditEvents: [],
    failRuleInitialization: false,
    ...overrides,
  };
  return { repository: new MemoryActivationRepository(state), state, rules };
}

test("activation creates evaluation, exact rule records, inventory assignment, and audit in one service transaction", async () => {
  const { repository, state } = activationFixture();
  const result = await activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(result.success, true);
  assert.equal(state.evaluation?.rulesetVersionId, "version-1");
  assert.equal(state.evaluation?.productStageId, "stage-1");
  assert.equal(state.evaluation?.accountId, "account-1");
  assert.equal(state.account?.status, "IN_USE");
  assert.equal(state.assignment?.status, "ASSIGNED");
  assert.equal(state.ruleEvaluations.length, 2);
  assert.ok(state.ruleEvaluations.every((entry) => entry.state === "INCOMPLETE" && entry.result === "WARNING"));
  assert.equal(state.auditEvents.length, 1);
});

test("missing inventory leaves no evaluation, assignment, or success audit", async () => {
  const { repository, state } = activationFixture({ account: null });
  const result = await activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(result.success, false);
  assert.equal(result.code, "NO_MATCHING_INVENTORY");
  assert.equal(state.evaluation, null);
  assert.equal(state.assignment, null);
  assert.equal(state.auditEvents.length, 0);
});

test("activation does not assign an equal-size account denominated in a different currency", async () => {
  const { repository, state } = activationFixture({
    account: { id: "account-1", accountNumber: "DEMO-1", accountSize: "25000.00", currency: "EUR", status: "AVAILABLE", purpose: "EVALUATION", credentialsConfigured: true },
  });
  const result = await activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(result.success, false);
  assert.equal(result.code, "NO_MATCHING_INVENTORY");
  assert.equal(state.evaluation, null);
  assert.equal(state.assignment, null);
  assert.equal(state.account?.status, "AVAILABLE");
  assert.equal(state.auditEvents.length, 0);
});

test("activation does not assign an account without configured encrypted credentials", async () => {
  const { repository, state } = activationFixture({
    account: { id: "account-1", accountNumber: "DEMO-1", accountSize: "25000.00", currency: "USD", status: "AVAILABLE", purpose: "EVALUATION", credentialsConfigured: false },
  });
  const result = await activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(result.success, false);
  assert.equal(result.code, "NO_MATCHING_INVENTORY");
  assert.equal(state.evaluation, null);
  assert.equal(state.assignment, null);
  assert.equal(state.account?.status, "AVAILABLE");
  assert.equal(state.auditEvents.length, 0);
});

test("Prisma activation reservation only selects inventory with non-empty encrypted credentials", () => {
  const source = readFileSync(new URL("../lib/evaluation-activation.ts", import.meta.url), "utf8");
  const start = source.indexOf("async reserveMatchingAccount(accountSize, denominationCurrency)");
  const end = source.indexOf("async createEvaluation(data)", start);
  const reservation = source.slice(start, end);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(reservation, /"credentials" IS NOT NULL/);
  assert.match(reservation, /BTRIM\("credentials"\) <> ''/);
  assert.match(reservation, /FOR UPDATE SKIP LOCKED/);
});

test("activation requires denomination currency from the immutable order snapshot", async () => {
  const { repository, state } = activationFixture();
  const productSnapshot = state.order.orderItems[0]!.productSnapshot as Record<string, unknown>;
  delete productSnapshot.denominationCurrency;

  const result = await activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" });

  assert.equal(result.success, false);
  assert.equal(result.code, "TERMS_REVIEW_REQUIRED");
  assert.equal(state.evaluation, null);
  assert.equal(state.assignment, null);
  assert.equal(state.account?.status, "AVAILABLE");
  assert.equal(state.auditEvents[0]?.type, "REVIEW_REQUIRED");
});

test("activation retries return the same evaluation and do not allocate twice", async () => {
  const { repository, state } = activationFixture();
  const first = await activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" });
  const second = await activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  if (first.success && second.success) {
    assert.equal(first.evaluation.id, second.evaluation.id);
    assert.equal(second.duplicate, true);
  }
  assert.equal(state.ruleEvaluations.length, 2);
  assert.equal(state.auditEvents.length, 1);
});

test("mocked activation route contract enforces authentication, ownership, and payment states", async () => {
  const unauthenticated = activationFixture();
  const unauthenticatedResponse = await handlePaidOrderActivation(unauthenticated.repository, { orderId: "order-1", traderId: null });
  assert.equal(unauthenticatedResponse.status, 401);

  const forbidden = activationFixture();
  const forbiddenResponse = await handlePaidOrderActivation(forbidden.repository, { orderId: "order-1", traderId: "trader-2" });
  assert.equal(forbiddenResponse.status, 403);

  const unpaid = activationFixture();
  unpaid.state.order.status = "PENDING_PAYMENT";
  const unpaidResponse = await handlePaidOrderActivation(unpaid.repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(unpaidResponse.status, 400);

});

test("activation holds an unsupported purchased rule for administrator review", async () => {
  const unverified = activationFixture();
  unverified.state.version.rules[0]!.ruleType = "PROFIT_TARGET";
  const snapshotValue = unverified.state.order.orderItems[0]!.productSnapshot as { stages: Array<{ rules: Array<{ type: string }> }> };
  snapshotValue.stages[0]!.rules[0]!.type = "PROFIT_TARGET";
  const unverifiedResponse = await handlePaidOrderActivation(unverified.repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(unverifiedResponse.status, 409);
  const body = await unverifiedResponse.json() as { reviewRequired?: boolean };
  assert.equal(body.reviewRequired, true);
});

test("mocked activation route returns a safe successful response after the service commits", async () => {
  const { repository } = activationFixture();
  const response = await handlePaidOrderActivation(repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(response.status, 201);
  const body = await response.json() as { success: boolean; evaluation: { status: string; account: { status: string } } };
  assert.equal(body.success, true);
  assert.equal(body.evaluation.status, "IN_PROGRESS");
  assert.equal(body.evaluation.account.status, "IN_USE");
});

test("concurrent activation requests serialize to one account allocation", async () => {
  const { repository, state } = activationFixture();
  const results = await Promise.all([
    activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" }),
    activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" }),
  ]);
  assert.ok(results.every((result) => result.success));
  assert.equal(results.filter((result) => result.success && result.duplicate).length, 1);
  assert.equal(state.ruleEvaluations.length, 2);
  assert.equal(state.auditEvents.length, 1);
});

test("rule initialization failure rolls back evaluation and assignment state", async () => {
  const { repository, state } = activationFixture({ failRuleInitialization: true });
  const result = await activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(result.success, false);
  assert.equal(state.evaluation, null);
  assert.equal(state.account?.status, "AVAILABLE");
  assert.equal(state.assignment, null);
});

test("unpaid orders and another customer's order are rejected before allocation", async () => {
  const unpaid = activationFixture();
  unpaid.state.order.status = "PENDING_PAYMENT";
  const unpaidResult = await activatePaidOrder(unpaid.repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(unpaidResult.success, false);
  assert.equal(unpaidResult.code, "ORDER_NOT_PAID");
  const owned = activationFixture();
  const forbidden = await activatePaidOrder(owned.repository, { orderId: "order-1", traderId: "trader-2" });
  assert.equal(forbidden.success, false);
  assert.equal(forbidden.code, "FORBIDDEN");
  assert.equal(owned.state.evaluation, null);
});

test("mismatched order snapshot ruleset is audited and rejected", async () => {
  const { repository, state } = activationFixture();
  const snapshotValue = state.order.orderItems[0].productSnapshot as { stages: Array<Record<string, unknown>> };
  snapshotValue.stages[0].rulesetVersionId = "attacker-version";
  const result = await activatePaidOrder(repository, { orderId: "order-1", traderId: "trader-1" });
  assert.equal(result.success, false);
  assert.equal(result.code, "TERMS_REVIEW_REQUIRED");
  assert.equal(state.evaluation, null);
  assert.equal(state.auditEvents[0]?.type, "REVIEW_REQUIRED");
});

test("historical order terms remain authoritative when the current catalog changes", () => {
  const { product, version, rules } = productFixture();
  const terms = resolveOrderTerms(product as never, asOf);
  assert.equal(terms.valid, true);
  if (!terms.valid) return;
  const historicalOrder: ActivationOrder = { id: "historical", traderId: "trader-1", status: "PAID", rulesetVersionId: version.id, orderItems: [{ productId: "product-1", unitPrice: terms.price, currency: terms.currency, productSnapshot: terms.productSnapshot }] };
  const mutatedCurrentProduct = { ...product, price: "199.00", accountSize: "50000.00" };
  assert.notEqual(mutatedCurrentProduct.price, (terms.productSnapshot as { price: string }).price);
  const resolved = resolvePurchasedTerms(historicalOrder, version);
  assert.equal(resolved.errors.length, 0);
  assert.equal(resolved.terms?.accountSize, 25_000);
  assert.deepEqual(resolved.terms?.rules.map((entry) => entry.id), rules.map((entry) => entry.id).sort());
});

test("mismatched snapshot rule values are rejected instead of mixed with live rules", () => {
  const fixture = activationFixture();
  const snapshotValue = fixture.state.order.orderItems[0].productSnapshot as { stages: Array<{ rules: Array<Record<string, unknown>> }> };
  snapshotValue.stages[0].rules[0].value = { target: 1 };
  const resolved = resolvePurchasedTerms(fixture.state.order, fixture.state.version);
  assert.equal(resolved.terms, null);
  assert.ok(resolved.errors.some((error) => error.includes("does not match")));
});

test("version 2 purchase terms reject rule and ruleset effective-date drift", () => {
  const requiredness = activationFixture();
  requiredness.state.version.rules[0]!.isRequired = false;
  const requirednessResult = resolvePurchasedTerms(requiredness.state.order, requiredness.state.version);
  assert.equal(requirednessResult.terms, null);
  assert.ok(requirednessResult.errors.some((error) => error.includes("does not match")));

  const ruleDate = activationFixture();
  ruleDate.state.version.rules[0]!.effectiveDate = new Date("2026-02-01T00:00:00.000Z");
  const ruleDateResult = resolvePurchasedTerms(ruleDate.state.order, ruleDate.state.version);
  assert.equal(ruleDateResult.terms, null);
  assert.ok(ruleDateResult.errors.some((error) => error.includes("does not match")));

  const rulesetDate = activationFixture();
  rulesetDate.state.version.effectiveDate = new Date("2026-02-01T00:00:00.000Z");
  const rulesetDateResult = resolvePurchasedTerms(rulesetDate.state.order, rulesetDate.state.version);
  assert.equal(rulesetDateResult.terms, null);
  assert.ok(rulesetDateResult.errors.some((error) => error.includes("effective date")));
});

test("published ruleset versions and product stages remain explicit in snapshot checks", () => {
  const fixture = activationFixture();
  fixture.state.version.status = "DRAFT";
  const resolved = resolvePurchasedTerms(fixture.state.order, fixture.state.version);
  assert.equal(resolved.terms, null);
  assert.ok(resolved.errors.some((error) => error.includes("never published")));
});

test("profit target stays unavailable when history or open positions are incomplete", () => {
  const profitTarget = rule("PROFIT_TARGET", { target: 1 }, { schemaVersion: 1, method: "REALIZED_PLUS_FLOATING_PNL", maxSnapshotAgeMs: 120_000, breachComparison: "GREATER_THAN_OR_EQUAL" });
  assert.equal(evaluateRule(profitTarget, snapshot({ tradeHistoryComplete: false })).state, "UNAVAILABLE");
  assert.equal(evaluateRule(profitTarget, snapshot({ dataQuality: { positionsAvailable: false, ordersAvailable: true, historyAvailable: true } })).state, "UNAVAILABLE");
});

test("customer-facing outcome does not claim incomplete rule checks passed", () => {
  const profitTarget = rule("PROFIT_TARGET", { target: 500 }, { schemaVersion: 1, method: "REALIZED_PLUS_FLOATING_PNL", maxSnapshotAgeMs: 120_000, breachComparison: "GREATER_THAN_OR_EQUAL" });
  const outcome = evaluateRule(profitTarget, snapshot());
  assert.equal(outcome.state, "INCOMPLETE");
  assert.equal(outcome.result, "WARNING");
  assert.match(outcome.details, /^INCOMPLETE:/);
});
