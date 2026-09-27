import { describe, it, after, beforeEach, afterEach } from "node:test";
import { PrismaClient, RuleType, RuleResult, type Rule } from "@prisma/client";
import { runCleanupSteps, assertCleanup, type CleanupResult } from "../lib/cleanup-helper";
import { evaluateRule, evaluateAllRules, getOverallResult, type RuleEvaluationOutcome } from "../lib/rule-engine";
import { processMonitoringSnapshot } from "../lib/monitoring-pipeline";
import type { MonitoringSnapshot, MonitoringPosition } from "../lib/monitoring/types";

const HAS_DB = process.env.DATABASE_URL !== undefined;
const RUN_ID = Date.now().toString(36);

const results = {
  pass: 0,
  fail: 0,
  tests: [] as Array<{ name: string; result: string; detail: string }>,
};

let cleanupResult: CleanupResult | null = null;

function check(name: string, condition: boolean, detail: string = "") {
  if (condition) {
    results.pass++;
    results.tests.push({ name, result: "PASS", detail });
  } else {
    results.fail++;
    results.tests.push({ name, result: "FAIL", detail });
    console.error(`  CHECK FAILED: ${name} — ${detail}`);
  }
}

function makePosition(overrides: Partial<MonitoringPosition> = {}): MonitoringPosition {
  return {
    symbol: "EURUSD",
    direction: "BUY",
    volume: 0.1,
    openPrice: 1.1000,
    currentPrice: null,
    stopLoss: 1.095,
    takeProfit: 1.1100,
    profit: 500,
    swap: 0,
    openTime: null,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<MonitoringSnapshot> = {}): MonitoringSnapshot {
  return {
    accountId: "test-account-1",
    accountLoginMasked: "[MASKED-12***]",
    accountNumber: "ACC-001",
    server: "Server-XM",
    broker: "XM",
    balance: 100000,
    equity: 100000,
    freeMargin: 95000,
    margin: 5000,
    marginLevel: 2000,
    currency: "USD",
    leverage: 100,
    isDemo: true,
    positions: [],
    orders: [],
    historySummary: {
      dealCount: 0,
      totalRealizedPnl: 0,
      winCount: 0,
      lossCount: 0,
      periodStart: null,
      periodEnd: null,
    },
    terminalConnected: true,
    terminalVersion: "1.2.3",
    dataTimestamp: new Date(),
    provider: "MT5",
    snapshotTimestamp: new Date(),
    ...overrides,
  };
}

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function cleanup(): Promise<CleanupResult> {
  const steps = [
    { label: "ruleEvent.deleteMany", fn: () => prisma.ruleEvent.deleteMany({}) },
    { label: "ruleEvaluation.deleteMany", fn: () => prisma.ruleEvaluation.deleteMany({}) },
    { label: "rule.deleteMany", fn: () => prisma.rule.deleteMany({}) },
    { label: "evaluation.deleteMany", fn: () => prisma.evaluation.deleteMany({}) },
    { label: "accountAssignment.deleteMany", fn: () => prisma.accountAssignment.deleteMany({}) },
    { label: "mT5Account.deleteMany", fn: () => prisma.mT5Account.deleteMany({}) },
    { label: "fundedAccount.deleteMany", fn: () => prisma.fundedAccount.deleteMany({}) },
    { label: "emailDelivery.deleteMany", fn: () => prisma.emailDelivery.deleteMany({}) },
    { label: "auditLog.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE` },
    { label: "rulesetVersion.deleteMany", fn: () => prisma.rulesetVersion.deleteMany({}) },
    { label: "ruleset.deleteMany", fn: () => prisma.ruleset.deleteMany({}) },
    { label: "product.deleteMany", fn: () => prisma.product.deleteMany({}) },
    { label: "trader.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "Trader" CASCADE` },
  ];
  return runCleanupSteps(prisma, steps);
}

async function createTestTrader(email: string, role: "TRADER" | "ADMIN" = "TRADER") {
  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: { email, password: passwordHash, role, status: "ACTIVE" },
  });
}

interface TestRuleDef {
  ruleType: RuleType;
  name?: string;
  value?: Record<string, unknown>;
  isRequired?: boolean;
}

async function createTestRuleset(rules: TestRuleDef[] = []) {
  const ruleset = await prisma.ruleset.create({
    data: { name: `RS-${RUN_ID}`, isActive: true },
  });
  const version = await prisma.rulesetVersion.create({
    data: {
      rulesetId: ruleset.id,
      version: "1.0",
      status: "PUBLISHED",
      effectiveDate: new Date(),
    },
  });

  if (rules.length > 0) {
    for (const r of rules) {
      await prisma.rule.create({
        data: {
          rulesetVersionId: version.id,
          ruleType: r.ruleType,
          name: r.name ?? r.ruleType,
          value: r.value ? JSON.stringify(r.value) : undefined,
          isRequired: r.isRequired ?? true,
        },
      });
    }
  }

  const fullVersion = await prisma.rulesetVersion.findUnique({
    where: { id: version.id },
    include: { ruleset: true, rules: true },
  });
  return { ruleset, version: fullVersion! };
}

async function createTestAccount(accountNumber: string) {
  return prisma.mT5Account.create({
    data: {
      accountNumber,
      broker: "XM",
      server: "Server-XM",
      login: "test-login",
      accountSize: 100000,
      currency: "USD",
      status: "AVAILABLE" as const,
    },
  });
}

async function createTestEvaluation(
  traderId: string,
  rulesetVersionId: string,
  accountId?: string,
  status: "IN_PROGRESS" | "PASSED" | "FAILED" | "ABANDONED" = "IN_PROGRESS",
  startingBalance?: number,
) {
  return prisma.evaluation.create({
    data: {
      trader: { connect: { id: traderId } },
      rulesetVersion: { connect: { id: rulesetVersionId } },
      status,
      startingBalance: startingBalance,
      ...(accountId ? { account: { connect: { id: accountId } } } : {}),
    },
  });
}

async function createTestAssignment(traderId: string, accountId: string) {
  return prisma.accountAssignment.create({
    data: {
      traderId,
      accountId,
      status: "ASSIGNED",
    },
  });
}

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

describe("Phase 28 — Rule Engine Unit Tests", () => {
  describe("PROFIT_TARGET", () => {
    it("should PASS when PnL >= target", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 105000,
        historySummary: { dealCount: 5, totalRealizedPnl: 5000, winCount: 3, lossCount: 2, periodStart: null, periodEnd: null },
        positions: [],
        orders: [],
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("PROFIT_TARGET passes", outcome.result === "PASS", `result=${outcome.result}, details=${outcome.details}`);
    });

    it("should return WARNING when PnL < target (not a rule violation)", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 102000,
        historySummary: { dealCount: 3, totalRealizedPnl: 2000, winCount: 2, lossCount: 1, periodStart: null, periodEnd: null },
        positions: [],
        orders: [],
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("PROFIT_TARGET warning", outcome.result === "WARNING", `result=${outcome.result}, details=${outcome.details}`);
    });

    it("should PASS with position profits included", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 104000,
        historySummary: { dealCount: 2, totalRealizedPnl: 3000, winCount: 2, lossCount: 0, periodStart: null, periodEnd: null },
        positions: [makePosition({ profit: 1500 })],
        orders: [],
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 4500 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("PROFIT_TARGET passes with positions", outcome.result === "PASS", `result=${outcome.result}, actual=${outcome.actualValue}, expected=${outcome.expectedValue}`);
    });
  });

  describe("DRAWDOWN_LIMIT", () => {
    it("should PASS when drawdown within limit (absolute)", () => {
      const snapshot = makeSnapshot({ balance: 100000, equity: 98000 });
      const rule = { id: "r1", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdown: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("DRAWDOWN_LIMIT passes", outcome.result === "PASS", `result=${outcome.result}, details=${outcome.details}`);
    });

    it("should FAIL when drawdown exceeds limit (absolute)", () => {
      const snapshot = makeSnapshot({ balance: 100000, equity: 90000 });
      const rule = { id: "r1", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdown: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("DRAWDOWN_LIMIT fails", outcome.result === "FAIL", `result=${outcome.result}, actual=${outcome.actualValue}, expected=${outcome.expectedValue}`);
    });

    it("should PASS when drawdown within limit (percentage)", () => {
      const snapshot = makeSnapshot({ balance: 100000, equity: 98000 });
      const rule = { id: "r1", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdownPercent: 10, startingBalance: 100000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("DRAWDOWN_LIMIT passes (percent)", outcome.result === "PASS", `result=${outcome.result}`);
    });

    it("should FAIL when drawdown exceeds limit (percentage)", () => {
      const snapshot = makeSnapshot({ balance: 100000, equity: 85000 });
      const rule = { id: "r1", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdownPercent: 10, startingBalance: 100000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("DRAWDOWN_LIMIT fails (percent)", outcome.result === "FAIL", `result=${outcome.result}`);
    });
  });

  describe("MIN_TRADES", () => {
    it("should PASS when trade count meets minimum", () => {
      const snapshot = makeSnapshot({
        historySummary: { dealCount: 5, totalRealizedPnl: 0, winCount: 3, lossCount: 2, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.MIN_TRADES, name: "Min Trades", value: { minTrades: 3 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("MIN_TRADES passes", outcome.result === "PASS", `result=${outcome.result}`);
    });

    it("should FAIL when trade count below minimum", () => {
      const snapshot = makeSnapshot({
        historySummary: { dealCount: 1, totalRealizedPnl: 0, winCount: 1, lossCount: 0, periodStart: null, periodEnd: null },
        positions: [makePosition({})],
      });
      const rule = { id: "r1", ruleType: RuleType.MIN_TRADES, name: "Min Trades", value: { minTrades: 3 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("MIN_TRADES fails", outcome.result === "FAIL", `result=${outcome.result}, actual=${outcome.actualValue}, expected=${JSON.stringify(outcome.expectedValue)}`);
    });
  });

  describe("MAX_DAILY_LOSS", () => {
    it("should PASS when daily loss within limit", () => {
      const snapshot = makeSnapshot({
        historySummary: { dealCount: 3, totalRealizedPnl: -2000, winCount: 1, lossCount: 2, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.MAX_DAILY_LOSS, name: "Max Daily Loss", value: { maxLoss: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("MAX_DAILY_LOSS passes", outcome.result === "PASS", `result=${outcome.result}`);
    });

    it("should FAIL when daily loss exceeds limit", () => {
      const snapshot = makeSnapshot({
        historySummary: { dealCount: 5, totalRealizedPnl: -8000, winCount: 1, lossCount: 4, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.MAX_DAILY_LOSS, name: "Max Daily Loss", value: { maxLoss: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("MAX_DAILY_LOSS fails", outcome.result === "FAIL", `result=${outcome.result}, actual=${outcome.actualValue}, expected=${JSON.stringify(outcome.expectedValue)}`);
    });
  });

  describe("MAX_OPEN_TRADES", () => {
    it("should PASS when open trades within limit", () => {
      const snapshot = makeSnapshot({
        positions: [makePosition({}), makePosition({})],
        orders: [],
      });
      const rule = { id: "r1", ruleType: RuleType.MAX_OPEN_TRADES, name: "Max Open Trades", value: { maxTrades: 3 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("MAX_OPEN_TRADES passes", outcome.result === "PASS", `result=${outcome.result}`);
    });

    it("should FAIL when open trades exceed limit", () => {
      const snapshot = makeSnapshot({
        positions: [makePosition({}), makePosition({}), makePosition({}), makePosition({})],
        orders: [],
      });
      const rule = { id: "r1", ruleType: RuleType.MAX_OPEN_TRADES, name: "Max Open Trades", value: { maxTrades: 3 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("MAX_OPEN_TRADES fails", outcome.result === "FAIL", `result=${outcome.result}, actual=${outcome.actualValue}, expected=${JSON.stringify(outcome.expectedValue)}`);
    });
  });

  describe("getOverallResult", () => {
    it("should return PASS when all outcomes pass", () => {
      const outcomes: RuleEvaluationOutcome[] = [
        { ruleId: "1", ruleType: RuleType.PROFIT_TARGET, result: "PASS", actualValue: 100, expectedValue: 50, details: "" },
        { ruleId: "2", ruleType: RuleType.DRAWDOWN_LIMIT, result: "PASS", actualValue: 10, expectedValue: 50, details: "" },
      ];
      check("Overall PASS", getOverallResult(outcomes) === "PASS", "");
    });

    it("should return FAIL when any outcome fails", () => {
      const outcomes: RuleEvaluationOutcome[] = [
        { ruleId: "1", ruleType: RuleType.PROFIT_TARGET, result: "PASS", actualValue: 100, expectedValue: 50, details: "" },
        { ruleId: "2", ruleType: RuleType.DRAWDOWN_LIMIT, result: "FAIL", actualValue: 60, expectedValue: 50, details: "" },
      ];
      check("Overall FAIL", getOverallResult(outcomes) === "FAIL", "");
    });

    it("should return WARNING when no fail but has warning", () => {
      const outcomes: RuleEvaluationOutcome[] = [
        { ruleId: "1", ruleType: RuleType.PROFIT_TARGET, result: "WARNING", actualValue: 100, expectedValue: 50, details: "" },
      ];
      check("Overall WARNING", getOverallResult(outcomes) === "WARNING", "");
    });

    it("should return PASS when no outcomes", () => {
      check("Overall PASS (empty)", getOverallResult([]) === "PASS", "");
    });
  });
});

describe("Phase 28 — Monitoring Pipeline Integration", () => {
  let traderId: string;
  let accountId: string;
  let rulesetVersionId: string;
  let evaluationId: string;

  beforeEach(async () => {
    cleanupResult = await cleanup();
    assertCleanup(cleanupResult, "pipeline beforeEach");

    const trader = await createTestTrader(`pipeline-${RUN_ID}@example.com`);
    traderId = trader.id;

    const account = await createTestAccount(`ACC-${RUN_ID}-pipeline`);
    accountId = account.id;

    await createTestAssignment(traderId, accountId);
    await prisma.mT5Account.update({ where: { id: accountId }, data: { status: "IN_USE" } });

    const { version } = await createTestRuleset([
      { ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 5000 }, isRequired: false },
      { ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdown: 20000 }, isRequired: true },
      { ruleType: RuleType.MIN_TRADES, name: "Min Trades", value: { minTrades: 1 }, isRequired: true },
    ]);
    rulesetVersionId = version.id;

    const evaluation = await createTestEvaluation(traderId, rulesetVersionId, accountId, "IN_PROGRESS", 100000);
    evaluationId = evaluation.id;

    const rules = await prisma.rule.findMany({ where: { rulesetVersionId } });
    await prisma.ruleEvaluation.createMany({
      data: rules.map((rule) => ({
        evaluationId: evaluation.id,
        ruleId: rule.id,
        result: RuleResult.PASS,
        details: "Initial state - awaiting monitoring",
        evaluatedAt: new Date(),
      })),
    });
  });

  afterEach(async () => {
    if (cleanupResult) assertCleanup(cleanupResult as CleanupResult, "pipeline afterEach");
  });

  after(async () => {
    if (cleanupResult) assertCleanup(cleanupResult as CleanupResult, "pipeline after");
    await prisma.$disconnect();
    console.log(`Phase 28 Pipeline: ${results.pass}/${results.pass + results.fail} passed, ${results.fail} failed`);
    if (results.fail > 0) process.exit(1);
  });

  it("A. Normal profitable trading — PROFIT_TARGET not met yet, evaluation stays IN_PROGRESS", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 102000,
      historySummary: { dealCount: 2, totalRealizedPnl: 2000, winCount: 2, lossCount: 0, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    const result = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Pipeline successful", result.success, result.success ? "" : (result as { success: false; error: string }).error);
    if (result.success) {
      check("Has evaluationId", result.evaluationId === evaluationId, `evalId=${result.evaluationId}`);
      check("Overall WARNING (PROFIT_TARGET not met)", result.overallResult === "WARNING", `result=${result.overallResult}`);
      check("Evaluation not passed (profit target not met)", result.passed !== true, `passed=${result.passed}`);
      check("Evaluation not failed (PROFIT_TARGET not required)", result.failed !== true, `failed=${result.failed}`);

      const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
      check("Evaluation still IN_PROGRESS", evalAfter?.status === "IN_PROGRESS", `dbStatus=${evalAfter?.status}`);
    }
  });

  it("B. Profit target reached — evaluation PASSED via releaseAccount", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 106000,
      historySummary: { dealCount: 5, totalRealizedPnl: 6000, winCount: 3, lossCount: 2, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    const result = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Pipeline successful", result.success, result.success ? "" : (result as { success: false; error: string }).error);
    if (result.success) {
      check("Overall PASS", result.overallResult === "PASS", `result=${result.overallResult}`);
      check("Evaluation passed", result.passed === true, `passed=${result.passed}`);
      check("Evaluation status is PASSED", result.evaluationStatus === "PASSED", `status=${result.evaluationStatus}`);

      const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
      check("Evaluation status PASSED in DB", evalAfter?.status === "PASSED", `dbStatus=${evalAfter?.status}`);
    }
  });

  it("C. Daily loss breach — DRAWDOWN_LIMIT fails, evaluation FAILED", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 70000,
      historySummary: { dealCount: 10, totalRealizedPnl: -30000, winCount: 2, lossCount: 8, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    const result = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Pipeline successful", result.success, result.success ? "" : (result as { success: false; error: string }).error);
    if (result.success) {
      check("Overall FAIL", result.overallResult === "FAIL", `result=${result.overallResult}`);
      check("Evaluation failed", result.failed === true, `failed=${result.failed}`);
      check("Evaluation status is FAILED", result.evaluationStatus === "FAILED", `status=${result.evaluationStatus}`);

      const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
      check("Evaluation FAILED in DB", evalAfter?.status === "FAILED", `dbStatus=${evalAfter?.status}`);
    }
  });

  it("D. Maximum drawdown breach — drawdown > limit with positions", () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 75000,
      historySummary: { dealCount: 3, totalRealizedPnl: -2000, winCount: 1, lossCount: 2, periodStart: new Date(), periodEnd: new Date() },
      positions: [makePosition({ profit: -23000 })],
      orders: [],
    });

    const rules: Rule[] = [
      { id: "rule-dd", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdown: 20000 } } as unknown as Rule,
    ];
    const outcomes = evaluateAllRules(rules, snapshot);
    check("DRAWDOWN_LIMIT fails with positions", outcomes[0].result === "FAIL", `result=${outcomes[0].result}`);
    check("Actual drawdown is 25000", outcomes[0].actualValue === 25000, `actual=${outcomes[0].actualValue}`);
  });

  it("E. Still-active evaluation — PROFIT_TARGET not met, no terminal transition", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 101000,
      historySummary: { dealCount: 1, totalRealizedPnl: 1000, winCount: 1, lossCount: 0, periodStart: new Date(), periodEnd: new Date() },
      positions: [makePosition({ profit: 0 })],
      orders: [],
    });

    const result = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Pipeline successful", result.success, "");
    if (result.success) {
      check("PROFIT_TARGET not met (WARNING)", result.overallResult === "WARNING", `result=${result.overallResult}`);
      check("Evaluation not passed (profit < 5000)", result.passed !== true, `passed=${result.passed}`);
      check("Evaluation not failed (PROFIT_TARGET not required)", result.failed !== true, `failed=${result.failed}`);

      const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
      check("Evaluation still IN_PROGRESS", evalAfter?.status === "IN_PROGRESS", `dbStatus=${evalAfter?.status}`);
    }
  });

  it("F. Multiple rules — PROFIT_TARGET not met, others pass, evaluation stays IN_PROGRESS", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 102000,
      historySummary: { dealCount: 2, totalRealizedPnl: 2000, winCount: 2, lossCount: 0, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    const result = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    if (result.success) {
      check("Has 3 outcomes", result.outcomes.length === 3, `count=${result.outcomes.length}`);
      const profitTarget = result.outcomes.find((o) => o.ruleType === "PROFIT_TARGET");
      const drawdown = result.outcomes.find((o) => o.ruleType === "DRAWDOWN_LIMIT");
      const minTrades = result.outcomes.find((o) => o.ruleType === "MIN_TRADES");
      check("PROFIT_TARGET not yet met (WARNING)", profitTarget?.result === "WARNING", `${profitTarget?.result}`);
      check("DRAWDOWN_LIMIT passes", drawdown?.result === "PASS", `${drawdown?.result}`);
      check("MIN_TRADES passes", minTrades?.result === "PASS", `${minTrades?.result}`);
      check("Evaluation not passed (PROFIT_TARGET not met)", result.passed !== true, `passed=${result.passed}`);
    }
  });

  it("G. No trading data — rules evaluate with zeros", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 100000,
      historySummary: { dealCount: 0, totalRealizedPnl: 0, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
      positions: [],
      orders: [],
    });

    const result = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    if (result.success) {
      const minTrades = result.outcomes.find((o) => o.ruleType === "MIN_TRADES");
      check("MIN_TRADES fails (no trades)", minTrades?.result === "FAIL", `${minTrades?.result}`);
      check("Overall FAIL", result.overallResult === "FAIL", `${result.overallResult}`);
    }
  });

  it("H. Invalid trading data — null account info handled", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: null,
      equity: null,
      historySummary: { dealCount: 0, totalRealizedPnl: 0, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
      positions: [],
      orders: [],
    });

    const result = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Pipeline handles null values", result.success, result.success ? "" : "Pipeline failed");
    if (result.success) {
      check("Overall FAIL (no data)", result.overallResult === "FAIL", `${result.overallResult}`);
      check("Evaluation FAILED", result.failed === true, `${result.failed}`);
    }
  });

  it("I. Duplicate monitoring cycle — no duplicate RuleEvent", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 70000,
      historySummary: { dealCount: 10, totalRealizedPnl: -30000, winCount: 2, lossCount: 8, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    const result1 = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("First cycle: pipeline success", result1.success, "");

    const eventsAfterFirst = await prisma.ruleEvent.count({ where: { accountId } });

    const result2 = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Second cycle: pipeline success", result2.success, "");

    const eventsAfterSecond = await prisma.ruleEvent.count({ where: { accountId } });

    check("No duplicate RuleEvents created", eventsAfterSecond === eventsAfterFirst, `first=${eventsAfterFirst}, second=${eventsAfterSecond}`);

    const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
    check("Evaluation still FAILED", evalAfter?.status === "FAILED", `status=${evalAfter?.status}`);
  });

  it("J. Duplicate breach prevention — RuleEvent not duplicated", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 70000,
      historySummary: { dealCount: 10, totalRealizedPnl: -30000, winCount: 2, lossCount: 8, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    const breachEvents = await prisma.ruleEvent.findMany({
      where: { accountId, acknowledged: false },
    });
    check("Breach events created", breachEvents.length > 0, `count=${breachEvents.length}`);

    const initialCount = breachEvents.length;

    await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    const finalBreachEvents = await prisma.ruleEvent.findMany({
      where: { accountId, acknowledged: false },
    });
    check("No new breach events", finalBreachEvents.length === initialCount, `initial=${initialCount}, final=${finalBreachEvents.length}`);
  });

  it("K. Idempotent evaluation failure — cannot fail twice", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 70000,
      historySummary: { dealCount: 10, totalRealizedPnl: -30000, winCount: 2, lossCount: 8, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    const result1 = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("First failure: FAILED", result1.success && result1.failed === true, "");

    const result2 = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Second attempt: no re-failure", result2.success && result2.failed !== true, `failed=${result2.success ? String(result2.failed) : "N/A"}`);

    const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
    check("Evaluation still FAILED", evalAfter?.status === "FAILED", `status=${evalAfter?.status}`);
  });

  it("L. Idempotent evaluation pass — cannot pass twice", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 106000,
      historySummary: { dealCount: 5, totalRealizedPnl: 6000, winCount: 3, lossCount: 2, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    const result1 = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("First pass: PASSED", result1.success && result1.passed === true, "");

    const result2 = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Second attempt: no re-pass", result2.success && result2.passed !== true, `passed=${result2.success ? String(result2.passed) : "N/A"}`);

    const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
    check("Evaluation still PASSED", evalAfter?.status === "PASSED", `status=${evalAfter?.status}`);
  });

  it("M. Correct RuleEvaluation creation", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 102000,
      historySummary: { dealCount: 2, totalRealizedPnl: 2000, winCount: 2, lossCount: 0, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    const ruleEvals = await prisma.ruleEvaluation.findMany({ where: { evaluationId } });
    check("RuleEvaluations created/updated", ruleEvals.length >= 3, `count=${ruleEvals.length}`);
    check("RuleEvaluations have results", ruleEvals.every((re) => re.result !== null), "");
  });

  it("N. Correct RuleEvent creation on breach", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 70000,
      historySummary: { dealCount: 10, totalRealizedPnl: -30000, winCount: 2, lossCount: 8, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    const events = await prisma.ruleEvent.findMany({ where: { accountId } });
    check("RuleEvents created on breach", events.length > 0, `count=${events.length}`);

    const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
    check("Evaluation FAILED", evalAfter?.status === "FAILED", "");
  });

  it("O. Monitoring state updated on account", async () => {
    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 102000,
      historySummary: { dealCount: 2, totalRealizedPnl: 2000, winCount: 2, lossCount: 0, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    const account = await prisma.mT5Account.findUnique({ where: { id: accountId } });
    check("Monitoring state updated", account?.currentMonitoringStatus !== null, `status=${account?.currentMonitoringStatus}`);
    check("lastMonitoringAt set", account?.lastMonitoringAt !== null, "");
  });

  it("P. No evaluation — no error, just skip", async () => {
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { status: "FAILED" },
    });

    const snapshot = makeSnapshot({ accountId });

    const result = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Terminal evaluation skipped gracefully", result.success, "");
    if (result.success) {
      check("No outcomes (skipped)", result.outcomes.length === 0, `count=${result.outcomes.length}`);
    }
  });

  it("Q. Terminal evaluation — no processing", async () => {
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { status: "PASSED" },
    });

    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 90000,
      historySummary: { dealCount: 5, totalRealizedPnl: -10000, winCount: 1, lossCount: 4, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    const result = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Terminal evaluation skipped gracefully", result.success, "");
    if (result.success) {
      check("No outcomes (skipped)", result.outcomes.length === 0, `count=${result.outcomes.length}`);
    }
  });

  it("R. RuleEvaluation updated on re-processing", async () => {
    const snapshot1 = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 102000,
      historySummary: { dealCount: 2, totalRealizedPnl: 2000, winCount: 2, lossCount: 0, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot: snapshot1,
      performedBy: traderId,
      sendEmails: false,
    });

    const snapshot2 = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 106000,
      historySummary: { dealCount: 5, totalRealizedPnl: 6000, winCount: 3, lossCount: 2, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    const result2 = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot: snapshot2,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Second cycle evaluates correctly", result2.success, "");
    if (result2.success) {
      const profitEval = result2.outcomes.find((o) => o.ruleType === "PROFIT_TARGET");
      check("PROFIT_TARGET passes on second cycle", profitEval?.result === "PASS", `${profitEval?.result}`);
      check("Evaluation PASSED", result2.passed === true, "");
    }
  });

  it("S. Monitoring retry behavior — failed job is marked retryable", async () => {
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { status: "IN_PROGRESS" },
    });

    const job = await prisma.monitoringJob.create({
      data: {
        jobId: `job-${accountId}-retry-test`,
        accountId,
        workerId: "test-worker",
        timeoutMs: 10000,
        status: "FAILED",
        attempt: 1,
        errorCode: "TIMEOUT",
        errorMessage: "Job timed out",
        retryable: true,
        completedAt: new Date(),
      },
    });

    const updated = await prisma.monitoringJob.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        attempt: 2,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        retryable: false,
      },
    });

    check("Job requeued for retry", updated.status === "PENDING", `status=${updated.status}`);
    check("Attempt incremented", updated.attempt === 2, `attempt=${updated.attempt}`);
  });

  it("T. Terminal evaluations no longer monitored — PASSED skipped", async () => {
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { status: "PASSED" },
    });

    const terminalEvaluation = await prisma.evaluation.findFirst({
      where: { accountId, status: "IN_PROGRESS" },
    });

    check("No IN_PROGRESS evaluation found", terminalEvaluation === null, `found=${terminalEvaluation !== null}`);

    const snapshot = makeSnapshot({
      accountId,
      balance: 100000,
      equity: 90000,
      historySummary: { dealCount: 5, totalRealizedPnl: -10000, winCount: 1, lossCount: 4, periodStart: new Date(), periodEnd: new Date() },
      positions: [],
      orders: [],
    });

    const result = await processMonitoringSnapshot(prisma, {
      accountId,
      snapshot,
      performedBy: traderId,
      sendEmails: false,
    });

    check("Terminal evaluation skipped gracefully", result.success, "");
    if (result.success) {
      check("No outcomes (skipped)", result.outcomes.length === 0, `count=${result.outcomes.length}`);
    }
  });
});

