import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { isPublicProductsResponse } from "../lib/product-experience";

let findProducts: () => Promise<unknown[]> = async () => [];
let findProduct: () => Promise<unknown | null> = async () => null;
const findRulesetVersions: () => Promise<unknown[]> = async () => [];
const fakePrisma = {
  product: {
    findMany: () => findProducts(),
    findFirst: () => findProduct(),
  },
  rulesetVersion: {
    findMany: () => findRulesetVersions(),
  },
};
const previousPrisma = Reflect.get(globalThis, "__fundedExpertsPrisma");
Reflect.set(globalThis, "__fundedExpertsPrisma", fakePrisma);

let getProducts: ((request: NextRequest) => Promise<Response>) | undefined;
let getProduct: ((
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>) | undefined;
let getRuleset: ((
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>) | undefined;
let getRulesetVersions: ((
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>) | undefined;

before(async () => {
  getProducts = (await import("../app/api/products/route")).GET;
  getProduct = (await import("../app/api/products/[id]/route")).GET;
  getRuleset = (await import("../app/api/rulesets/[id]/route")).GET;
  getRulesetVersions = (await import("../app/api/rulesets/[id]/versions/route")).GET;
});

function callGetProducts(): Promise<Response> {
  if (!getProducts) throw new Error("Products route was not initialized");
  return getProducts(new NextRequest("http://localhost/api/products"));
}

function callGetProduct(): Promise<Response> {
  if (!getProduct) throw new Error("Product detail route was not initialized");
  return getProduct(
    new NextRequest("http://localhost/api/products/product-detail-test"),
    { params: Promise.resolve({ id: "product-detail-test" }) },
  );
}

function callGetRuleset(): Promise<Response> {
  if (!getRuleset) throw new Error("Ruleset route was not initialized");
  return getRuleset(
    new NextRequest("http://localhost/api/rulesets/ruleset-1"),
    { params: Promise.resolve({ id: "ruleset-1" }) },
  );
}

function callGetRulesetVersions(): Promise<Response> {
  if (!getRulesetVersions) throw new Error("Ruleset versions route was not initialized");
  return getRulesetVersions(
    new NextRequest("http://localhost/api/rulesets/ruleset-1/versions"),
    { params: Promise.resolve({ id: "ruleset-1" }) },
  );
}

function configuredProductFixture() {
  const ruleset = { id: "ruleset-1", name: "Pro evaluation", description: null, isActive: true };
  const rule = {
    id: "rule-1",
    name: "Maximum leverage",
    ruleType: "MAX_LEVERAGE",
    value: { maxLeverage: 30 },
    isRequired: true,
    disposition: "REQUIRED",
    calculation: {
      schemaVersion: 1,
      method: "SNAPSHOT_ACCOUNT_LEVERAGE",
      metric: "account leverage",
      reference: "latest account snapshot",
      breachComparison: "GREATER_THAN",
      evaluationTiming: "fresh snapshot",
      requiredInputs: ["leverage", "dataTimestamp"],
      maxSnapshotAgeMs: 120_000,
    },
  };
  const optionalUnverifiedRule = {
    id: "rule-optional-session",
    name: "Trading session details",
    ruleType: "TRADING_SESSION",
    value: null,
    isRequired: false,
    disposition: "OPTIONAL",
    calculation: null,
  };
  const version = {
    id: "version-1",
    version: "1.0.0",
    status: "PUBLISHED",
    isActive: true,
    ruleset,
    rules: [rule, optionalUnverifiedRule],
  };
  return {
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
    displayOrder: 1,
    isActive: true,
    rulesetId: null,
    stages: [1, 2].map((stageOrder) => ({
      id: `stage-${stageOrder}`,
      stageKey: `stage-${stageOrder}`,
      displayName: `Stage ${stageOrder}`,
      stageOrder,
      rulesetVersionId: version.id,
      rulesetVersion: version,
    })),
    operatingRulesetVersionId: null,
    operatingRulesetVersion: null as typeof version | null,
  };
}

after(() => {
  if (previousPrisma === undefined) Reflect.deleteProperty(globalThis, "__fundedExpertsPrisma");
  else Reflect.set(globalThis, "__fundedExpertsPrisma", previousPrisma);
});

test("public products route returns an intentional empty success from a mocked Prisma client", async () => {
  const response = await callGetProducts();
  const body: unknown = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { success: true, products: [] });
});

test("public products route serializes only approved configured offers and their enforcement disclosure", async () => {
  findProducts = async () => [configuredProductFixture()];
  const response = await callGetProducts();
  const body: unknown = await response.json();

  assert.equal(response.status, 200);
  assert.equal(isPublicProductsResponse(body), true);
  if (isPublicProductsResponse(body)) {
    assert.equal(body.products[0]?.price, "79.50");
    assert.equal(body.products[0]?.stages[0]?.rulesetVersion.rules[0]?.enforcement.status, "SUPPORTED");
    assert.match(body.products[0]?.stages[0]?.rulesetVersion.rules[0]?.enforcement.details ?? "", /fresh account snapshot/i);
    assert.equal(body.products[0]?.stages[0]?.rulesetVersion.rules[1]?.enforcement.status, "UNSUPPORTED");
    assert.match(body.products[0]?.stages[0]?.rulesetVersion.rules[1]?.enforcement.details ?? "", /complete activity events/i);
  }
});

test("public list and detail endpoints hide products attached to an unpublished ongoing ruleset", async () => {
  const product = configuredProductFixture();
  product.operatingRulesetVersion = {
    ...product.stages[0]!.rulesetVersion,
    status: "DRAFT",
  };
  findProducts = async () => [product];
  findProduct = async () => product;

  const listResponse = await callGetProducts();
  assert.equal(listResponse.status, 200);
  assert.deepEqual(await listResponse.json(), { success: true, products: [] });

  const detailResponse = await callGetProduct();
  assert.equal(detailResponse.status, 404);
  assert.deepEqual(await detailResponse.json(), { success: false, error: "Product not found" });

  const rulesetResponse = await callGetRuleset();
  assert.equal(rulesetResponse.status, 404);
  assert.deepEqual(await rulesetResponse.json(), { success: false, error: "Ruleset not found" });
});

test("public products route hides an offer with an unsupported required rule", async () => {
  const product = configuredProductFixture();
  product.stages[0]!.rulesetVersion.rules[0]!.ruleType = "PROFIT_TARGET";
  findProducts = async () => [product];

  const response = await callGetProducts();
  const body: unknown = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { success: true, products: [] });
});

test("public product detail returns the same safe product contract as the catalog list", async () => {
  findProduct = async () => configuredProductFixture();

  const response = await callGetProduct();
  const body: unknown = await response.json();

  assert.equal(response.status, 200);
  const product = (body as { product?: unknown }).product;
  const productResponse = { success: true, products: [product] };
  if (!isPublicProductsResponse(productResponse)) throw new Error("Product detail did not match the public catalog contract");
  assert.equal(productResponse.products[0]?.price, "79.50");
  assert.equal(productResponse.products[0]?.stages.length, 2);
});

test("public product detail hides drafts, missing stages, unpublished rulesets, and Phase 33 fixtures", async () => {
  const draft = configuredProductFixture();
  draft.status = "DRAFT";
  draft.isActive = false;

  const missingStages = configuredProductFixture();
  missingStages.stages = [];

  const unpublishedRuleset = configuredProductFixture();
  unpublishedRuleset.stages[0]!.rulesetVersion.status = "DRAFT";

  const inactiveVersion = configuredProductFixture();
  inactiveVersion.stages[0]!.rulesetVersion.isActive = false;

  const inactiveRuleset = configuredProductFixture();
  inactiveRuleset.stages[0]!.rulesetVersion.ruleset.isActive = false;

  const e2eFixture = configuredProductFixture();
  e2eFixture.stages[0]!.rulesetVersion.ruleset.name = "RS-p33-e2e-run-123";

  for (const product of [draft, missingStages, unpublishedRuleset, inactiveVersion, inactiveRuleset, e2eFixture]) {
    findProduct = async () => product;
    const response = await callGetProduct();
    const body: unknown = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, { success: false, error: "Product not found" });
  }
});

