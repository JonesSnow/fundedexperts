import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";
import type { ProductConfiguration } from "../lib/product-domain";
import { isCurrentProductApproval, productTermsFingerprint } from "../lib/product-approval";

process.env.JWT_SECRET = "product-approval-unit-test-secret-value-only";

type ApprovalProduct = ProductConfiguration & {
  updatedAt: Date;
  isActive: boolean;
  stages: Array<NonNullable<ProductConfiguration["stages"]>[number] & { rulesetVersionId: string }>;
};

function makeProduct(): ApprovalProduct {
  const makeVersion = (id: string) => ({
    id,
    version: "1.0.0",
    status: "PUBLISHED",
    effectiveDate: new Date("2026-10-01T00:00:00.000Z"),
    rulesetId: `ruleset-${id}`,
    rules: [{
      id: `rule-${id}`,
      name: "Maximum leverage",
      ruleType: "MAX_LEVERAGE",
      disposition: "REQUIRED",
      isRequired: true,
      effectiveDate: new Date("2026-10-01T00:00:00.000Z"),
      value: { maxLeverage: 30 },
      calculation: {
        schemaVersion: 1,
        method: "SNAPSHOT_ACCOUNT_LEVERAGE",
        metric: "account leverage",
        reference: "latest account snapshot",
        breachComparison: "GREATER_THAN",
        evaluationTiming: "fresh account snapshot",
        requiredInputs: ["leverage", "dataTimestamp"],
        maxSnapshotAgeMs: 120_000,
      },
    }],
  });

  return {
    id: "product-1",
    code: "pro-25k",
    name: "Pro 25K",
    description: "Configured evaluation offer",
    category: "PRO",
    evaluationStructure: "TWO_STEP",
    status: "DRAFT",
    accountSize: "25000.00",
    denominationCurrency: "USD",
    price: "79.00",
    currency: "USD",
    rulesetId: null,
    isActive: false,
    updatedAt: new Date("2026-10-20T12:00:00.000Z"),
    stages: [1, 2].map((stageOrder) => {
      const rulesetVersion = makeVersion(`version-${stageOrder}`);
      return {
        id: `stage-${stageOrder}`,
        stageKey: `stage-${stageOrder}`,
        displayName: `Stage ${stageOrder}`,
        stageOrder,
        rulesetVersionId: rulesetVersion.id,
        rulesetVersion,
      };
    }),
  };
}

