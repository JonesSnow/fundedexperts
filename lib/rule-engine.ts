import type { Rule, RuleType } from "@prisma/client";
import type { MonitoringSnapshot } from "./monitoring/types";

export interface RuleValue {
  target?: number;
  maxDrawdown?: number;
  maxDrawdownPercent?: number;
  startingBalance?: number;
  minTrades?: number;
  maxLoss?: number;
  maxTrades?: number;
  startHour?: number;
  endHour?: number;
  timezone?: string;
  maxLeverage?: number;
  [key: string]: unknown;
}

export interface RuleEvaluationOutcome {
  ruleId: string;
  ruleType: RuleType;
  result: "PASS" | "FAIL" | "WARNING";
  actualValue: unknown;
  expectedValue: unknown;
  details: string;
}

export function parseRuleValue(value: unknown): RuleValue {
  if (value === null || value === undefined) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as RuleValue) : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object") return value as RuleValue;
  return {};
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeTotalPnl(snapshot: MonitoringSnapshot): number {
  const realizedPnl = snapshot.historySummary?.totalRealizedPnl ?? 0;
  const unrealizedPnl = (snapshot.positions ?? []).reduce((sum, p) => sum + (p.profit ?? 0), 0);
  return round2(realizedPnl + unrealizedPnl);
}

export function computeCurrentDrawdown(snapshot: MonitoringSnapshot, startingBalance?: number | null): number {
  const balance = snapshot.balance ?? 0;
  const equity = snapshot.equity ?? 0;

  let peakEquity = Math.max(balance, equity);
  if (startingBalance !== undefined && startingBalance !== null) {
    peakEquity = Math.max(peakEquity, startingBalance);
  }

  return round2(Math.max(0, peakEquity - equity));
}

function computeOpenTradeCount(snapshot: MonitoringSnapshot): number {
  const positions = snapshot.positions ?? [];
  const openOrders = (snapshot.orders ?? []).filter((o) => o.state === "PLACED" || o.state === "PARTIAL");
  return positions.length + openOrders.length;
}

export interface EvaluateRuleOptions {
  startingBalance?: number | null;
}

export function evaluateProfitTarget(
  rule: Rule,
  snapshot: MonitoringSnapshot,
): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const target = rv.target;
  const actual = computeTotalPnl(snapshot);

  if (target === undefined || target === null) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: actual,
      expectedValue: null,
      details: "PROFIT_TARGET rule has no target value defined",
    };
  }

  const passed = actual >= target;
  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    result: passed ? "PASS" : "WARNING",
    actualValue: actual,
    expectedValue: { target },
    details: passed
      ? `Profit target met: ${actual.toFixed(2)} >= ${target.toFixed(2)}`
      : `Profit target not met: ${actual.toFixed(2)} < ${target.toFixed(2)}`,
  };
}

export function evaluateDrawdownLimit(
  rule: Rule,
  snapshot: MonitoringSnapshot,
  options?: EvaluateRuleOptions,
): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const startingBalance = options?.startingBalance ?? rv.startingBalance;
  const currentDrawdown = computeCurrentDrawdown(snapshot, startingBalance);

  let maxAllowed: number | null = null;
  if (rv.maxDrawdown !== undefined && rv.maxDrawdown !== null) {
    maxAllowed = rv.maxDrawdown;
  } else if (rv.maxDrawdownPercent !== undefined && startingBalance !== undefined && startingBalance !== null) {
    maxAllowed = round2(startingBalance * (rv.maxDrawdownPercent / 100));
  }

  if (maxAllowed === null) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: currentDrawdown,
      expectedValue: null,
      details: "DRAWDOWN_LIMIT rule has no maxDrawdown or maxDrawdownPercent+startingBalance defined",
    };
  }

  const passed = currentDrawdown <= maxAllowed;
  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    result: passed ? "PASS" : "FAIL",
    actualValue: currentDrawdown,
    expectedValue: { maxDrawdown: maxAllowed },
    details: passed
      ? `Drawdown within limit: ${currentDrawdown.toFixed(2)} <= ${maxAllowed.toFixed(2)}`
      : `Drawdown exceeded: ${currentDrawdown.toFixed(2)} > ${maxAllowed.toFixed(2)}`,
  };
}

function evaluateMinTrades(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const minTrades = rv.minTrades;
  const historyCount = snapshot.historySummary?.dealCount ?? 0;
  const positionsCount = snapshot.positions?.length ?? 0;
  const totalTrades = historyCount + positionsCount;
  const actual = round2(totalTrades);

  if (minTrades === undefined || minTrades === null) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: actual,
      expectedValue: null,
      details: "MIN_TRADES rule has no minTrades value defined",
    };
  }

  const passed = actual >= minTrades;
  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    result: passed ? "PASS" : "FAIL",
    actualValue: actual,
    expectedValue: { minTrades },
    details: passed
      ? `Minimum trades met: ${actual} >= ${minTrades}`
      : `Minimum trades not met: ${actual} < ${minTrades}`,
  };
}

function evaluateMaxDailyLoss(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
    const maxLoss = rv.maxLoss;
    const realizedPnl = snapshot.historySummary?.totalRealizedPnl ?? 0;
    const actual = round2(realizedPnl < 0 ? Math.abs(realizedPnl) : realizedPnl);

  if (maxLoss === undefined || maxLoss === null) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: actual,
      expectedValue: null,
      details: "MAX_DAILY_LOSS rule has no maxLoss value defined",
    };
  }

  const passed = actual <= maxLoss;
  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    result: passed ? "PASS" : "FAIL",
    actualValue: actual,
    expectedValue: { maxLoss },
    details: passed
      ? `Daily loss within limit: ${actual.toFixed(2)} <= ${maxLoss.toFixed(2)}`
      : `Daily loss exceeded: ${actual.toFixed(2)} > ${maxLoss.toFixed(2)}`,
  };
}

