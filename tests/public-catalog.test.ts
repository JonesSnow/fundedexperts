import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  approvedPublicProducts,
  isValidPublicRulesetIdentifier,
  publicApiFailure,
  publicApiStatus,
  publicRulesForVersion,
  publicRulesetsForProducts,
  safePrismaErrorCode,
  safePrismaErrorTable,
  serializePublicProduct,
  type PublicProductRecord,
} from "../lib/public-catalog";
import type {
  PublicProductsResponse,
  PublicRulesResponse,
  PublicRulesetsResponse,
} from "../lib/product-experience";
import { isPublicProductsResponse } from "../lib/product-experience";

const rulesetId = "423d6b1a-c5bc-4e1d-ae73-9f6a13e01b28";
const versionId = "fb8c21d1-e7ed-4aed-aed2-7190579b9524";

function productRecord(options: {
  active?: boolean;
  status?: "ACTIVE" | "DRAFT" | "UNAVAILABLE" | "RETIRED";
  versionStatus?: "PUBLISHED" | "DRAFT" | "ARCHIVED";
  versionActive?: boolean;
  rulesetActive?: boolean;
  code?: string | null;
  category?: "PRO" | "DIRECT_FUNDED" | null;
  structure?: "TWO_STEP" | "DIRECT_FUNDED" | null;
  price?: Prisma.Decimal | null;
  rulesetName?: string;
  noStages?: boolean;
} = {}): PublicProductRecord {
  const rule = {
    id: "a0c3279c-9695-4ec6-b4ed-02bdb46e12a1",
    name: "Maximum leverage",
    ruleType: "MAX_LEVERAGE" as const,
    value: { maxLeverage: 30 },
    isRequired: true,
    disposition: "REQUIRED" as const,
    calculation: {
      schemaVersion: 1,
      metric: "account leverage",
      method: "SNAPSHOT_ACCOUNT_LEVERAGE",
      reference: "latest account snapshot",
      breachComparison: "GREATER_THAN",
      evaluationTiming: "fresh account snapshot",
      requiredInputs: ["leverage", "dataTimestamp"],
      maxSnapshotAgeMs: 120_000,
    },
  };
  const version = {
    id: versionId,
    version: "1.0",
    status: options.versionStatus ?? "PUBLISHED",
    isActive: options.versionActive ?? true,
    ruleset: {
      id: rulesetId,
      name: options.rulesetName ?? "Published evaluation rules",
      description: "Published evaluation terms.",
      isActive: options.rulesetActive ?? true,
    },
    rules: [rule],
  };
  return {
    id: "61e9c47a-6f64-47f9-a56f-8c0e829339a3",
    code: options.code === undefined ? "pro-two-stage-25k" : options.code,
    name: "Pro 25K",
    description: "A configured simulated evaluation.",
    category: options.category === undefined ? "PRO" : options.category,
    evaluationStructure: options.structure === undefined ? "TWO_STEP" : options.structure,
    status: options.status ?? "ACTIVE",
    accountSize: new Prisma.Decimal("25000.00"),
    denominationCurrency: "USD",
    price: options.price === undefined ? new Prisma.Decimal("79.50") : options.price,
    currency: "USD",
    displayOrder: 1,
    isActive: options.active ?? true,
    stages: (options.noStages ? [] : [1, 2]).map((stageOrder) => ({
      id: `fbbd56d0-1314-4d5e-a144-${String(stageOrder).padStart(12, "0")}`,
      stageKey: `stage-${stageOrder}`,
      displayName: `Stage ${stageOrder}`,
      stageOrder,
      rulesetVersion: version,
    })),
    operatingRulesetVersion: null,
  };
}

test("public product filtering excludes inactive, incomplete, direct-funded, and unpublished configurations", () => {
  const approved = productRecord();
  const unsupported = productRecord();
  unsupported.stages[0]!.rulesetVersion.rules[0]!.ruleType = "PROFIT_TARGET";
  const candidates = [
    approved,
    unsupported,
    productRecord({ active: false }),
    productRecord({ status: "DRAFT" }),
    productRecord({ code: null }),
    productRecord({ price: null }),
    productRecord({ category: "DIRECT_FUNDED", structure: "DIRECT_FUNDED" }),
    productRecord({ versionStatus: "DRAFT" }),
    productRecord({ versionActive: false }),
    productRecord({ rulesetActive: false }),
  ];

  assert.deepEqual(approvedPublicProducts(candidates), [approved]);
  assert.deepEqual(approvedPublicProducts([]), []);
});

