import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCalculationDefinition,
  buildProductOrderSnapshot,
  hasDuplicateProductCode,
  validateProductForPublication,
  validateRulesetForPublication,
  type ProductConfiguration,
  type ProductRuleConfiguration,
  type ProductStageConfiguration,
} from "../lib/product-domain";
import { validateCreateOrderInput } from "../lib/order-validation";

function profitTargetRule(): ProductRuleConfiguration {
  return {
    name: "Profit target",
    ruleType: "PROFIT_TARGET",
    disposition: "REQUIRED",
    value: { target: 8 },
    calculation: {
      schemaVersion: 1,
      metric: "Realized plus floating PnL",
      method: "REALIZED_PLUS_FLOATING_PNL",
      reference: "purchased order terms",
      breachComparison: "GREATER_THAN_OR_EQUAL",
      evaluationTiming: "continuous snapshot evaluation",
      requiredInputs: ["realized PnL", "open position PnL"],
      maxSnapshotAgeMs: 120_000,
    },
  };
}

function publishedVersion(id: string) {
  return { id, version: "1.0.0", status: "PUBLISHED", rules: [profitTargetRule()] };
}

function twoStageProduct(): ProductConfiguration {
  const stages: ProductStageConfiguration[] = [1, 2].map((stageOrder) => ({
    id: `stage-${stageOrder}`,
    stageKey: `stage-${stageOrder}`,
    displayName: `Stage ${stageOrder}`,
    stageOrder,
    rulesetVersion: publishedVersion(`ruleset-version-${stageOrder}`),
  }));
  return {
    id: "product-id",
    code: "pro-sample-25k",
    name: "Sample Pro",
    category: "PRO",
    evaluationStructure: "TWO_STEP",
    status: "DRAFT",
    accountSize: "25000.00",
    denominationCurrency: "USD",
    price: "79.00",
    currency: "USD",
    stages,
  };
}

test("accepts a complete staged product when evaluator readiness is explicitly supplied", () => {
  assert.deepEqual(validateProductForPublication(twoStageProduct(), ["PROFIT_TARGET"]), []);
});

test("fails closed when a configured rule has no verified evaluator", () => {
  const issues = validateProductForPublication(twoStageProduct());
  assert.ok(issues.some((issue) => issue.includes("enforcement is not verified")));
});

test("rejects invalid category, structure, account size, price, and currencies", () => {
  const product = twoStageProduct();
  product.category = "UNRECOGNIZED";
  product.evaluationStructure = "FOUR_STEP";
  product.accountSize = "0";
  product.price = null;
  product.denominationCurrency = "US";
  product.currency = "NOT_A_CURRENCY";
  const issues = validateProductForPublication(product, ["PROFIT_TARGET"]);
  assert.ok(issues.some((issue) => issue.includes("supported product category")));
  assert.ok(issues.some((issue) => issue.includes("positive account size")));
  assert.ok(issues.some((issue) => issue.includes("approved positive price")));
  assert.ok(issues.some((issue) => issue.includes("denomination currency")));
  assert.ok(issues.some((issue) => issue.includes("price currency")));
  product.category = "PRO";
  const mismatch = validateProductForPublication(product, ["PROFIT_TARGET"]);
  assert.ok(mismatch.some((issue) => issue.includes("cannot use FOUR_STEP")));
});

test("rejects malformed or duplicate product codes at the pure identity boundary", () => {
  const product = twoStageProduct();
  product.code = "Pro 25K";
  const issues = validateProductForPublication(product, ["PROFIT_TARGET"]);
  assert.ok(issues.includes("A stable lowercase product code is required."));
  assert.equal(hasDuplicateProductCode("pro-sample-25k", ["PRO-SAMPLE-25K"]), true);
  assert.equal(hasDuplicateProductCode("pro-sample-50k", ["pro-sample-25k"]), false);
});

test("stage count must match the selected evaluation structure and stage order", () => {
  const product = twoStageProduct();
  product.stages.pop();
  const issues = validateProductForPublication(product, ["PROFIT_TARGET"]);
  assert.ok(issues.some((issue) => issue.includes("exactly 2 configured stage")));
  product.stages = twoStageProduct().stages;
  product.stages[0].stageOrder = 2;
  const invalidOrder = validateProductForPublication(product, ["PROFIT_TARGET"]);
  assert.ok(invalidOrder.some((issue) => issue.includes("contiguous starting at 1")));
});

