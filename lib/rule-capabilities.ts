import type { ProductRuleType } from "./product-domain";

export type RuleCapabilityStatus = "SUPPORTED" | "LIMITED" | "UNSUPPORTED";

export interface RuleCalculationCapability {
  method: string;
  breachComparisons: readonly string[];
  requiredInputs: readonly string[];
}

export interface RuleCapability {
  status: RuleCapabilityStatus;
  reason: string;
  calculations: readonly RuleCalculationCapability[];
}

const unsupported = (reason: string): RuleCapability => ({
  status: "UNSUPPORTED",
  reason,
  calculations: [],
});

/**
 * The single publication/runtime readiness registry for customer-facing rule
 * terms. Methods are enabled only where the live normalization and evaluator
 * have a deterministic input contract; test fixtures alone do not enable a
 * capability.
 */
export const RULE_CAPABILITY_REGISTRY: Record<ProductRuleType, RuleCapability> = {
  PROFIT_TARGET: unsupported(
    "The live MT5 history path does not prove complete history and totals deal profit without commission and swap costs.",
  ),
  DRAWDOWN_LIMIT: {
    status: "LIMITED",
    reason: "Only static starting-equity drawdown is supported. Trailing peak drawdown needs a complete live equity history that the current adapter does not provide.",
    calculations: [{
      method: "STATIC_STARTING_EQUITY",
      breachComparisons: ["STRICTLY_GREATER_THAN", "GREATER_THAN_OR_EQUAL"],
      requiredInputs: ["equity", "startingBalance", "dataTimestamp"],
    }],
  },
  TRADING_HOURS: unsupported(
    "The current live adapter does not provide a complete, verified activity-event window for checking every trade timestamp.",
  ),
  MIN_TRADES: unsupported(
    "The current live adapter does not provide a complete, uniquely identified trade-event history.",
  ),
  MIN_TRADING_DAYS: unsupported(
    "The current live adapter does not provide a complete, uniquely identified trade-event history for timezone-based day counting.",
  ),
  MAX_DAILY_LOSS: unsupported(
    "The current live adapter does not provide PnL components with a verified daily reset period.",
  ),
  MAX_OPEN_TRADES: {
    status: "SUPPORTED",
    reason: "Requires a fresh snapshot with both positions and pending-order arrays present and recognized MT5 order states.",
    calculations: [{
      method: "COUNT_OPEN_POSITIONS_AND_PENDING_ORDERS",
      breachComparisons: ["GREATER_THAN"],
      requiredInputs: ["positions", "orders", "dataTimestamp"],
    }],
  },
  MAX_LEVERAGE: {
    status: "SUPPORTED",
    reason: "Requires a fresh account snapshot with a finite leverage value from the provider.",
    calculations: [{
      method: "SNAPSHOT_ACCOUNT_LEVERAGE",
      breachComparisons: ["GREATER_THAN"],
      requiredInputs: ["leverage", "dataTimestamp"],
    }],
  },
  TRADING_SESSION: unsupported(
    "The current live adapter does not provide complete activity events. The implemented evaluator checks allowed symbols only and does not enforce general trading-session terms.",
  ),
};

export function getRuleCapability(ruleType: string): RuleCapability | null {
  return Object.prototype.hasOwnProperty.call(RULE_CAPABILITY_REGISTRY, ruleType)
    ? RULE_CAPABILITY_REGISTRY[ruleType as ProductRuleType]
    : null;
}

export function allowedCalculationForRule(
  ruleType: string,
  method: unknown,
): RuleCalculationCapability | null {
  if (typeof method !== "string") return null;
  const capability = getRuleCapability(ruleType);
  if (!capability || capability.status === "UNSUPPORTED") return null;
  return capability.calculations.find((calculation) => calculation.method === method) ?? null;
}

export function isRuleCalculationSupported(
  ruleType: string,
  method: unknown,
  breachComparison?: unknown,
): boolean {
  const calculation = allowedCalculationForRule(ruleType, method);
  return calculation !== null && (
    breachComparison === undefined || calculation.breachComparisons.includes(String(breachComparison))
  );
}

export function publicationReadyRuleTypes(): ProductRuleType[] {
  return (Object.keys(RULE_CAPABILITY_REGISTRY) as ProductRuleType[])
    .filter((ruleType) => RULE_CAPABILITY_REGISTRY[ruleType].status !== "UNSUPPORTED");
}