test("draft products without configured stages stay out of the public catalog", () => {
  const legacyDraft = productRecord({ status: "DRAFT", noStages: true });

  assert.deepEqual(approvedPublicProducts([legacyDraft]), []);
});

test("Phase 33 E2E rulesets cannot be exposed through an otherwise active product", () => {
  const e2eProduct = productRecord({ rulesetName: "RS-p33-e2e-run-123" });
  const approved = approvedPublicProducts([e2eProduct]);

  assert.deepEqual(approved, []);
  assert.deepEqual(publicRulesetsForProducts(approved), []);
  assert.equal(publicRulesForVersion(approved, rulesetId, "1.0"), null);
});

test("explicit E2E product identifiers are excluded even with ordinary published rules", () => {
  const fixture = productRecord({ code: "DEV-E2E-NONPUBLIC" });

  assert.deepEqual(approvedPublicProducts([fixture]), []);
});

test("evaluation products cannot expose draft, inactive, or test-only ongoing rulesets", () => {
  const draft = productRecord();
  draft.operatingRulesetVersion = {
    ...draft.stages[0]!.rulesetVersion,
    status: "DRAFT",
  };

  const inactiveVersion = productRecord();
  inactiveVersion.operatingRulesetVersion = {
    ...inactiveVersion.stages[0]!.rulesetVersion,
    isActive: false,
  };

  const inactiveRuleset = productRecord();
  inactiveRuleset.operatingRulesetVersion = {
    ...inactiveRuleset.stages[0]!.rulesetVersion,
    ruleset: {
      ...inactiveRuleset.stages[0]!.rulesetVersion.ruleset,
      isActive: false,
    },
  };

  const testRuleset = productRecord();
  testRuleset.operatingRulesetVersion = {
    ...testRuleset.stages[0]!.rulesetVersion,
    ruleset: {
      ...testRuleset.stages[0]!.rulesetVersion.ruleset,
      name: "E2E development fixture rules",
    },
  };

  const published = productRecord();
  published.operatingRulesetVersion = {
    ...published.stages[0]!.rulesetVersion,
  };

  for (const product of [draft, inactiveVersion, inactiveRuleset, testRuleset]) {
    assert.deepEqual(approvedPublicProducts([product]), []);
  }
  assert.deepEqual(approvedPublicProducts([published]), [published]);
  assert.equal(serializePublicProduct(published).operatingRulesetVersion?.status, "PUBLISHED");
});

test("optional unsupported terms remain visible as explicitly not enforced", () => {
  const product = productRecord();
  product.stages[0]!.rulesetVersion.rules.push({
    id: "optional-session-rule",
    name: "Trading session details",
    ruleType: "TRADING_SESSION",
    value: null,
    isRequired: false,
    disposition: "OPTIONAL",
    calculation: null,
  });

  const [approved] = approvedPublicProducts([product]);
  assert.ok(approved);
  const response: PublicProductsResponse = {
    success: true,
    products: [serializePublicProduct(approved)],
  };
  assert.equal(isPublicProductsResponse(response), true);
  assert.equal(response.products[0]?.stages[0]?.rulesetVersion.rules[1]?.enforcement.status, "UNSUPPORTED");
  assert.match(response.products[0]?.stages[0]?.rulesetVersion.rules[1]?.enforcement.details ?? "", /complete activity events/i);
});

test("public rulesets and rule details are derived only from approved product stages", () => {
  const product = productRecord();
  const approved = approvedPublicProducts([product]);
  const rulesets = publicRulesetsForProducts(approved);

  assert.deepEqual(rulesets, [{
    id: rulesetId,
    name: "Published evaluation rules",
    description: "Published evaluation terms.",
    versions: [{ id: versionId, version: "1.0", status: "PUBLISHED" }],
  }]);
  assert.equal(publicRulesForVersion(approved, rulesetId, "1.0")?.[0]?.value !== null, true);
  assert.equal(publicRulesForVersion(approved, rulesetId, "9.9"), null);
  assert.deepEqual(publicRulesetsForProducts([]), []);
});