test("unpublished versions and unresolved rules block a product", () => {
  const product = twoStageProduct();
  product.stages[0].rulesetVersion.status = "DRAFT";
  product.stages[1].rulesetVersion.rules[0].disposition = "UNRESOLVED";
  const issues = validateProductForPublication(product, ["PROFIT_TARGET"]);
  assert.ok(issues.some((issue) => issue.includes("must reference a published ruleset version")));
  assert.ok(issues.some((issue) => issue.includes("rule is unresolved")));
});

test("required rules need a valid calculation contract and threshold", () => {
  const invalid: ProductRuleConfiguration = {
    name: "Daily loss",
    ruleType: "MAX_DAILY_LOSS",
    disposition: "REQUIRED",
    value: { maxLoss: -5 },
    calculation: { metric: "loss" },
  };
  const issues = validateRulesetForPublication([invalid]);
  assert.ok(issues.some((issue) => issue.includes("positive maxLoss")));
  assert.ok(issues.some((issue) => issue.includes("valid IANA timezone")));
  assert.ok(issues.some((issue) => issue.includes("explicit HH:mm resetTime")));
  assert.ok(issues.some((issue) => issue.includes("included PnL components")));
});

test("optional rules are explicit and cannot carry active thresholds", () => {
  assert.deepEqual(validateRulesetForPublication([{
    name: "News trading",
    ruleType: "TRADING_SESSION",
    disposition: "OPTIONAL",
    value: null,
    calculation: null,
  }]), ["A ruleset version must include at least one required rule."]);
  const activeOptional = validateRulesetForPublication([
    profitTargetRule(),
    { name: "Optional", ruleType: "TRADING_SESSION", disposition: "OPTIONAL", value: { allowedSymbols: ["EURUSD"] }, calculation: null },
  ]);
  assert.ok(activeOptional.some((issue) => issue.includes("optional rules must not carry an active threshold")));
});

test("direct funded products do not create evaluation stages and cannot publish without the separate fulfillment path", () => {
  const product = twoStageProduct();
  product.category = "DIRECT_FUNDED";
  product.evaluationStructure = "DIRECT_FUNDED";
  product.stages = [];
  product.operatingRulesetVersion = publishedVersion("operating-version");
  const issues = validateProductForPublication(product, ["PROFIT_TARGET"]);
  assert.ok(issues.some((issue) => issue.includes("Direct Funded order fulfillment is not implemented")));
  assert.equal(product.stages.length, 0);
});

test("comparison policies must match the evaluator contract", () => {
  const invalidProfit = profitTargetRule();
  invalidProfit.calculation = { ...(invalidProfit.calculation as Record<string, unknown>), breachComparison: "GREATER_THAN" };
  const issues = validateRulesetForPublication([invalidProfit], ["PROFIT_TARGET"]);
  assert.ok(issues.some((issue) => issue.includes("breach comparison policy is unsupported")));
});

test("calculation contract validator rejects missing required semantics", () => {
  const errors = validateCalculationDefinition("MAX_DAILY_LOSS", { metric: "loss" });
  assert.ok(errors.length >= 5);
});

test("order snapshots retain authoritative product price and exact stage rule versions", () => {
  const snapshot = buildProductOrderSnapshot(twoStageProduct());
  assert.equal(snapshot.price, "79.00");
  assert.equal(snapshot.priceCurrency, "USD");
  assert.deepEqual((snapshot.stages as Array<{ rulesetVersionId: string }>).map((stage) => stage.rulesetVersionId), [
    "ruleset-version-1",
    "ruleset-version-2",
  ]);
});

test("order contract rejects browser-supplied price, size, category, rules, or ruleset", () => {
  const result = validateCreateOrderInput({
    productId: "product-id",
    price: "0.01",
    currency: "USD",
    accountSize: 5,
    category: "EXPERT",
    rules: [],
    rulesetVersionId: "attacker-selected-version",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.price);
  assert.ok(result.errors.accountSize);
  assert.ok(result.errors.rulesetVersionId);
});
