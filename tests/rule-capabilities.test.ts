import assert from "node:assert/strict";
import test from "node:test";
import {
  RULE_CAPABILITY_REGISTRY,
  isRuleCalculationSupported,
  publicationReadyRuleTypes,
} from "../lib/rule-capabilities";

test("the central registry has an explicit capability for every supported product rule type", () => {
  assert.deepEqual(Object.keys(RULE_CAPABILITY_REGISTRY).sort(), [
    "DRAWDOWN_LIMIT",
    "MAX_DAILY_LOSS",
    "MAX_LEVERAGE",
    "MAX_OPEN_TRADES",
    "MIN_TRADES",
    "MIN_TRADING_DAYS",
    "PROFIT_TARGET",
    "TRADING_HOURS",
    "TRADING_SESSION",
  ]);
  assert.deepEqual(publicationReadyRuleTypes(), ["DRAWDOWN_LIMIT", "MAX_OPEN_TRADES", "MAX_LEVERAGE"]);
});

test("runtime and publication allow only the registered calculation methods and comparisons", () => {
  assert.equal(isRuleCalculationSupported("DRAWDOWN_LIMIT", "STATIC_STARTING_EQUITY", "STRICTLY_GREATER_THAN"), true);
  assert.equal(isRuleCalculationSupported("DRAWDOWN_LIMIT", "TRAILING_PEAK_EQUITY", "STRICTLY_GREATER_THAN"), false);
  assert.equal(isRuleCalculationSupported("MAX_OPEN_TRADES", "COUNT_OPEN_POSITIONS_AND_PENDING_ORDERS", "GREATER_THAN"), true);
  assert.equal(isRuleCalculationSupported("MAX_OPEN_TRADES", "COUNT_OPEN_POSITIONS_AND_PENDING_ORDERS", "GREATER_THAN_OR_EQUAL"), false);
  assert.equal(isRuleCalculationSupported("MAX_LEVERAGE", "SNAPSHOT_ACCOUNT_LEVERAGE", "GREATER_THAN"), true);
  assert.equal(isRuleCalculationSupported("PROFIT_TARGET", "REALIZED_PLUS_FLOATING_PNL", "GREATER_THAN_OR_EQUAL"), false);
  assert.equal(isRuleCalculationSupported("UNRECOGNIZED", "anything"), false);
});
