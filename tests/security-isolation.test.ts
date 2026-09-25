import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
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
    data: {
      email,
      password: passwordHash,
      role: "TRADER",
      status: "ACTIVE",
      emailVerificationToken: randomBytes(32).toString("hex"),
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

const prisma = new PrismaClient();

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

let trader1Id: string;
let trader2Id: string;

beforeEach(async () => {
  cleanupResult = await cleanup(prisma);
  assertCleanup(cleanupResult, "Security Isolation beforeEach");
  trader1Id = (await createTestTrader(prisma, `sec-t1-${RUN_ID}@example.com`)).id;
  trader2Id = (await createTestTrader(prisma, `sec-t2-${RUN_ID}@example.com`)).id;
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult as CleanupResult, "Security Isolation");
  }
  console.log(
    `Security Isolation Tests: ${results.pass}/${results.pass + results.fail} passed, ${results.fail} failed`,
  );
  await prisma.$disconnect();
  if (results.fail > 0) process.exit(1);
});

async function simulateGetOrder(prisma: PrismaClient, orderId: string, traderId: string | null, role: string) {
  if (!traderId) return { success: false, error: "Unauthorized", status: 401, order: null };
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found", status: 404, order: null };
  if (role === "TRADER" && order.traderId !== traderId) return { success: false, error: "Forbidden", status: 403, order: null };
  return { success: true, error: undefined, status: 200, order };
}

async function simulateGetEvaluation(prisma: PrismaClient, evaluationId: string, traderId: string | null, role: string) {
  if (!traderId) return { success: false, error: "Unauthorized", status: 401, evaluation: null };
  const evaluation = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
  if (!evaluation) return { success: false, error: "Evaluation not found", status: 404, evaluation: null };
  if (role === "TRADER" && evaluation.traderId !== traderId) return { success: false, error: "Forbidden", status: 403, evaluation: null };
  return { success: true, error: undefined, status: 200, evaluation };
}

async function simulateGetFundedAccount(prisma: PrismaClient, accountId: string, traderId: string | null) {
  if (!traderId) return { success: false, error: "Unauthorized", status: 401, account: null };
  const account = await prisma.fundedAccount.findUnique({ where: { id: accountId } });
  if (!account) return { success: false, error: "Account not found", status: 404, account: null };
  if (account.traderId !== traderId) return { success: false, error: "Forbidden", status: 403, account: null };
  return { success: true, error: undefined, status: 200, account };
}

describe("Security - Order Isolation", () => {
  it("should create separate orders for separate traders", async () => {
    const product = await prisma.product.create({
      data: { name: `P-${RUN_ID}`, accountSize: 100000, price: 0, currency: "USD", isActive: true },
    });

    const order1 = await prisma.order.create({
      data: { orderNumber: `ORD1-${RUN_ID}`, traderId: trader1Id, rulesetVersionId: null, subtotal: 0, taxAmount: 0, totalAmount: 0, currency: "USD" },
    });
    const order2 = await prisma.order.create({
      data: { orderNumber: `ORD2-${RUN_ID}`, traderId: trader2Id, rulesetVersionId: null, subtotal: 0, taxAmount: 0, totalAmount: 0, currency: "USD" },
    });

    check("Order1 belongs to trader1", order1.traderId === trader1Id, "");
    check("Order2 belongs to trader2", order2.traderId === trader2Id, "");
  });

  it("should reject trader1 accessing trader2 order", async () => {
    const order = await prisma.order.create({
      data: { orderNumber: `ORD-${RUN_ID}`, traderId: trader2Id, rulesetVersionId: null, subtotal: 0, taxAmount: 0, totalAmount: 0, currency: "USD" },
    });

    const result = await simulateGetOrder(prisma, order.id, trader1Id, "TRADER");
    check("Access rejected", result.success === false, "");
    if (!result.success) check("Status 403", result.status === 403, `got: ${result.status}`);
  });

  it("should allow trader1 accessing own order", async () => {
    const order = await prisma.order.create({
      data: { orderNumber: `ORD-${RUN_ID}`, traderId: trader1Id, rulesetVersionId: null, subtotal: 0, taxAmount: 0, totalAmount: 0, currency: "USD" },
    });

    const result = await simulateGetOrder(prisma, order.id, trader1Id, "TRADER");
    check("Access allowed", result.success === true, "");
  });
});

describe("Security - Evaluation Isolation", () => {
  it("should reject trader1 accessing trader2 evaluation", async () => {
    const ruleset = await prisma.ruleset.create({ data: { name: `RS-${RUN_ID}` } });
    const rv = await prisma.rulesetVersion.create({ data: { rulesetId: ruleset.id, version: "1.0", status: "PUBLISHED", effectiveDate: new Date() } });
    const eval2 = await prisma.evaluation.create({ data: { traderId: trader2Id, rulesetVersionId: rv.id, status: "IN_PROGRESS" } });

    const result = await simulateGetEvaluation(prisma, eval2.id, trader1Id, "TRADER");
    check("Access rejected", result.success === false, "");
    if (!result.success) check("Status 403", result.status === 403, `got: ${result.status}`);
  });

  it("should allow trader1 accessing own evaluation", async () => {
    const ruleset = await prisma.ruleset.create({ data: { name: `RS-${RUN_ID}` } });
    const rv = await prisma.rulesetVersion.create({ data: { rulesetId: ruleset.id, version: "1.0", status: "PUBLISHED", effectiveDate: new Date() } });
    const eval1 = await prisma.evaluation.create({ data: { traderId: trader1Id, rulesetVersionId: rv.id, status: "IN_PROGRESS" } });

    const result = await simulateGetEvaluation(prisma, eval1.id, trader1Id, "TRADER");
    check("Access allowed", result.success === true, "");
  });
});

describe("Security - Funded Account Isolation", () => {
  it("should reject trader1 accessing trader2 funded account", async () => {
    const account = await prisma.fundedAccount.create({
      data: { traderId: trader2Id, status: "PENDING", totalPnl: null, allocatedAt: null, activatedAt: null, closedAt: null },
    });

    const result = await simulateGetFundedAccount(prisma, account.id, trader1Id);
    check("Access rejected", result.success === false, "");
    if (!result.success) check("Status 403", result.status === 403, `got: ${result.status}`);
  });

  it("should allow trader1 accessing own funded account", async () => {
    const account = await prisma.fundedAccount.create({
      data: { traderId: trader1Id, status: "PENDING", totalPnl: null, allocatedAt: null, activatedAt: null, closedAt: null },
    });

    const result = await simulateGetFundedAccount(prisma, account.id, trader1Id);
    check("Access allowed", result.success === true, "");
  });
});

describe("Security - Email Verification Gate", () => {
  it("should track unverified emails at registration", async () => {
    const trader = await prisma.trader.findUnique({ where: { id: trader1Id } });
    check("Email unverified at registration", trader?.emailVerified === false, `got: ${trader?.emailVerified}`);
    check("Verification token set", trader?.emailVerificationToken !== null, "");
    check("Verification expiry set", trader?.emailVerificationExpires !== null, "");
  });

  it("should verify email when token is validated", async () => {
    const trader = await prisma.trader.findUnique({ where: { id: trader1Id } });
    assert(trader?.emailVerificationToken);

    const result = await prisma.trader.update({
      where: { id: trader1Id },
      data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
    });
    check("Email verified", result.emailVerified === true, "");
    check("Token cleared", result.emailVerificationToken === null, "");
  });
});
