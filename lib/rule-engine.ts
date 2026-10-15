import type { Rule, RuleType } from "@prisma/client";
import type { MonitoringSnapshot } from "./monitoring/types";
import { getRuleCapability, isRuleCalculationSupported } from "./rule-capabilities";
import {
  countUniqueCompletedTrades,
  countUniqueTradingDays,
  evaluateAllowedSymbols,
  evaluateDailyLoss,
  evaluateDrawdown,
  evaluateMinimumCount,
  evaluateTradingHours as calculateTradingHours,
  type CalculationResult,
  type CalculationState,
  getDataFreshnessState,
  type DailyLossDefinition,
  type TradingHoursDefinition,
} from "./evaluation-calculations";

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
  /** Warning is the persisted Prisma enum for both incomplete and unavailable outcomes. */
  state?: CalculationState | "PENDING";
  calculationMethod?: string | null;
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

const OPEN_MT5_ORDER_STATES = new Set(["STARTED", "PLACED", "PARTIAL", "REQUEST_ADD", "REQUEST_MODIFY", "REQUEST_CANCEL"]);

function computeOpenTradeCount(snapshot: MonitoringSnapshot): number | null {
  const positions = snapshot.positions ?? [];
  const orders = snapshot.orders ?? [];
  if (orders.some((order) => typeof order.state !== "string")) return null;
  const openOrders = orders.filter((order) => OPEN_MT5_ORDER_STATES.has(order.state!));
  return positions.length + openOrders.length;
}

export interface EvaluateRuleOptions {
  startingBalance?: number | null;
  asOf?: Date;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function ruleOutcome(rule: Rule, calculation: CalculationResult, method: unknown): RuleEvaluationOutcome {
  const result = calculation.state === "PASS" ? "PASS" : calculation.state === "FAIL" ? "FAIL" : "WARNING";
  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    result,
    state: calculation.state,
    calculationMethod: typeof method === "string" ? method : null,
    actualValue: calculation.actualValue,
    expectedValue: calculation.expectedValue,
    details: calculation.details,
  };
}

function unavailableRule(rule: Rule, message: string, method?: unknown): RuleEvaluationOutcome {
  return ruleOutcome(rule, {
    state: "UNAVAILABLE",
    actualValue: null,
    expectedValue: null,
    details: `UNAVAILABLE: ${message}`,
  }, method);
}

function requiredRule(rule: Rule): boolean {
  return rule.disposition === "REQUIRED" && rule.isRequired !== false;
}

function calculationFresh(rule: Rule, snapshot: MonitoringSnapshot, asOf: Date, methodName: string): CalculationResult {
  const calculation = record(rule.calculation);
  if (!calculation || calculation.method !== methodName || calculation.schemaVersion !== 1) {
    return { state: "UNAVAILABLE", actualValue: null, expectedValue: null, details: `UNAVAILABLE: rule has no supported, versioned ${methodName} calculation definition` };
  }
  const maxAge = calculation.maxSnapshotAgeMs;
  const freshness = getDataFreshnessState(snapshot.dataTimestamp, asOf, typeof maxAge === "number" ? maxAge : Number.NaN);
  if (freshness === "STALE") return { state: "STALE", actualValue: null, expectedValue: null, details: "STALE: source data exceeds the configured freshness limit" };
  if (freshness !== "PASS") return { state: "UNAVAILABLE", actualValue: null, expectedValue: null, details: "UNAVAILABLE: source data is missing, future-dated, or has no explicit freshness limit" };
  return { state: "PASS", actualValue: null, expectedValue: null, details: "" };
}

export function evaluateProfitTarget(
  rule: Rule,
  snapshot: MonitoringSnapshot,
  options?: EvaluateRuleOptions,
): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const calculation = record(rule.calculation);
  if (!requiredRule(rule)) return unavailableRule(rule, "rule is optional or unresolved and cannot be enforced", calculation?.method);
  const freshness = calculationFresh(rule, snapshot, options?.asOf ?? snapshot.snapshotTimestamp, "REALIZED_PLUS_FLOATING_PNL");
  if (freshness.state !== "PASS") return ruleOutcome(rule, freshness, calculation?.method);
  if (snapshot.tradeHistoryComplete !== true || !snapshot.dataQuality?.historyAvailable) return unavailableRule(rule, "complete trade history is unavailable", calculation?.method);
  if (!snapshot.dataQuality.positionsAvailable) return unavailableRule(rule, "open-position data for floating PnL is unavailable", calculation?.method);
  if (typeof rv.target !== "number" || !Number.isFinite(rv.target) || typeof snapshot.historySummary?.totalRealizedPnl !== "number") {
    return unavailableRule(rule, "profit target threshold or realized PnL input is missing", calculation?.method);
  }
  if (calculation?.breachComparison !== "GREATER_THAN_OR_EQUAL") return unavailableRule(rule, "profit-target comparison policy is unsupported", calculation?.method);
  if (snapshot.positions.some((position) => typeof position.profit !== "number" || !Number.isFinite(position.profit))) {
    return unavailableRule(rule, "floating PnL is missing for one or more positions", calculation?.method);
  }
  const currentPnl = round2(snapshot.historySummary.totalRealizedPnl + snapshot.positions.reduce((sum, position) => sum + position.profit!, 0));
  const state: CalculationState = currentPnl >= rv.target ? "PASS" : "INCOMPLETE";
  return ruleOutcome(rule, {
    state,
    actualValue: currentPnl,
    expectedValue: { target: rv.target },
    details: `${state}: net realized and floating PnL ${currentPnl.toFixed(2)} against target ${rv.target.toFixed(2)}`,
  }, calculation?.method);
}