test("public ruleset detail and version lists only expose terms linked to approved products", async () => {
  findProducts = async () => [configuredProductFixture()];

  const detailResponse = await callGetRuleset();
  const detailBody = await detailResponse.json() as { success: boolean; ruleset?: { name: string; versions: Array<{ version: string }> } };
  assert.equal(detailResponse.status, 200);
  assert.equal(detailBody.ruleset?.name, "Pro evaluation");
  assert.deepEqual(detailBody.ruleset?.versions.map((version) => version.version), ["1.0.0"]);

  const versionsResponse = await callGetRulesetVersions();
  const versionsBody = await versionsResponse.json() as { success: boolean; versions: Array<{ id: string; version: string; status: string }> };
  assert.equal(versionsResponse.status, 200);
  assert.deepEqual(versionsBody.versions, [{ id: "version-1", version: "1.0.0", status: "PUBLISHED" }]);

  const e2eFixture = configuredProductFixture();
  e2eFixture.stages[0]!.rulesetVersion.ruleset.name = "RS-p33-e2e-run-123";
  findProducts = async () => [e2eFixture];

  const hiddenDetail = await callGetRuleset();
  assert.equal(hiddenDetail.status, 404);
  assert.deepEqual(await hiddenDetail.json(), { success: false, error: "Ruleset not found" });

  const hiddenVersions = await callGetRulesetVersions();
  assert.equal(hiddenVersions.status, 200);
  assert.deepEqual(await hiddenVersions.json(), { success: true, versions: [] });
});