let product = makeProduct();
let latestProductUpdate: { performedBy: string | null; details: unknown } | null = null;
let authenticatedTrader = { id: "owner-1", role: "ADMIN", status: "ACTIVE" };
let updateCalls = 0;
let transactionCalls = 0;
let approveProduct: ((request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>) | undefined;
let publishProduct: ((request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>) | undefined;
let createSession: ((traderId: string, role: string, emailVerified: boolean) => Promise<string>) | undefined;

const tx = {
  product: {
    findFirst: async () => product,
    updateMany: async (args: { where: { updatedAt: Date }; data: { updatedAt?: Date; status?: string; isActive?: boolean } }) => {
      updateCalls += 1;
      if (args.where.updatedAt.getTime() !== product.updatedAt.getTime()) return { count: 0 };
      if (args.data.status) product.status = args.data.status;
      if (args.data.isActive !== undefined) product.isActive = args.data.isActive;
      if (args.data.updatedAt) product.updatedAt = args.data.updatedAt;
      return { count: 1 };
    },
    findUnique: async () => product,
  },
  auditLog: {
    findFirst: async () => latestProductUpdate,
    create: async (args: { data: { performedBy: string | null; details: unknown } }) => {
      latestProductUpdate = { performedBy: args.data.performedBy, details: args.data.details };
      return latestProductUpdate;
    },
  },
};

const fakePrisma = {
  trader: {
    findUnique: async ({ where }: { where: { id: string } }) => where.id === authenticatedTrader.id ? authenticatedTrader : null,
  },
  $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => {
    transactionCalls += 1;
    return callback(tx);
  },
};

const previousPrisma = Reflect.get(globalThis, "__fundedExpertsPrisma");
const previousOwnerId = process.env.PRODUCT_OWNER_TRADER_ID;
Reflect.set(globalThis, "__fundedExpertsPrisma", fakePrisma);

before(async () => {
  const sessionModule = await import("../lib/auth/session");
  createSession = sessionModule.createSession;
  approveProduct = (await import("../app/api/products/[id]/approve/route")).POST;
  publishProduct = (await import("../app/api/products/[id]/publish/route")).POST;
});

beforeEach(() => {
  product = makeProduct();
  latestProductUpdate = null;
  authenticatedTrader = { id: "owner-1", role: "ADMIN", status: "ACTIVE" };
  updateCalls = 0;
  transactionCalls = 0;
  process.env.PRODUCT_OWNER_TRADER_ID = "owner-1";
});

after(() => {
  if (previousPrisma === undefined) Reflect.deleteProperty(globalThis, "__fundedExpertsPrisma");
  else Reflect.set(globalThis, "__fundedExpertsPrisma", previousPrisma);
  if (previousOwnerId === undefined) delete process.env.PRODUCT_OWNER_TRADER_ID;
  else process.env.PRODUCT_OWNER_TRADER_ID = previousOwnerId;
});

function assertHandlers() {
  if (!createSession || !approveProduct || !publishProduct) throw new Error("Product approval routes were not initialized");
  return { createSession, approveProduct, publishProduct };
}

async function callRoute(
  handler: (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>,
  traderId = "owner-1",
) {
  const { createSession: create } = assertHandlers();
  const token = await create(traderId, "ADMIN", true);
  const request = new NextRequest("http://localhost/api/products/product-1", {
    method: "POST",
    headers: { cookie: `session=${token}` },
  });
  return handler(request, { params: Promise.resolve({ id: "product-1" }) });
}

test("product terms fingerprint is stable across object key and rule ordering", () => {
  const reordered = makeProduct();
  reordered.stages.reverse();
  reordered.stages[0]!.rulesetVersion.rules[0]!.value = { maxLeverage: 30 };
  assert.equal(productTermsFingerprint(product), productTermsFingerprint(reordered));
});

test("product terms fingerprint changes when an approved term changes", () => {
  const original = productTermsFingerprint(product);
  const changedPrice = makeProduct();
  changedPrice.price = "80.00";
  const changedRule = makeProduct();
  changedRule.stages[0]!.rulesetVersion.rules[0]!.value = { maxLeverage: 25 };
  const changedVersionDate = makeProduct();
  changedVersionDate.stages[0]!.rulesetVersion.effectiveDate = new Date("2026-11-01T00:00:00.000Z");
  assert.notEqual(original, productTermsFingerprint(changedPrice));
  assert.notEqual(original, productTermsFingerprint(changedRule));
  assert.notEqual(original, productTermsFingerprint(changedVersionDate));
});

test("approval evidence must match the owner, saved terms fingerprint, and draft version", () => {
  const fingerprint = productTermsFingerprint(product);
  const audit = {
    performedBy: "owner-1",
    details: {
      event: "PRODUCT_TERMS_APPROVED",
      termsFingerprint: fingerprint,
      productUpdatedAt: product.updatedAt.toISOString(),
    },
  };
  assert.equal(isCurrentProductApproval(audit, "owner-1", fingerprint, product.updatedAt), true);
  assert.equal(isCurrentProductApproval(audit, "other-admin", fingerprint, product.updatedAt), false);
  assert.equal(isCurrentProductApproval(audit, "owner-1", `${fingerprint}changed`, product.updatedAt), false);
  assert.equal(isCurrentProductApproval(audit, "owner-1", fingerprint, new Date("2026-10-21T12:00:00.000Z")), false);
});

test("approval fails closed when no product owner is configured", async () => {
  const { approveProduct: approve } = assertHandlers();
  delete process.env.PRODUCT_OWNER_TRADER_ID;

  const response = await callRoute(approve);

  assert.equal(response.status, 503);
  assert.equal(transactionCalls, 0);
});

test("only the configured owner can approve product terms", async () => {
  const { approveProduct: approve } = assertHandlers();
  authenticatedTrader = { id: "other-admin", role: "ADMIN", status: "ACTIVE" };

  const response = await callRoute(approve, "other-admin");

  assert.equal(response.status, 403);
  assert.equal(transactionCalls, 0);
});

test("inactive admins cannot use the publication endpoint", async () => {
  const { publishProduct: publish } = assertHandlers();
  authenticatedTrader = { id: "owner-1", role: "ADMIN", status: "PENDING" };

  const response = await callRoute(publish);

  assert.equal(response.status, 401);
  assert.equal(transactionCalls, 0);
});

test("configured owner approval records evidence for the exact valid draft", async () => {
  const { approveProduct: approve } = assertHandlers();

  const response = await callRoute(approve);
  const body = await response.json() as { success: boolean; message?: string };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(body.message ?? "", /current saved terms/);
  assert.equal(updateCalls, 1);
  assert.equal((latestProductUpdate?.details as { event?: string }).event, "PRODUCT_TERMS_APPROVED");
});

test("publication rejects a draft without current owner approval", async () => {
  const { publishProduct: publish } = assertHandlers();

  const response = await callRoute(publish);
  const body = await response.json() as { success: boolean; error?: string };

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.match(body.error ?? "", /configured product owner/);
  assert.equal(updateCalls, 0);
});

test("publication requires reapproval after a price edit", async () => {
  const { approveProduct: approve, publishProduct: publish } = assertHandlers();
  const approvalResponse = await callRoute(approve);
  assert.equal(approvalResponse.status, 200);
  product.price = "80.00";
  authenticatedTrader = { id: "other-admin", role: "ADMIN", status: "ACTIVE" };

  const publishResponse = await callRoute(publish, "other-admin");
  const body = await publishResponse.json() as { success: boolean; error?: string };

  assert.equal(publishResponse.status, 409);
  assert.equal(body.success, false);
  assert.equal(product.status, "DRAFT");
});

test("an admin can publish the exact draft after configured owner approval", async () => {
  const { approveProduct: approve, publishProduct: publish } = assertHandlers();
  const approvalResponse = await callRoute(approve);
  assert.equal(approvalResponse.status, 200);
  authenticatedTrader = { id: "other-admin", role: "ADMIN", status: "ACTIVE" };

  const publishResponse = await callRoute(publish, "other-admin");
  const body = await publishResponse.json() as { success: boolean; product: { status: string; isActive: boolean } };

  assert.equal(publishResponse.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.product.status, "ACTIVE");
  assert.equal(body.product.isActive, true);
});