export function evaluateDrawdownLimit(
  rule: Rule,
  snapshot: MonitoringSnapshot,
  options?: EvaluateRuleOptions,
): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const calculation = record(rule.calculation);
  if (!requiredRule(rule)) return unavailableRule(rule, "rule is optional or unresolved and cannot be enforced", calculation?.method);
  const method = calculation?.method;
  const asOf = options?.asOf ?? snapshot.snapshotTimestamp;
  const freshness = calculationFresh(rule, snapshot, asOf, typeof method === "string" ? method : "unsupported");
  if (freshness.state !== "PASS") return ruleOutcome(rule, freshness, method);
  let maxAllowed = rv.maxDrawdown;
  if ((typeof maxAllowed !== "number" || !Number.isFinite(maxAllowed)) && typeof rv.maxDrawdownPercent === "number" && Number.isFinite(rv.maxDrawdownPercent)) {
    const startingBalance = options?.startingBalance ?? rv.startingBalance;
    if (typeof startingBalance !== "number" || !Number.isFinite(startingBalance)) return unavailableRule(rule, "percentage drawdown requires the purchased starting-balance reference", method);
    maxAllowed = startingBalance * rv.maxDrawdownPercent / 100;
  }
  if (typeof maxAllowed !== "number" || !Number.isFinite(maxAllowed) || maxAllowed < 0) return unavailableRule(rule, "drawdown threshold is missing or invalid", method);
  if (method !== "STATIC_STARTING_EQUITY" && method !== "TRAILING_PEAK_EQUITY") return unavailableRule(rule, "drawdown model is unsupported", method);
  if (calculation?.breachComparison !== "STRICTLY_GREATER_THAN" && calculation?.breachComparison !== "GREATER_THAN_OR_EQUAL") return unavailableRule(rule, "drawdown breach comparison is unsupported", method);
  const result = evaluateDrawdown({
    equity: snapshot.equity,
    startingBalance: options?.startingBalance ?? rv.startingBalance ?? null,
    historicalPeakEquity: snapshot.historicalPeakEquity ?? null,
    maxDrawdown: maxAllowed,
    model: method,
    breachComparison: calculation.breachComparison,
    historyComplete: snapshot.equityHistoryComplete === true,
    dataTimestamp: snapshot.dataTimestamp,
    asOf,
    maxSnapshotAgeMs: calculation!.maxSnapshotAgeMs as number,
  });
  return ruleOutcome(rule, result, method);
}

function evaluateMinTrades(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const calculation = record(rule.calculation);
  if (!requiredRule(rule)) return unavailableRule(rule, "rule is optional or unresolved and cannot be enforced", calculation?.method);
  if (calculation?.schemaVersion !== 1 || calculation.method !== "COUNT_DISTINCT_COMPLETED_TRADES") return unavailableRule(rule, "qualifying completed-trade calculation is unsupported or unresolved", calculation?.method);
  if (calculation.breachComparison !== "GREATER_THAN_OR_EQUAL") return unavailableRule(rule, "minimum-trades comparison policy is unsupported", calculation.method);
  const freshness = calculationFresh(rule, snapshot, snapshot.snapshotTimestamp, "COUNT_DISTINCT_COMPLETED_TRADES");
  if (freshness.state !== "PASS") return ruleOutcome(rule, freshness, calculation.method);
  if (snapshot.tradeHistoryComplete !== true || !snapshot.dataQuality?.historyAvailable) return unavailableRule(rule, "complete trade history is unavailable", calculation.method);
  return ruleOutcome(rule, evaluateMinimumCount(countUniqueCompletedTrades(snapshot.activityEvents ?? null), rv.minTrades ?? Number.NaN, "Minimum trades"), calculation.method);
}