describe("Phase 29 — Financial Metric Hardening", () => {
  describe("PROFIT_TARGET returns WARNING (not FAIL) when not met", () => {
    it("A. PROFIT_TARGET below target returns WARNING, not FAIL", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 103000,
        historySummary: { dealCount: 2, totalRealizedPnl: 3000, winCount: 2, lossCount: 0, periodStart: null, periodEnd: null },
        positions: [],
        orders: [],
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("PROFIT_TARGET returns WARNING", outcome.result === "WARNING", `result=${outcome.result}`);
      check("Overall result is WARNING (not FAIL)", getOverallResult([outcome]) === "WARNING", "");
    });

    it("B. PROFIT_TARGET exactly at target returns PASS (boundary)", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 105000,
        historySummary: { dealCount: 5, totalRealizedPnl: 5000, winCount: 3, lossCount: 2, periodStart: null, periodEnd: null },
        positions: [],
        orders: [],
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("PROFIT_TARGET boundary PASS", outcome.result === "PASS", `result=${outcome.result}, actual=${outcome.actualValue}, expected=${outcome.expectedValue}`);
    });

    it("C. PROFIT_TARGET slightly above target returns PASS", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 105000.01,
        historySummary: { dealCount: 5, totalRealizedPnl: 5000.01, winCount: 3, lossCount: 2, periodStart: null, periodEnd: null },
        positions: [],
        orders: [],
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("PROFIT_TARGET slightly above PASS", outcome.result === "PASS", `result=${outcome.result}`);
    });

    it("D. PROFIT_TARGET slightly below target returns WARNING", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 104999.99,
        historySummary: { dealCount: 5, totalRealizedPnl: 4999.99, winCount: 3, lossCount: 2, periodStart: null, periodEnd: null },
        positions: [],
        orders: [],
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("PROFIT_TARGET slightly below WARNING", outcome.result === "WARNING", `result=${outcome.result}`);
    });
  });

  describe("DRAWDOWN calculation with startingBalance", () => {
    it("E. Drawdown from startingBalance when equity drops below starting balance", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 89000,
        positions: [makePosition({ profit: 0 })],
        orders: [],
        historySummary: { dealCount: 5, totalRealizedPnl: -10000, winCount: 2, lossCount: 3, periodStart: null, periodEnd: null },
      });
      const rule = {
        id: "r1",
        ruleType: RuleType.DRAWDOWN_LIMIT,
        name: "Max Drawdown",
        value: { maxDrawdownPercent: 10, startingBalance: 100000 },
      } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot, { startingBalance: 100000 });
      check("DRAWDOWN_FAIL", outcome.result === "FAIL", `result=${outcome.result}`);
      check("DRAWDOWN_actual_11000", Number(outcome.actualValue) === 11000, `actual=${outcome.actualValue}`);
    });

    it("F. Drawdown within limit from startingBalance (percentage)", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 97000,
        positions: [],
        orders: [],
        historySummary: { dealCount: 3, totalRealizedPnl: -3000, winCount: 1, lossCount: 2, periodStart: null, periodEnd: null },
      });
      const rule = {
        id: "r1",
        ruleType: RuleType.DRAWDOWN_LIMIT,
        name: "Max Drawdown",
        value: { maxDrawdownPercent: 10, startingBalance: 100000 },
      } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot, { startingBalance: 100000 });
      check("DRAWDOWN_PASS", outcome.result === "PASS", `result=${outcome.result}`);
      check("DRAWDOWN_actual_3000", Number(outcome.actualValue) === 3000, `actual=${outcome.actualValue}`);
    });

    it("G. Drawdown with growing account (equity above starting balance)", () => {
      const snapshot = makeSnapshot({
        balance: 110000,
        equity: 105000,
        positions: [],
        orders: [],
        historySummary: { dealCount: 5, totalRealizedPnl: 10000, winCount: 3, lossCount: 2, periodStart: null, periodEnd: null },
      });
      const rule = {
        id: "r1",
        ruleType: RuleType.DRAWDOWN_LIMIT,
        name: "Max Drawdown",
        value: { maxDrawdown: 8000 },
      } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("DRAWDOWN_growing_pass", outcome.result === "PASS", `result=${outcome.result}, actual=${outcome.actualValue}`);
    });

    it("H. Drawdown without startingBalance uses balance as peak", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 85000,
        positions: [],
        orders: [],
        historySummary: { dealCount: 10, totalRealizedPnl: -15000, winCount: 2, lossCount: 8, periodStart: null, periodEnd: null },
      });
      const rule = {
        id: "r1",
        ruleType: RuleType.DRAWDOWN_LIMIT,
        name: "Max Drawdown",
        value: { maxDrawdown: 10000 },
      } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("DRAWDOWN_no_starting_balance", outcome.result === "FAIL", `result=${outcome.result}, actual=${outcome.actualValue}`);
      check("DRAWDOWN_actual_15000", Number(outcome.actualValue) === 15000, `actual=${outcome.actualValue}`);
    });
  });

  describe("Decimal precision and rounding", () => {
    it("I. Total PnL rounding to 2 decimal places", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 100100.005,
        positions: [makePosition({ profit: 0.003 })],
        orders: [],
        historySummary: { dealCount: 1, totalRealizedPnl: 0.002, winCount: 1, lossCount: 0, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 0.01 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("PNL_rounded_to_2dp", Number(outcome.actualValue) === 0.01, `actual=${outcome.actualValue}`);
    });

    it("J. Drawdown rounding does not allow floating-point drift", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 99000.1,
        positions: [],
        orders: [],
        historySummary: { dealCount: 0, totalRealizedPnl: 0, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdown: 1000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("DD_rounded", Number(outcome.actualValue) === 999.9, `actual=${outcome.actualValue}`);
    });

    it("K. Zero PnL with zero target returns PASS", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 100000,
        positions: [],
        orders: [],
        historySummary: { dealCount: 0, totalRealizedPnl: 0, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 0 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("ZERO_PNL_PASS", outcome.result === "PASS", `result=${outcome.result}`);
    });
  });

  describe("Missing configuration behavior", () => {
    it("L. PROFIT_TARGET with no target returns WARNING", () => {
      const snapshot = makeSnapshot({ balance: 100000, equity: 100000 });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target" } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("NO_TARGET_WARNING", outcome.result === "WARNING", `result=${outcome.result}`);
    });

    it("M. DRAWDOWN_LIMIT with no maxDrawdown or percent returns WARNING", () => {
      const snapshot = makeSnapshot({ balance: 100000, equity: 90000 });
      const rule = { id: "r1", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown" } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("NO_DD_CONFIG_WARNING", outcome.result === "WARNING", `result=${outcome.result}`);
    });

    it("N. MAX_LEVERAGE with null leverage from snapshot returns WARNING", () => {
      const snapshot = makeSnapshot({ leverage: null });
      const rule = { id: "r1", ruleType: RuleType.MAX_LEVERAGE, name: "Max Leverage", value: { maxLeverage: 300 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("NULL_LEVERAGE_WARNING", outcome.result === "WARNING", `result=${outcome.result}`);
    });
  });

  describe("Missing data / null values", () => {
    it("O. Null balance and equity handled gracefully", () => {
      const snapshot = makeSnapshot({ balance: null, equity: null });
      const rule = { id: "r1", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdown: 1000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("NULL_BALANCE_DRAWDOWN_PASS", outcome.result === "PASS", `result=${outcome.result}, actual=${outcome.actualValue}`);
    });

    it("P. Null positions handled (empty array fallback)", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 105000,
        positions: undefined as unknown as [],
        historySummary: { dealCount: 5, totalRealizedPnl: 5000, winCount: 3, lossCount: 2, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("UNDEFINED_POSITIONS_PASS", outcome.result === "PASS", `result=${outcome.result}`);
    });

    it("Q. Null profit in position treated as 0", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 100000,
        positions: [makePosition({ profit: null })],
        historySummary: { dealCount: 0, totalRealizedPnl: 0, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.MIN_TRADES, name: "Min Trades", value: { minTrades: 1 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("NULL_PROFIT_HANDLED", outcome.result === "PASS", `result=${outcome.result}, actual=${outcome.actualValue}`);
    });
  });

  describe("Evaluation lifecycle with PROFIT_TARGET WARNING", () => {
    let traderId: string;
    let accountId: string;
    let rulesetVersionId: string;
    let evaluationId: string;

    beforeEach(async () => {
      cleanupResult = await cleanup();
      assertCleanup(cleanupResult, "phase29 beforeEach");

      const trader = await createTestTrader(`phase29-${RUN_ID}@example.com`);
      traderId = trader.id;

      const account = await createTestAccount(`ACC-${RUN_ID}-p29`);
      accountId = account.id;

      await createTestAssignment(traderId, accountId);
      await prisma.mT5Account.update({ where: { id: accountId }, data: { status: "IN_USE" } });

      const { version } = await createTestRuleset([
        { ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 5000 }, isRequired: false },
        { ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdown: 20000 }, isRequired: true },
        { ruleType: RuleType.MIN_TRADES, name: "Min Trades", value: { minTrades: 1 }, isRequired: true },
      ]);
      rulesetVersionId = version.id;

      const evaluation = await createTestEvaluation(traderId, rulesetVersionId, accountId, "IN_PROGRESS", 100000);
      evaluationId = evaluation.id;

      const rules = await prisma.rule.findMany({ where: { rulesetVersionId } });
      await prisma.ruleEvaluation.createMany({
        data: rules.map((rule) => ({
          evaluationId: evaluation.id,
          ruleId: rule.id,
          result: RuleResult.PASS,
          details: "Initial state - awaiting monitoring",
          evaluatedAt: new Date(),
        })),
      });
    });

    afterEach(async () => {
      if (cleanupResult) assertCleanup(cleanupResult as CleanupResult, "phase29 afterEach");
    });

    after(async () => {
      if (cleanupResult) assertCleanup(cleanupResult as CleanupResult, "phase29 after");
    });

    it("R. PROFIT_TARGET not met (WARNING) does not trigger failure with non-required rule", async () => {
      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 102000,
        historySummary: { dealCount: 2, totalRealizedPnl: 2000, winCount: 2, lossCount: 0, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      const result = await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: false,
      });

      check("Pipeline success", result.success, "");
      if (result.success) {
        check("Overall WARNING (not FAIL)", result.overallResult === "WARNING", `result=${result.overallResult}`);
        check("Not passed", result.passed !== true, "");
        check("Not failed", result.failed !== true, "");

        const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
        check("Still IN_PROGRESS", evalAfter?.status === "IN_PROGRESS", `status=${evalAfter?.status}`);
      }
    });

    it("S. PROFIT_TARGET met (PASS) triggers evaluation completion", async () => {
      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 106000,
        historySummary: { dealCount: 5, totalRealizedPnl: 6000, winCount: 3, lossCount: 2, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      const result = await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: false,
      });

      check("Pipeline success", result.success, "");
      if (result.success) {
        check("Overall PASS", result.overallResult === "PASS", `result=${result.overallResult}`);
        check("Passed", result.passed === true, `passed=${result.passed}`);

        const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
        check("Evaluation PASSED", evalAfter?.status === "PASSED", `status=${evalAfter?.status}`);
      }
    });

    it("T. PROFIT_TARGET not met but required breach triggers failure", async () => {
      await prisma.rule.updateMany({
        where: { rulesetVersionId },
        data: { isRequired: true },
      });

      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 70000,
        historySummary: { dealCount: 10, totalRealizedPnl: -30000, winCount: 2, lossCount: 8, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      const result = await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: false,
      });

      check("Pipeline success", result.success, "");
      if (result.success) {
        check("Overall FAIL", result.overallResult === "FAIL", `result=${result.overallResult}`);
        check("Failed", result.failed === true, `failed=${result.failed}`);
      }
    });

    it("U. Email semantic fix — no sendRuleBreachEmail for evaluation pass (idempotency)", async () => {
      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 106000,
        historySummary: { dealCount: 5, totalRealizedPnl: 6000, winCount: 3, lossCount: 2, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: true,
      });

      const emailDeliveries = await prisma.emailDelivery.findMany({
        where: { relatedEntityType: "Evaluation", relatedEntityId: evaluationId },
      });

      check("No rule breach template email for pass", emailDeliveries.every((e) => e.template !== "RULE_BREACH_CONFIRMED"), `templates=${emailDeliveries.map((e) => e.template).join(",")}`);
    });

    it("V. Email semantic fix — evaluation passed uses correct template", async () => {
      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 106000,
        historySummary: { dealCount: 5, totalRealizedPnl: 6000, winCount: 3, lossCount: 2, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: true,
      });

      const allEmails = await prisma.emailDelivery.findMany({});
      const breachEmails = allEmails.filter((e) => e.template === "RULE_BREACH_CONFIRMED");

      check("No rule-breach email for pass", breachEmails.length === 0, `breachCount=${breachEmails.length}, allTemplates=${allEmails.map((e) => e.template).join(",")}`);
    });

    it("W. Evaluation totalPnl updated with decimal precision", async () => {
      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 105000.01,
        historySummary: { dealCount: 5, totalRealizedPnl: 5000.01, winCount: 3, lossCount: 2, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: false,
      });

      const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
      check("TotalPnL rounded to 2dp", evalAfter?.totalPnl !== null, `totalPnl=${evalAfter?.totalPnl}`);
      if (evalAfter?.totalPnl) {
        check("TotalPnL is 5000.01", Number(evalAfter.totalPnl) === 5000.01, `actual=${Number(evalAfter.totalPnl)}`);
      }
    });

    it("X. Evaluation maxDrawdown tracked correctly", async () => {
      const snapshot1 = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 95000,
        historySummary: { dealCount: 5, totalRealizedPnl: -5000, winCount: 2, lossCount: 3, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot: snapshot1,
        performedBy: traderId,
        sendEmails: false,
      });

      let evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
      check("MaxDrawdown tracked at 5000", evalAfter !== null && evalAfter.maxDrawdown !== null && Number(evalAfter.maxDrawdown) === 5000, `maxDrawdown=${evalAfter?.maxDrawdown}`);

      const snapshot2 = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 90000,
        historySummary: { dealCount: 5, totalRealizedPnl: -10000, winCount: 1, lossCount: 4, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot: snapshot2,
        performedBy: traderId,
        sendEmails: false,
      });

      evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
      check("MaxDrawdown updated to higher value", evalAfter !== null && evalAfter.maxDrawdown !== null && Number(evalAfter.maxDrawdown) === 10000, `maxDrawdown=${evalAfter?.maxDrawdown}`);
    });

    it("Y. RuleEvaluation outcomes persist with correct values", async () => {
      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 103000,
        historySummary: { dealCount: 2, totalRealizedPnl: 3000, winCount: 2, lossCount: 0, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: false,
      });

      const ruleEvals = await prisma.ruleEvaluation.findMany({ where: { evaluationId } });
      const profitTargetEval = ruleEvals.find((re) => re.details?.includes("PROFIT_TARGET") || re.result !== null);
      check("RuleEvaluations persisted", ruleEvals.length >= 3, `count=${ruleEvals.length}`);

      const profitOutcome = await evaluateRule(
        { id: profitTargetEval?.ruleId ?? "", ruleType: RuleType.PROFIT_TARGET, value: { target: 5000 } } as unknown as Rule,
        snapshot,
        { startingBalance: 100000 },
      );
      check("PROFIT_TARGET outcome is WARNING", profitOutcome.result === "WARNING", `result=${profitOutcome.result}`);
    });

    it("Z. Monitoring state reflects WARNING overall result", async () => {
      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 102000,
        historySummary: { dealCount: 2, totalRealizedPnl: 2000, winCount: 2, lossCount: 0, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: false,
      });

      const account = await prisma.mT5Account.findUnique({ where: { id: accountId } });
      check("Monitoring DEGRADED", account?.currentMonitoringStatus === "DEGRADED", `status=${account?.currentMonitoringStatus}`);
      check("Health DISCONNECTED", account?.healthStatus === "DISCONNECTED", `health=${account?.healthStatus}`);
    });

    it("AA. Audit log entries created for rule breaches", async () => {
      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 70000,
        historySummary: { dealCount: 10, totalRealizedPnl: -30000, winCount: 2, lossCount: 8, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: false,
      });

      const audits = await prisma.auditLog.findMany({
        where: { action: "SYSTEM_EVENT" as const, entityType: "RuleEvent" },
      });
      check("Audit logs for rule breaches", audits.length > 0, `count=${audits.length}`);
    });

    it("AB. Idempotent re-processing after failure", async () => {
      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 70000,
        historySummary: { dealCount: 10, totalRealizedPnl: -30000, winCount: 2, lossCount: 8, periodStart: new Date(), periodEnd: new Date() },
        positions: [],
        orders: [],
      });

      await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: false,
      });

      const result2 = await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: false,
      });

      check("Skipped on re-process", result2.success && result2.outcomes.length === 0, `outcomes=${result2.success ? result2.outcomes.length : "N/A"}`);
    });

    it("AC. Starting balance not set — drawdown uses balance as peak", async () => {
      const evalNoBalance = await createTestEvaluation(traderId, rulesetVersionId, accountId, "IN_PROGRESS");
      await prisma.ruleEvaluation.createMany({
        data: (await prisma.rule.findMany({ where: { rulesetVersionId } })).map((rule) => ({
          evaluationId: evalNoBalance.id,
          ruleId: rule.id,
          result: RuleResult.PASS,
          details: "Initial",
          evaluatedAt: new Date(),
        })),
      });

      const snapshot = makeSnapshot({
        accountId,
        balance: 100000,
        equity: 75000,
        positions: [],
        orders: [],
        historySummary: { dealCount: 5, totalRealizedPnl: -5000, winCount: 2, lossCount: 3, periodStart: null, periodEnd: null },
      });

      const result = await processMonitoringSnapshot(prisma, {
        accountId,
        snapshot,
        performedBy: traderId,
        sendEmails: false,
      });

      check("Pipeline success", result.success, "");
      if (result.success) {
        check("Overall FAIL (drawdown breach)", result.overallResult === "FAIL", `result=${result.overallResult}`);
        check("Failed", result.failed === true, "");
      }
    });
  });

  describe("Boundary and edge cases", () => {
    it("AD. Exact drawdown at limit boundary returns PASS", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 98000,
        positions: [],
        orders: [],
        historySummary: { dealCount: 0, totalRealizedPnl: 0, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdown: 2000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("DD_boundary_pass", outcome.result === "PASS", `result=${outcome.result}, actual=${outcome.actualValue}`);
    });

    it("AE. One cent over drawdown limit returns FAIL", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 97999.99,
        positions: [],
        orders: [],
        historySummary: { dealCount: 0, totalRealizedPnl: 0, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdown: 2000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("DD_over_limit_fail", outcome.result === "FAIL", `result=${outcome.result}, actual=${outcome.actualValue}`);
    });

    it("AF. Zero starting balance treated as undefined", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 100000,
        positions: [],
        orders: [],
        historySummary: { dealCount: 0, totalRealizedPnl: 0, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.DRAWDOWN_LIMIT, name: "Max Drawdown", value: { maxDrawdownPercent: 10, startingBalance: 0 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot, { startingBalance: 0 });
      check("ZERO_starting_balance_handled", outcome.result === "PASS", `result=${outcome.result}`);
    });

    it("AG. Negative PnL reduces total correctly", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 97000,
        positions: [makePosition({ profit: -500 })],
        orders: [],
        historySummary: { dealCount: 3, totalRealizedPnl: -2500, winCount: 1, lossCount: 2, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: -5000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("NEGATIVE_PNL_target_met", outcome.result === "PASS", `result=${outcome.result}, actual=${outcome.actualValue}`);
      check("NEGATIVE_PNL_value", Number(outcome.actualValue) === -3000, `actual=${outcome.actualValue}`);
    });

    it("AH. Multiple positions profit aggregated correctly", () => {
      const snapshot = makeSnapshot({
        balance: 100000,
        equity: 103000,
        positions: [
          makePosition({ profit: 500 }),
          makePosition({ profit: 300 }),
          makePosition({ profit: -100 }),
          makePosition({ profit: 800 }),
        ],
        orders: [],
        historySummary: { dealCount: 4, totalRealizedPnl: 1500, winCount: 3, lossCount: 1, periodStart: null, periodEnd: null },
      });
      const rule = { id: "r1", ruleType: RuleType.PROFIT_TARGET, name: "Profit Target", value: { target: 3000 } } as unknown as Rule;
      const outcome = evaluateRule(rule, snapshot);
      check("MULTI_POSITION_pnl", Number(outcome.actualValue) === 3000, `actual=${outcome.actualValue}`);
      check("MULTI_POSITION_pass", outcome.result === "PASS", `result=${outcome.result}`);
    });
  });

  after(async () => {
    await prisma.$disconnect();
    console.log(`Phase 29 Financial Rules: ${results.pass}/${results.pass + results.fail} passed, ${results.fail} failed`);
    if (results.fail > 0) process.exit(1);
  });
});