test("public product serialization is JSON-safe and preserves exact decimal values", () => {
  const [approved] = approvedPublicProducts([productRecord()]);
  assert.ok(approved);
  const response: PublicProductsResponse = {
    success: true,
    products: [serializePublicProduct(approved)],
  };
  const decoded = JSON.parse(JSON.stringify(response)) as PublicProductsResponse;

  assert.equal(decoded.products[0]?.accountSize, "25000");
  assert.equal(decoded.products[0]?.price, "79.5");
  assert.equal(decoded.products[0]?.stages[0]?.rulesetVersion.rules[0]?.value instanceof Object, true);
  assert.throws(() => serializePublicProduct(productRecord({ code: null })), /missing code/);
});

test("public endpoint response contracts serialize stable success and error envelopes", () => {
  const products: PublicProductsResponse = { success: true, products: [] };
  const rulesets: PublicRulesetsResponse = { success: true, rulesets: [] };
  const rules: PublicRulesResponse = { success: true, rules: [] };
  const failure = publicApiFailure("SERVICE_UNAVAILABLE", "Temporarily unavailable.", "corr_test");

  assert.deepEqual(JSON.parse(JSON.stringify(products)), { success: true, products: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(rulesets)), { success: true, rulesets: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(rules)), { success: true, rules: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(failure)), {
    success: false,
    code: "SERVICE_UNAVAILABLE",
    error: "Temporarily unavailable.",
    correlationId: "corr_test",
  });
  assert.equal(publicApiStatus("INVALID_IDENTIFIER"), 400);
  assert.equal(publicApiStatus("NOT_FOUND"), 404);
  assert.equal(publicApiStatus("RATE_LIMITED"), 429);
  assert.equal(publicApiStatus("SERVICE_UNAVAILABLE"), 503);
});

test("diagnostic classification retains safe Prisma failure categories without error messages", () => {
  const missingColumn = new Prisma.PrismaClientKnownRequestError("sensitive connection details", {
    code: "P2022",
    clientVersion: "test",
  });
  const missingTable = new Prisma.PrismaClientKnownRequestError("private database details", {
    code: "P2021",
    clientVersion: "test",
    meta: { table: "public.ProductStage" },
  });
  const malformedTable = new Prisma.PrismaClientKnownRequestError("private database details", {
    code: "P2021",
    clientVersion: "test",
    meta: { table: "public.ProductStage\nprivate details" },
  });
  const unreachable = new Prisma.PrismaClientInitializationError("sensitive connection details", "test", "P1001");

  assert.equal(safePrismaErrorCode(missingColumn), "SCHEMA_COLUMN_MISSING");
  assert.equal(safePrismaErrorCode(missingTable), "SCHEMA_TABLE_MISSING");
  assert.equal(safePrismaErrorTable(missingTable), "public.ProductStage");
  assert.equal(safePrismaErrorTable(malformedTable), undefined);
  assert.equal(safePrismaErrorTable(missingColumn), undefined);
  assert.equal(safePrismaErrorCode(unreachable), "DATABASE_UNREACHABLE");
  assert.equal(safePrismaErrorCode(new Error("postgres://sensitive-host/password")), "UNEXPECTED");
  assert.equal(safePrismaErrorCode(new TypeError("sensitive serialization detail")), "RESPONSE_SERIALIZATION_FAILED");
  assert.equal(JSON.stringify(publicApiFailure("SERVICE_UNAVAILABLE", "Unavailable.", "corr_test")).includes("sensitive"), false);
});

test("ruleset identifier validation rejects malformed paths before querying", () => {
  assert.equal(isValidPublicRulesetIdentifier(rulesetId, "1.0"), true);
  assert.equal(isValidPublicRulesetIdentifier("not-a-uuid", "1.0"), false);
  assert.equal(isValidPublicRulesetIdentifier(rulesetId, "../draft"), false);
  assert.equal(isValidPublicRulesetIdentifier(rulesetId, ""), false);
});