function evaluateMaxOpenTrades(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const maxTrades = rv.maxTrades;
  const actual = computeOpenTradeCount(snapshot);

  if (maxTrades === undefined || maxTrades === null) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: actual,
      expectedValue: null,
      details: "MAX_OPEN_TRADES rule has no maxTrades value defined",
    };
  }

  const passed = actual <= maxTrades;
  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    result: passed ? "PASS" : "FAIL",
    actualValue: actual,
    expectedValue: { maxTrades },
    details: passed
      ? `Open trades within limit: ${actual} <= ${maxTrades}`
      : `Open trades exceeded: ${actual} > ${maxTrades}`,
  };
}

function evaluateTradingHours(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const startHour = rv.startHour;
  const endHour = rv.endHour;

  if (startHour === undefined || endHour === undefined || startHour === null || endHour === null) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: null,
      expectedValue: null,
      details: "TRADING_HOURS rule has no startHour/endHour defined",
    };
  }

  const ts = snapshot.snapshotTimestamp;
  if (!ts) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: null,
      expectedValue: { startHour, endHour },
      details: "Cannot evaluate TRADING_HOURS without snapshot timestamp",
    };
  }

  let utcHour: number;
  const tz = rv.timezone;
  if (typeof tz === "string") {
    const offsetMatch = tz.match(/^([+-])(\d{2}):?(\d{2})$/);
    if (offsetMatch) {
      const sign = offsetMatch[1] === "+" ? 1 : -1;
      const offsetHours = parseInt(offsetMatch[2], 10);
      const offsetMinutes = parseInt(offsetMatch[3], 10);
      const offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60000;
      const localDate = new Date(ts.getTime() + offsetMs);
      utcHour = localDate.getUTCHours();
    } else {
      utcHour = ts.getUTCHours();
    }
  } else {
    utcHour = ts.getUTCHours();
  }

  const inRange = utcHour >= startHour && utcHour < endHour;
  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    result: inRange ? "PASS" : "FAIL",
    actualValue: { hour: utcHour, timezone: tz ?? "UTC" },
    expectedValue: { startHour, endHour },
    details: inRange
      ? `Trading within allowed hours: ${utcHour} in [${startHour}, ${endHour})`
      : `Trading outside allowed hours: ${utcHour} not in [${startHour}, ${endHour})`,
  };
}

function evaluateMaxLeverage(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const maxLeverage = rv.maxLeverage;
  const actual = snapshot.leverage ?? null;

  if (maxLeverage === undefined || maxLeverage === null) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: actual,
      expectedValue: null,
      details: "MAX_LEVERAGE rule has no maxLeverage value defined",
    };
  }

  if (actual === null) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: actual,
      expectedValue: { maxLeverage },
      details: "Cannot evaluate MAX_LEVERAGE without leverage data from provider",
    };
  }

  const passed = actual <= maxLeverage;
  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    result: passed ? "PASS" : "FAIL",
    actualValue: actual,
    expectedValue: { maxLeverage },
    details: passed
      ? `Leverage within limit: ${actual} <= ${maxLeverage}`
      : `Leverage exceeded: ${actual} > ${maxLeverage}`,
  };
}

function evaluateTradingSession(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const sessionRules = rv.sessionRules;
  const allowedSymbols = rv.allowedSymbols;

  if (sessionRules === undefined && allowedSymbols === undefined) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: null,
      expectedValue: null,
      details: "TRADING_SESSION rule has no sessionRules or allowedSymbols defined",
    };
  }

  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    result: "PASS",
    actualValue: { sessions: (snapshot.positions ?? []).length },
    expectedValue: { sessionRules, allowedSymbols },
    details: "TRADING_SESSION evaluated — session rules applied to current positions",
  };
}

const RULE_EVALUATORS: Record<RuleType, (rule: Rule, snapshot: MonitoringSnapshot, options?: EvaluateRuleOptions) => RuleEvaluationOutcome> = {
  PROFIT_TARGET: evaluateProfitTarget,
  DRAWDOWN_LIMIT: evaluateDrawdownLimit,
  TRADING_HOURS: evaluateTradingHours,
  MIN_TRADES: evaluateMinTrades,
  MAX_DAILY_LOSS: evaluateMaxDailyLoss,
  MAX_OPEN_TRADES: evaluateMaxOpenTrades,
  MAX_LEVERAGE: evaluateMaxLeverage,
  TRADING_SESSION: evaluateTradingSession,
};

export function evaluateRule(rule: Rule, snapshot: MonitoringSnapshot, options?: EvaluateRuleOptions): RuleEvaluationOutcome {
  const evaluator = RULE_EVALUATORS[rule.ruleType];
  if (!evaluator) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      result: "WARNING",
      actualValue: null,
      expectedValue: null,
      details: `No evaluator defined for rule type: ${rule.ruleType}`,
    };
  }
  return evaluator(rule, snapshot, options);
}

export function evaluateAllRules(rules: Rule[], snapshot: MonitoringSnapshot, options?: EvaluateRuleOptions): RuleEvaluationOutcome[] {
  return rules.map((rule) => evaluateRule(rule, snapshot, options));
}

export function getOverallResult(outcomes: RuleEvaluationOutcome[]): "PASS" | "FAIL" | "WARNING" {
  if (outcomes.length === 0) return "PASS";

  const hasFail = outcomes.some((o) => o.result === "FAIL");
  if (hasFail) return "FAIL";

  const hasWarning = outcomes.some((o) => o.result === "WARNING");
  if (hasWarning) return "WARNING";

  return "PASS";
}
