import assert from "node:assert/strict";
import {
  formatAccountSize,
  formatMoney,
  formatRuleCalculation,
  formatRuleValue,
} from "../lib/product-experience";

assert.equal(formatMoney(null, "USD"), "Not published");
assert.equal(formatAccountSize(null), "Not published");
assert.equal(formatRuleValue(null), "Not published");
assert.equal(
  formatRuleCalculation({
    metric: "EQUITY",
    method: "STATIC",
    reference: "Initial balance",
    requiredInputs: ["Balance", "Equity"],
  }),
  "Metric: EQUITY · Method: STATIC · Reference point: Initial balance · Data required: Balance, Equity",
);
assert.equal(formatRuleCalculation({}), "Calculation details not published");

console.log("Product display formatting tests passed.");
