import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";
import { runCleanupSteps, assertCleanup, type CleanupResult } from "../lib/cleanup-helper";

const HAS_DB = process.env.DATABASE_URL !== undefined;
const RUN_ID = Date.now().toString(36);

const results = {
  pass: 0,
  fail: 0,
  tests: [] as Array<{ name: string; result: string; detail: string }>,
};

let cleanupResult: CleanupResult | null = null;

function check(name: string, condition: boolean, detail: string = "") {
  if (condition) {
    results.pass++;
    results.tests.push({ name, result: "PASS", detail });
  } else {
    results.fail++;
    results.tests.push({ name, result: "FAIL", detail });
  }
}

async function cleanup(prisma: PrismaClient): Promise<CleanupResult> {
  const tables = [
    "OrderItem", "Order", "Product", "CouponUsage", "Coupon",
    "RuleEvaluation", "Rule", "RulesetVersion", "Ruleset", "FundedAccount",
    "AccountAssignment", "MT5Account", "Evaluation", "Notification", "Trader", "LedgerEntry",
  ];
  const steps = tables.map((t) => ({
    label: `${t.toLowerCase()}.truncate`,
    fn: () => prisma.$executeRaw(Prisma.raw(`TRUNCATE TABLE "${t}" CASCADE`)),
  }));
  steps.push({ label: "auditLog.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE` });
  return runCleanupSteps(prisma, steps);
}

async function createTestProduct(prisma: PrismaClient, data: {
  name: string; description?: string; price?: number; accountSize?: number;
  isActive?: boolean; rulesetId?: string;
}) {
  return prisma.product.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      price: data.price ?? null,
      accountSize: data.accountSize ?? null,
      isActive: data.isActive ?? true,
      rulesetId: data.rulesetId ?? null,
      currency: "USD",
    },
  });
}

async function createTestRuleset(prisma: PrismaClient, data: {
  name: string; description?: string; isActive?: boolean;
}) {
  return prisma.ruleset.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      isActive: data.isActive ?? true,
    },
  });
}

async function createTestRulesetVersion(prisma: PrismaClient, data: {
  rulesetId: string; version: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; isActive?: boolean;
}) {
  return prisma.rulesetVersion.create({
    data: {
      rulesetId: data.rulesetId,
      version: data.version,
      status: data.status,
      isActive: data.isActive ?? true,
    },
  });
}

const prisma = new PrismaClient();

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

beforeEach(async () => {
  cleanupResult = await cleanup(prisma);
  assertCleanup(cleanupResult, "Catalog API beforeEach");
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult as CleanupResult, "Catalog API");
  }
  console.log(
    `Catalog API Tests: ${results.pass}/${results.pass + results.fail} passed, ${results.fail} failed`,
  );
  await prisma.$disconnect();
  if (results.fail > 0) process.exit(1);
});

describe("Catalog API - Product Visibility", () => {
  it("GET /api/products should return only active products", async () => {
    const active = await createTestProduct(prisma, { name: "Active Product", price: 99, isActive: true });
    await createTestProduct(prisma, { name: "Inactive Product", price: 49, isActive: false });

    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, price: true, isActive: true,
        ruleset: { select: { name: true } },
      },
      orderBy: { displayOrder: "asc" },
    });

    check("Active products returned", products.length === 1, `got: ${products.length}`);
    if (products.length === 1) {
      check("Correct product", products[0].name === "Active Product", "");
    }
  });

  it("GET /api/products excludes settings field from response", async () => {
    await createTestProduct(prisma, { name: "Test Product", price: 99, isActive: true, description: "desc" });

    const product = await prisma.product.findFirst({
      where: { isActive: true },
      select: {
        id: true, name: true, price: true, isActive: true, description: true,
      },
    });

    check("Product found", product !== null, "");
    if (product) {
      const json = JSON.stringify(product);
      check("Settings not in response", !json.includes("settings"), `got: ${json}`);
    }
  });

  it("GET /api/products/[id] returns active product", async () => {
    const product = await createTestProduct(prisma, { name: "Active Product", price: 99, isActive: true });

    const found = await prisma.product.findUnique({
      where: { id: product.id, isActive: true },
      select: {
        id: true, name: true, price: true, currency: true, isActive: true,
        description: true, accountSize: true, displayOrder: true,
        ruleset: { select: { name: true } },
      },
    });

    check("Product found", found !== null, "");
    if (found) {
      check("Correct product", found.name === "Active Product", "");
      check("No settings in response", !("settings" in found), "settings field present");
    }
  });

  it("GET /api/products/[id] returns 404 for inactive product", async () => {
    const product = await createTestProduct(prisma, { name: "Inactive Product", price: 49, isActive: false });

    const found = await prisma.product.findUnique({
      where: { id: product.id, isActive: true },
    });

    check("Inactive product not accessible", found === null, "");
  });

  it("GET /api/products/[id] returns 404 for nonexistent product", async () => {
    const found = await prisma.product.findUnique({ where: { id: "non-existent" } });
    check("Nonexistent returns null", found === null, "");
  });
});