function evaluateMinTradingDays(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const calculation = record(rule.calculation);
  if (!requiredRule(rule)) return unavailableRule(rule, "rule is optional or unresolved and cannot be enforced", calculation?.method);
  if (calculation?.schemaVersion !== 1 || calculation.method !== "COUNT_DISTINCT_COMPLETED_TRADE_DATES" || typeof calculation.timezone !== "string") {
    return unavailableRule(rule, "minimum trading-days policy or timezone is unsupported or unresolved", calculation?.method);
  }
  if (calculation.breachComparison !== "GREATER_THAN_OR_EQUAL") return unavailableRule(rule, "minimum trading-days comparison policy is unsupported", calculation.method);
  const freshness = calculationFresh(rule, snapshot, snapshot.snapshotTimestamp, "COUNT_DISTINCT_COMPLETED_TRADE_DATES");
  if (freshness.state !== "PASS") return ruleOutcome(rule, freshness, calculation.method);
  if (snapshot.tradeHistoryComplete !== true || !snapshot.dataQuality?.historyAvailable) return unavailableRule(rule, "complete trade history is unavailable", calculation.method);
  const days = countUniqueTradingDays(snapshot.activityEvents ?? null, calculation.timezone);
  const minimum = typeof rv.minTradingDays === "number" ? rv.minTradingDays : Number.NaN;
  return ruleOutcome(rule, evaluateMinimumCount(days, minimum, "Minimum trading days"), calculation.method);
}

function evaluateMaxDailyLoss(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const calculation = record(rule.calculation);
  if (!requiredRule(rule)) return unavailableRule(rule, "rule is optional or unresolved and cannot be enforced", calculation?.method);
  if (typeof rv.maxLoss !== "number" || !calculation || calculation.schemaVersion !== 1 || calculation.method !== "NET_PNL_COMPONENTS") {
    return unavailableRule(rule, "daily-loss limit or supported explicit calculation definition is missing", calculation?.method);
  }
  const result = evaluateDailyLoss({
    asOf: snapshot.snapshotTimestamp,
    dataTimestamp: snapshot.dataTimestamp,
    maxLoss: rv.maxLoss,
    components: snapshot.dailyPnl ?? null,
  }, calculation as unknown as DailyLossDefinition);
  return ruleOutcome(rule, result, calculation.method);
}

function evaluateMaxOpenTrades(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const calculation = record(rule.calculation);
  if (!requiredRule(rule)) return unavailableRule(rule, "rule is optional or unresolved and cannot be enforced", calculation?.method);
  const freshness = calculationFresh(rule, snapshot, snapshot.snapshotTimestamp, "COUNT_OPEN_POSITIONS_AND_PENDING_ORDERS");
  if (freshness.state !== "PASS") return ruleOutcome(rule, freshness, calculation?.method);
  if (typeof rv.maxTrades !== "number" || !snapshot.dataQuality?.positionsAvailable || !snapshot.dataQuality.ordersAvailable) return unavailableRule(rule, "open-position or pending-order data is incomplete", calculation?.method);
  if (calculation?.breachComparison !== "GREATER_THAN") return unavailableRule(rule, "maximum-open-trades comparison policy is unsupported", calculation?.method);
  const actual = computeOpenTradeCount(snapshot);
  if (actual === null) return unavailableRule(rule, "one or more order states are missing and cannot be classified safely", calculation?.method);
  const state: CalculationState = actual > rv.maxTrades ? "FAIL" : "PASS";
  return ruleOutcome(rule, { state, actualValue: actual, expectedValue: { maxTrades: rv.maxTrades }, details: `${state}: open trade count ${actual}; configured maximum ${rv.maxTrades}` }, calculation?.method);
}

function evaluateTradingHours(rule: Rule, snapshot: MonitoringSnapshot, options?: EvaluateRuleOptions): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const calculation = record(rule.calculation);
  if (!requiredRule(rule)) return unavailableRule(rule, "rule is optional or unresolved and cannot be enforced", calculation?.method);
  const definition: TradingHoursDefinition = {
    schemaVersion: calculation?.schemaVersion as 1,
    method: calculation?.method as TradingHoursDefinition["method"],
    timezone: (calculation?.timezone ?? rv.timezone) as string,
    startTime: (calculation?.startTime ?? rv.startTime) as string,
    endTime: (calculation?.endTime ?? rv.endTime) as string,
    allowedDays: (calculation?.allowedDays ?? rv.allowedDays) as number[],
  };
  if (!calculation || calculation.method !== "EVENT_WITHIN_WEEKLY_WINDOW") return unavailableRule(rule, "trading-hours policy is unresolved or unsupported", calculation?.method);
  if (calculation.breachComparison !== "OUTSIDE_CONFIGURED_POLICY") return unavailableRule(rule, "trading-hours breach policy is unsupported", calculation.method);
  if (snapshot.activityEventsComplete !== true) return unavailableRule(rule, "complete activity data for the trading-hours evaluation window is unavailable", calculation.method);
  return ruleOutcome(rule, calculateTradingHours({
    events: snapshot.activityEvents ?? null,
    asOf: options?.asOf ?? snapshot.snapshotTimestamp,
    dataTimestamp: snapshot.dataTimestamp,
    maxSnapshotAgeMs: calculation.maxSnapshotAgeMs as number,
  }, definition), calculation.method);
}

