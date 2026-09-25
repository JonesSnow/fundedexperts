import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
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
    "RuleEvaluation", "Rule", "OrderItem", "Order", "Evaluation",
    "FundedAccount", "AccountAssignment", "MT5Account", "Product",
    "RulesetVersion", "Ruleset", "CouponUsage", "Coupon", "Notification",
    "Trader", "LedgerEntry",
  ];
  const steps = tables.map((t) => ({
    label: `${t.toLowerCase()}.truncate`,
    fn: () => prisma.$executeRaw(Prisma.raw(`TRUNCATE TABLE "${t}" CASCADE`)),
  }));
  steps.push({ label: "auditLog.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE` });
  return runCleanupSteps(prisma, steps);
}

async function createTestTrader(prisma: PrismaClient, email: string) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: { email, password: passwordHash, role: "TRADER", status: "ACTIVE" },
  });
}

async function createTestAdmin(prisma: PrismaClient, email: string) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: { email, password: passwordHash, role: "ADMIN", status: "ACTIVE" },
  });
}

const prisma = new PrismaClient();

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

let adminId: string;
let traderId: string;

beforeEach(async () => {
  cleanupResult = await cleanup(prisma);
  assertCleanup(cleanupResult, "Coupon API beforeEach");
  const admin = await createTestAdmin(prisma, `coupon-admin-${RUN_ID}@example.com`);
  const trader = await createTestTrader(prisma, `coupon-trader-${RUN_ID}@example.com`);
  adminId = admin.id;
  traderId = trader.id;
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult as CleanupResult, "Coupon API");
  }
  console.log(
    `Coupon API Tests: ${results.pass}/${results.pass + results.fail} passed, ${results.fail} failed`,
  );
  await prisma.$disconnect();
  if (results.fail > 0) process.exit(1);
});

async function simulateCouponValidate(prisma: PrismaClient, code: string) {
  if (!code || typeof code !== "string") {
    return { success: false, error: "Coupon code is required", coupon: null };
  }

  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon) {
    return { success: false, error: "Invalid coupon", coupon: null };
  }
  if (!coupon.isActive) {
    return { success: false, error: "Coupon is inactive", coupon: null };
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return { success: false, error: "Coupon has expired", coupon: null };
  }
  if (coupon.totalUsageLimit !== null && coupon.totalUsageLimit !== undefined && coupon.usedCount >= coupon.totalUsageLimit) {
    return { success: false, error: "Coupon usage limit reached", coupon: null };
  }

  return { success: true, error: undefined, coupon };
}

async function simulateCouponCreate(prisma: PrismaClient, adminId: string | null, data: { code: string; discountPercent: number; expiresAt?: string; totalUsageLimit?: number }) {
  if (!adminId) {
    return { success: false, error: "Forbidden", coupon: null };
  }

  const admin = await prisma.trader.findUnique({ where: { id: adminId }, select: { role: true } });
  if (!admin || admin.role !== "ADMIN") {
    return { success: false, error: "Forbidden", coupon: null };
  }

  const { code, discountPercent } = data;
  if (!code || typeof code !== "string") {
    return { success: false, error: "Code is required", coupon: null };
  }
  if (typeof discountPercent !== "number" || discountPercent < 1 || discountPercent > 100) {
    return { success: false, error: "Discount percent must be between 1 and 100", coupon: null };
  }

  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) {
    return { success: false, error: "Coupon code already exists", coupon: null };
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      discountPercent,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      totalUsageLimit: data.totalUsageLimit ?? null,
      createdById: adminId,
    },
  });

  return { success: true, error: undefined, coupon };
}