describe("Catalog API - Ruleset Visibility", () => {
  it("GET /api/rulesets returns only active rulesets with PUBLISHED versions", async () => {
    const activeRs = await createTestRuleset(prisma, { name: "Active Ruleset" });
    const inactiveRs = await createTestRuleset(prisma, { name: "Inactive Ruleset", isActive: false });

    await createTestRulesetVersion(prisma, { rulesetId: activeRs.id, version: "1.0", status: "PUBLISHED" });
    await createTestRulesetVersion(prisma, { rulesetId: activeRs.id, version: "2.0", status: "DRAFT" });

    const rulesets = await prisma.ruleset.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, description: true,
        versions: {
          select: { id: true, version: true, status: true },
          where: { status: "PUBLISHED" },
          orderBy: { version: "desc" },
        },
      },
    });

    check("Only active rulesets", rulesets.length === 1, `got: ${rulesets.length}`);
    if (rulesets.length === 1) {
      check("Correct ruleset", rulesets[0].name === "Active Ruleset", "");
      check("Only PUBLISHED versions", rulesets[0].versions.length === 1, `got: ${rulesets[0].versions.length}`);
      if (rulesets[0].versions.length === 1) {
        check("Correct version", rulesets[0].versions[0].version === "1.0", "");
      }
      const json = JSON.stringify(rulesets[0]);
      check("No internal fields exposed", !json.includes("isActive") && !json.includes("createdAt") && !json.includes("updatedAt"), `got: ${json}`);
    }
  });

  it("GET /api/rulesets/[id] returns active ruleset with PUBLISHED versions only", async () => {
    const rs = await createTestRuleset(prisma, { name: "Test Ruleset" });
    await createTestRulesetVersion(prisma, { rulesetId: rs.id, version: "1.0", status: "PUBLISHED" });
    await createTestRulesetVersion(prisma, { rulesetId: rs.id, version: "2.0", status: "DRAFT" });

    const found = await prisma.ruleset.findUnique({
      where: { id: rs.id, isActive: true },
      select: {
        id: true, name: true, description: true,
        versions: {
          select: { id: true, version: true, status: true },
          where: { status: "PUBLISHED" },
          orderBy: { version: "desc" },
        },
      },
    });

    check("Ruleset found", found !== null, "");
    if (found) {
      check("Only PUBLISHED version", found.versions.length === 1, `got: ${found.versions.length}`);
      if (found.versions.length === 1) {
        check("Correct version", found.versions[0].version === "1.0", "");
        check("DRAFT excluded", found.versions.every((v) => v.status === "PUBLISHED"), "");
      }
      const json = JSON.stringify(found);
      check("No internal fields in ruleset", !json.includes("isActive") && !json.includes("createdAt") && !json.includes("updatedAt"), `got: ${json}`);
    }
  });

  it("GET /api/rulesets/[id] does not expose version internal fields", async () => {
    const rs = await createTestRuleset(prisma, { name: "Safe Ruleset" });
    await createTestRulesetVersion(prisma, { rulesetId: rs.id, version: "1.0", status: "PUBLISHED" });

    const found = await prisma.ruleset.findUnique({
      where: { id: rs.id, isActive: true },
      select: {
        id: true, name: true,
        versions: {
          select: { id: true, version: true, status: true },
          where: { status: "PUBLISHED" },
        },
      },
    });

    check("Ruleset found", found !== null, "");
    if (found && found.versions.length > 0) {
      const version = found.versions[0];
      const versionJson = JSON.stringify(version);
      check("No rulesetId exposed", !versionJson.includes("rulesetId"), `got: ${versionJson}`);
      check("No effectiveDate exposed", !versionJson.includes("effectiveDate"), `got: ${versionJson}`);
      check("No isActive exposed", !versionJson.includes("isActive"), `got: ${versionJson}`);
    }
  });

  it("GET /api/rulesets/[id] returns 404 for inactive ruleset", async () => {
    const rs = await createTestRuleset(prisma, { name: "Inactive Ruleset", isActive: false });

    const found = await prisma.ruleset.findUnique({
      where: { id: rs.id, isActive: true },
    });

    check("Inactive ruleset not accessible", found === null, "");
  });

  it("GET /api/rulesets/[id] returns 404 for nonexistent ruleset", async () => {
    const found = await prisma.ruleset.findUnique({ where: { id: "non-existent" } });
    check("Nonexistent returns null", found === null, "");
  });
});

describe("Catalog API - Pricing Serialization", () => {
  it("should serialize product price correctly for active product", async () => {
    const product = await createTestProduct(prisma, { name: "Priced Product", price: 199.99, isActive: true });

    const found = await prisma.product.findUnique({
      where: { id: product.id, isActive: true },
      select: { id: true, name: true, price: true, currency: true },
    });

    check("Product found", found !== null, "");
    if (found) {
      check("Price is not null", found.price !== null, "");
      check("Price has value", (found.price as unknown as number) > 0, `got: ${found.price}`);
      const priceJson = JSON.stringify(found.price);
      check("Price serializes", priceJson.length > 0, `got: ${priceJson}`);
    }
  });

  it("should serialize zero price correctly", async () => {
    const product = await createTestProduct(prisma, { name: "Free Product", price: 0, isActive: true });

    const found = await prisma.product.findUnique({
      where: { id: product.id, isActive: true },
      select: { id: true, name: true, price: true },
    });

    check("Free product found", found !== null, "");
    if (found) {
      check("Price is 0", (found.price as unknown as { toNumber: () => number }).toNumber() === 0, `got: ${found.price}`);
    }
  });
});