function evaluateMaxLeverage(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const calculation = record(rule.calculation);
  const maxLeverage = rv.maxLeverage;
  const actual = snapshot.leverage ?? null;
  if (!requiredRule(rule)) return unavailableRule(rule, "rule is optional or unresolved and cannot be enforced", calculation?.method);
  const freshness = calculationFresh(rule, snapshot, snapshot.snapshotTimestamp, "SNAPSHOT_ACCOUNT_LEVERAGE");
  if (freshness.state !== "PASS") return ruleOutcome(rule, freshness, calculation?.method);
  if (typeof maxLeverage !== "number" || actual === null || !Number.isFinite(actual)) return unavailableRule(rule, "leverage threshold or provider input is missing", calculation?.method);
  if (calculation?.breachComparison !== "GREATER_THAN") return unavailableRule(rule, "maximum-leverage comparison policy is unsupported", calculation?.method);
  const state: CalculationState = actual > maxLeverage ? "FAIL" : "PASS";
  return ruleOutcome(rule, { state, actualValue: actual, expectedValue: { maxLeverage }, details: `${state}: account leverage ${actual}; configured maximum ${maxLeverage}` }, calculation?.method);
}

function evaluateTradingSession(rule: Rule, snapshot: MonitoringSnapshot): RuleEvaluationOutcome {
  const rv = parseRuleValue(rule.value);
  const calculation = record(rule.calculation);
  if (!requiredRule(rule)) return unavailableRule(rule, "rule is optional or unresolved and cannot be enforced", calculation?.method);
  if (calculation?.schemaVersion !== 1 || calculation.method !== "ALLOWED_SYMBOLS") return unavailableRule(rule, "session policy is unsupported or unresolved", calculation?.method);
  if (calculation.breachComparison !== "OUTSIDE_CONFIGURED_POLICY") return unavailableRule(rule, "session breach policy is unsupported", calculation.method);
  const freshness = calculationFresh(rule, snapshot, snapshot.snapshotTimestamp, "ALLOWED_SYMBOLS");
  if (freshness.state !== "PASS") return ruleOutcome(rule, freshness, calculation.method);
  if (snapshot.activityEventsComplete !== true) return unavailableRule(rule, "complete activity data for the trading-session evaluation window is unavailable", calculation.method);
  return ruleOutcome(rule, evaluateAllowedSymbols(snapshot.activityEvents ?? null, rv.allowedSymbols), calculation.method);
}

const RULE_EVALUATORS: Partial<Record<string, (rule: Rule, snapshot: MonitoringSnapshot, options?: EvaluateRuleOptions) => RuleEvaluationOutcome>> = {
  PROFIT_TARGET: evaluateProfitTarget,
  DRAWDOWN_LIMIT: evaluateDrawdownLimit,
  TRADING_HOURS: evaluateTradingHours,
  MIN_TRADES: evaluateMinTrades,
  MIN_TRADING_DAYS: evaluateMinTradingDays,
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
      details: `UNAVAILABLE: No evaluator defined for rule type: ${rule.ruleType}`,
      state: "UNAVAILABLE",
      calculationMethod: null,
    };
  }
  return evaluator(rule, snapshot, options);
}

export function evaluateAllRules(rules: Rule[], snapshot: MonitoringSnapshot, options?: EvaluateRuleOptions): RuleEvaluationOutcome[] {
  return rules.filter(requiredRule).map((rule) => {
    const capability = getRuleCapability(rule.ruleType);
    const calculation = record(rule.calculation);
    if (!capability || capability.status === "UNSUPPORTED") {
      return unavailableRule(rule, capability?.reason ?? "no evaluator capability is registered", calculation?.method);
    }
    if (!isRuleCalculationSupported(rule.ruleType, calculation?.method, calculation?.breachComparison)) {
      return unavailableRule(rule, capability.reason, calculation?.method);
    }
    return evaluateRule(rule, snapshot, options);
  });
}

export function getOverallResult(outcomes: RuleEvaluationOutcome[]): "PASS" | "FAIL" | "WARNING" {
  if (outcomes.length === 0) return "WARNING";

  const hasFail = outcomes.some((o) => o.result === "FAIL");
  if (hasFail) return "FAIL";

  const hasWarning = outcomes.some((o) => o.result === "WARNING");
  if (hasWarning) return "WARNING";

  return "PASS";
}