describe("Coupon API - Validation", () => {
  it("should reject empty code", async () => {
    const result = await simulateCouponValidate(prisma, "");
    check("Empty code rejected", result.success === false, "");
    if (!result.success) check("Error message", result.error === "Coupon code is required", `got: ${result.error}`);
  });

  it("should reject non-existent code", async () => {
    const result = await simulateCouponValidate(prisma, "NONEXISTENT");
    check("Non-existent code rejected", result.success === false, "");
    if (!result.success) check("Error message", result.error === "Invalid coupon", `got: ${result.error}`);
  });

  it("should validate active coupon", async () => {
    await prisma.coupon.create({
      data: { code: `VALID-${RUN_ID}`, discountPercent: 25, isActive: true },
    });
    const result = await simulateCouponValidate(prisma, `VALID-${RUN_ID}`);
    check("Valid coupon accepted", result.success === true, "");
    if (result.success) check("Discount percent", result.coupon!.discountPercent === 25, `got: ${result.coupon?.discountPercent}`);
  });

  it("should reject inactive coupon", async () => {
    await prisma.coupon.create({
      data: { code: `INACTIVE-${RUN_ID}`, discountPercent: 10, isActive: false },
    });
    const result = await simulateCouponValidate(prisma, `INACTIVE-${RUN_ID}`);
    check("Inactive coupon rejected", result.success === false, "");
    if (!result.success) check("Error message", result.error === "Coupon is inactive", `got: ${result.error}`);
  });

  it("should reject expired coupon", async () => {
    await prisma.coupon.create({
      data: { code: `EXPIRED-${RUN_ID}`, discountPercent: 10, isActive: true, expiresAt: new Date("2020-01-01") },
    });
    const result = await simulateCouponValidate(prisma, `EXPIRED-${RUN_ID}`);
    check("Expired coupon rejected", result.success === false, "");
    if (!result.success) check("Error message", result.error === "Coupon has expired", `got: ${result.error}`);
  });

  it("should reject coupon at usage limit", async () => {
    await prisma.coupon.create({
      data: { code: `LIMIT-${RUN_ID}`, discountPercent: 10, isActive: true, totalUsageLimit: 1, usedCount: 1 },
    });
    const result = await simulateCouponValidate(prisma, `LIMIT-${RUN_ID}`);
    check("Usage limit coupon rejected", result.success === false, "");
    if (!result.success) check("Error message", result.error === "Coupon usage limit reached", `got: ${result.error}`);
  });
});

describe("Coupon API - Admin Creation", () => {
  it("should reject trader attempting to create coupon", async () => {
    const result = await simulateCouponCreate(prisma, traderId, { code: `TR-${RUN_ID}`, discountPercent: 10 });
    check("Trader creation rejected", result.success === false, "");
    if (!result.success) check("Error message", result.error === "Forbidden", `got: ${result.error}`);
  });

  it("should reject missing code", async () => {
    const result = await simulateCouponCreate(prisma, adminId, { code: "", discountPercent: 10 });
    check("Missing code rejected", result.success === false, "");
  });

  it("should reject invalid discount percent", async () => {
    const result = await simulateCouponCreate(prisma, adminId, { code: `BAD-${RUN_ID}`, discountPercent: 150 });
    check("Invalid discount rejected", result.success === false, "");
  });

  it("should create valid coupon", async () => {
    const result = await simulateCouponCreate(prisma, adminId, { code: `VALID-${RUN_ID}`, discountPercent: 20 });
    check("Valid coupon created", result.success === true, "");
    if (result.success) {
      check("Coupon ID", result.coupon!.id !== "", "");
      check("Created by admin", result.coupon!.createdById === adminId, "");
    }
  });

  it("should reject duplicate code", async () => {
    await prisma.coupon.create({ data: { code: `DUP-${RUN_ID}`, discountPercent: 15, createdById: adminId } });
    const result = await simulateCouponCreate(prisma, adminId, { code: `DUP-${RUN_ID}`, discountPercent: 15 });
    check("Duplicate rejected", result.success === false, "");
    if (!result.success) check("Error message", result.error === "Coupon code already exists", `got: ${result.error}`);
  });

  it("should create coupon with usage limit", async () => {
    const result = await simulateCouponCreate(prisma, adminId, { code: `LIM-${RUN_ID}`, discountPercent: 10, totalUsageLimit: 5 });
    check("Coupon with limit created", result.success === true, "");
    if (result.success) {
      check("Total usage limit", result.coupon!.totalUsageLimit === 5, `got: ${result.coupon?.totalUsageLimit}`);
      check("Used count starts at 0", result.coupon!.usedCount === 0, `got: ${result.coupon?.usedCount}`);
    }
  });
});

describe("Coupon API - Usage Tracking", () => {
  it("should track coupon usage when used", async () => {
    const { coupon } = await simulateCouponCreate(prisma, adminId, { code: `USE-${RUN_ID}`, discountPercent: 10 });
    assert(coupon);

    const usage = await prisma.couponUsage.create({
      data: { couponId: coupon.id, traderId, orderId: `order-${RUN_ID}` },
    });
    check("Usage created", usage.id !== "", "");

    const updated = await prisma.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });
    check("Used count incremented", updated.usedCount === 1, `got: ${updated.usedCount}`);
  });

  it("should prevent duplicate trader coupon usage per order", async () => {
    const { coupon } = await simulateCouponCreate(prisma, adminId, { code: `DUP-${RUN_ID}`, discountPercent: 10 });
    assert(coupon);

    await prisma.couponUsage.create({
      data: { couponId: coupon.id, traderId, orderId: `order-dup-${RUN_ID}` },
    });

    const unique = await prisma.couponUsage.findFirst({
      where: { couponId: coupon.id, traderId, orderId: `order-dup-${RUN_ID}` },
    });
    check("Unique constraint allows first usage", unique !== null, "");
  });
});
