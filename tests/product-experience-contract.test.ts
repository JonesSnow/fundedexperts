import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isPublicProductsResponse, isPublicRulesResponse } from "../lib/product-experience";

const validStage = {
  id: "stage-1",
  stageKey: "phase-1",
  displayName: "Phase 1",
  stageOrder: 1,
  rulesetVersion: {
    id: "version-1",
    version: "1.0",
    status: "PUBLISHED",
    ruleset: { id: "ruleset-1", name: "Published rules" },
    rules: [{
      id: "rule-1",
      name: "Maximum leverage",
      ruleType: "MAX_LEVERAGE",
      value: { maxLeverage: 30 },
      isRequired: true,
      disposition: "REQUIRED",
      calculation: null,
      enforcement: { status: "SUPPORTED", details: "Requires a fresh provider snapshot." },
    }],
  },
};

const validProduct = {
  id: "product-1",
  code: "pro-25k",
  name: "Pro 25K",
  description: null,
  category: "PRO",
  evaluationStructure: "TWO_STEP",
  status: "ACTIVE",
  accountSize: "25000.00",
  denominationCurrency: "USD",
  price: "79.50",
  currency: "USD",
  ruleset: null,
  stages: [validStage],
  operatingRulesetVersion: null,
  isActive: true,
  displayOrder: 1,
};

test("accepts a valid product response and an intentional empty catalog", () => {
  assert.equal(isPublicProductsResponse({ success: true, products: [validProduct] }), true);
  assert.equal(isPublicProductsResponse({ success: true, products: [] }), true);
  assert.equal(isPublicRulesResponse({ success: true, rules: validStage.rulesetVersion.rules }), true);
  assert.equal(isPublicRulesResponse({ success: true, rules: [{ ...validStage.rulesetVersion.rules[0], enforcement: undefined }] }), false);
  assert.equal(isPublicProductsResponse({
    success: true,
    products: [{
      ...validProduct,
      stages: [{ ...validStage, rulesetVersion: { ...validStage.rulesetVersion, rules: [{ ...validStage.rulesetVersion.rules[0], value: null, calculation: null, disposition: "OPTIONAL", isRequired: false, enforcement: { status: "UNSUPPORTED", details: "Not enforced by the available evaluator." } }] } }],
    }],
  }), true);
  assert.equal(isPublicProductsResponse({
    success: true,
    products: [{
      ...validProduct,
      stages: [{ ...validStage, rulesetVersion: { ...validStage.rulesetVersion, rules: [{ ...validStage.rulesetVersion.rules[0], disposition: "OPTIONAL", isRequired: false, value: { maxLeverage: 30 }, enforcement: { status: "UNSUPPORTED", details: "Not enforced by the available evaluator." } }] } }],
    }],
  }), false);
  assert.equal(isPublicProductsResponse({
    success: true,
    products: [{
      ...validProduct,
      stages: [{ ...validStage, rulesetVersion: { ...validStage.rulesetVersion, rules: [{ ...validStage.rulesetVersion.rules[0], enforcement: { status: "UNSUPPORTED", details: "Not verified." } }] } }],
    }],
  }), false);
  assert.equal(isPublicProductsResponse({
    success: true,
    products: [{
      ...validProduct,
      stages: [{ ...validStage, rulesetVersion: { ...validStage.rulesetVersion, rules: [{ ...validStage.rulesetVersion.rules[0], disposition: "UNRESOLVED", isRequired: false, enforcement: { status: "SUPPORTED", details: "Requires a fresh provider snapshot." } }] } }],
    }],
  }), false);
});

test("rejects failed envelopes and malformed product or nested rule shapes", () => {
  assert.equal(isPublicProductsResponse({ success: false, products: [] }), false);
  assert.equal(isPublicProductsResponse({ success: true, products: [{ ...validProduct, price: "not-a-price" }] }), false);
  assert.equal(isPublicProductsResponse({ success: true, products: [{ ...validProduct, price: null }] }), false);
  assert.equal(isPublicProductsResponse({ success: true, products: [{ ...validProduct, status: "DRAFT" }] }), false);
  assert.equal(isPublicProductsResponse({ success: true, products: [{ ...validProduct, isActive: false }] }), false);
  assert.equal(isPublicProductsResponse({ success: true, products: [{ ...validProduct, category: "DIRECT_FUNDED" }] }), false);
  assert.equal(isPublicProductsResponse({ success: true, products: [{ ...validProduct, stages: null }] }), false);
  assert.equal(isPublicProductsResponse({
    success: true,
    products: [{
      ...validProduct,
      stages: [{ ...validStage, rulesetVersion: { ...validStage.rulesetVersion, rules: [{ ...validStage.rulesetVersion.rules[0], enforcement: undefined }] } }],
    }],
  }), false);
  assert.equal(isPublicProductsResponse({
    success: true,
    products: [{
      ...validProduct,
      stages: [{ ...validStage, rulesetVersion: { ...validStage.rulesetVersion, status: "DRAFT" } }],
    }],
  }), false);
  assert.equal(isPublicProductsResponse({
    success: true,
    products: [{
      ...validProduct,
      stages: [{ ...validStage, rulesetVersion: { ...validStage.rulesetVersion, rules: "invalid" } }],
    }],
  }), false);
});

test("home chart disclosure uses clear illustrative language", () => {
  const component = readFileSync(new URL("../components/simulated-chart-preview.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /DEMO VIEW/i);
  assert.match(component, /Illustrative/);
});