test("public products route maps Prisma schema errors to a safe service response", async () => {
  findProducts = async () => {
    throw new Prisma.PrismaClientKnownRequestError("connection details must stay private", {
      code: "P2022",
      clientVersion: "6.19.3",
    });
  };

  const response = await callGetProducts();
  const body: unknown = await response.json();

  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(body).includes("connection details"), false);
  assert.deepEqual(Object.keys(body as Record<string, unknown>).sort(), ["code", "correlationId", "error", "success"]);
  assert.equal((body as { code?: string }).code, "SERVICE_UNAVAILABLE");
});

test("public products route handles a missing-table error without exposing database details", async () => {
  findProducts = async () => {
    throw new Prisma.PrismaClientKnownRequestError("private database details", {
      code: "P2021",
      clientVersion: "6.19.3",
      meta: { table: "public.ProductStage" },
    });
  };

  const diagnostics: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const capture = (...values: unknown[]) => {
    diagnostics.push(values.map((value) => typeof value === "string" ? value : JSON.stringify(value)).join(" "));
  };
  console.log = capture;
  console.error = capture;
  let response: Response;
  let body: unknown;
  try {
    response = await callGetProducts();
    body = await response.json();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.equal(response.status, 503);
  assert.equal(isPublicProductsResponse(body), false);
  assert.deepEqual(Object.keys(body as Record<string, unknown>).sort(), ["code", "correlationId", "error", "success"]);
  assert.equal((body as { code?: string }).code, "SERVICE_UNAVAILABLE");
  assert.match((body as { correlationId: string }).correlationId, /^corr_/);
  assert.equal(JSON.stringify(body).includes("private database details"), false);
  assert.equal(JSON.stringify(body).includes("ProductStage"), false);
  const diagnosticText = diagnostics.join("\n");
  assert.match(diagnosticText, /SCHEMA_TABLE_MISSING/);
  assert.match(diagnosticText, /public\.ProductStage/);
  assert.match(diagnosticText, /corr_/);
  assert.equal(diagnosticText.includes("private database details"), false);
});

test("public product detail maps a missing-table error to the same safe service contract", async () => {
  findProduct = async () => {
    throw new Prisma.PrismaClientKnownRequestError("private product database details", {
      code: "P2021",
      clientVersion: "6.19.3",
      meta: { table: "public.ProductStage" },
    });
  };

  const diagnostics: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const capture = (...values: unknown[]) => {
    diagnostics.push(values.map((value) => typeof value === "string" ? value : JSON.stringify(value)).join(" "));
  };
  console.log = capture;
  console.error = capture;
  let response: Response;
  let body: unknown;
  try {
    response = await callGetProduct();
    body = await response.json();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.equal(response.status, 503);
  assert.equal((body as { code?: string }).code, "SERVICE_UNAVAILABLE");
  assert.equal(JSON.stringify(body).includes("private product database details"), false);
  assert.equal(JSON.stringify(body).includes("ProductStage"), false);
  assert.match((body as { correlationId: string }).correlationId, /^corr_/);
  const diagnosticText = diagnostics.join("\n");
  assert.match(diagnosticText, /SCHEMA_TABLE_MISSING/);
  assert.match(diagnosticText, /public\.ProductStage/);
  assert.equal(diagnosticText.includes("private product database details"), false);
});
