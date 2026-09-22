import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { PrismaClient, OrderStatus } from "@prisma/client";
import { createMockPaymentProvider } from "../lib/mock-payment-provider";
import { activateEvaluation } from "../lib/activation";
import {
  runCleanupSteps,
  assertCleanup,
  type CleanupResult,
} from "../lib/cleanup-helper";

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
  const steps = [
    { label: "order.deleteMany", fn: () => prisma.order.deleteMany({}) },
    { label: "evaluation.deleteMany", fn: () => prisma.evaluation.deleteMany({}) },
    { label: "ledgerEntry.deleteMany", fn: () => prisma.ledgerEntry.deleteMany({}) },
    { label: "rulesetVersion.deleteMany", fn: () => prisma.rulesetVersion.deleteMany({}) },
    { label: "product.deleteMany", fn: () => prisma.product.deleteMany({}) },
    { label: "ruleset.deleteMany", fn: () => prisma.ruleset.deleteMany({}) },
  ];
  return runCleanupSteps(prisma, steps);
}

async function resetDb(prisma: PrismaClient): Promise<void> {
  await cleanup(prisma);
}

beforeEach(async () => {
  await resetDb(prisma);
});

const prisma = new PrismaClient();
const provider = createMockPaymentProvider();

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

async function setupOrder(
  prisma: PrismaClient,
  traderId: string,
  status: OrderStatus,
  rulesetVersionId?: string,
) {
  const product = await prisma.product.create({
    data: {
      name: `Activation Product ${RUN_ID}-${Math.random().toString(36).slice(2, 8)}`,
      price: 100,
      currency: "USD",
      isActive: true,
    },
  });

  let rvId = rulesetVersionId;
  if (!rvId) {
    const ruleset = await prisma.ruleset.create({
      data: { name: `RS-${RUN_ID}-${Math.random().toString(36).slice(2, 8)}`, isActive: true },
    });
    const rv = await prisma.rulesetVersion.create({
      data: { version: "1.0", rulesetId: ruleset.id, status: "PUBLISHED" },
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { rulesetId: ruleset.id },
    });
    rvId = rv.id;
  }

  const order = await prisma.order.create({
    data: {
      orderNumber: `ORD-${RUN_ID}-ACT`,
      traderId,
      rulesetVersionId: rvId,
      subtotal: 100,
      taxAmount: 0,
      totalAmount: 100,
      currency: "USD",
      status,
    },
  });

  return { order, product, rulesetVersionId: rvId };
}

async function createTestTrader(prisma: PrismaClient, email: string) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: { email, password: passwordHash, role: "TRADER", status: "ACTIVE" },
  });
}

describe("Activation - Input Validation", () => {
  it("should reject non-existent order", async () => {
    const result = await activateEvaluation(prisma, provider, {
      orderId: "non-existent-order",
      performedBy: "some-trader",
    });
    check("Non-existent order rejected", result.success === false, "");
    if (!result.success) {
      check(
        "Error category NOT_FOUND",
        result.errorCategory === "NOT_FOUND",
        "",
      );
    }
  });

  it("should reject unauthorized trader", async () => {
    const trader1 = await createTestTrader(
      prisma,
      `act-unauth-1-${RUN_ID}@example.com`,
    );
    const trader2 = await createTestTrader(
      prisma,
      `act-unauth-2-${RUN_ID}@example.com`,
    );
    const { order } = await setupOrder(prisma, trader1.id, OrderStatus.PAID);

    const result = await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader2.id,
    });
    check("Unauthorized trader rejected", result.success === false, "");
    if (!result.success) {
      check(
        "Error category FORBIDDEN",
        result.errorCategory === "FORBIDDEN",
        "",
      );
    }
  });

  it("should reject cancelled order", async () => {
    const trader = await createTestTrader(
      prisma,
      `act-cancelled-${RUN_ID}@example.com`,
    );
    const { order } = await setupOrder(
      prisma,
      trader.id,
      OrderStatus.CANCELLED,
    );

    const result = await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader.id,
    });
    check("Cancelled order rejected", result.success === false, "");
    if (!result.success) {
      check(
        "Error category ORDER_CANCELLED",
        result.errorCategory === "ORDER_CANCELLED",
        "",
      );
    }
  });

  it("should reject unpaid order", async () => {
    const trader = await createTestTrader(
      prisma,
      `act-unpaid-${RUN_ID}@example.com`,
    );
    const { order } = await setupOrder(prisma, trader.id, OrderStatus.CREATED);

    const result = await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader.id,
    });
    check("Unpaid order rejected", result.success === false, "");
    if (!result.success) {
      check(
        "Error category ORDER_NOT_PAID",
        result.errorCategory === "ORDER_NOT_PAID",
        "",
      );
    }
  });
});

describe("Activation - Payment Verification", () => {
  it("should reject when mock payment not completed", async () => {
    const trader = await createTestTrader(
      prisma,
      `act-payfail-${RUN_ID}@example.com`,
    );
    const { order } = await setupOrder(prisma, trader.id, OrderStatus.PAID);

    const result = await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader.id,
      paymentReference: "non-existent-payment",
    });
    check("Unconfirmed payment rejected", result.success === false, "");
    if (!result.success) {
      check(
        "Error category PAYMENT_NOT_CONFIRMED",
        result.errorCategory === "PAYMENT_NOT_CONFIRMED",
        "",
      );
      check("Recoverable true", result.recoverable === true, "");
    }
  });

  it("should accept when mock payment completed", async () => {
    const trader = await createTestTrader(
      prisma,
      `act-payok-${RUN_ID}@example.com`,
    );
    const { order } = await setupOrder(prisma, trader.id, OrderStatus.PAID);

    await provider.processPayment({
      orderId: order.id,
      amount: 100,
      currency: "USD",
      provider: "MOCK",
      idempotencyKey: `pay-${order.id}`,
    });

    const result = await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader.id,
      paymentReference: `pay-${order.id}`,
    });
    check("Activation with confirmed payment", result.success === true, "");
  });
});

describe("Activation - Idempotency", () => {
  it("should prevent duplicate activation", async () => {
    const trader = await createTestTrader(
      prisma,
      `act-dup-${RUN_ID}@example.com`,
    );
    const { order } = await setupOrder(prisma, trader.id, OrderStatus.PAID);

    await provider.processPayment({
      orderId: order.id,
      amount: 100,
      currency: "USD",
      provider: "MOCK",
      idempotencyKey: `pay-dup-${order.id}`,
    });

    const result1 = await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader.id,
      paymentReference: `pay-dup-${order.id}`,
    });
    check("First activation success", result1.success === true, "");

    const result2 = await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader.id,
      paymentReference: `pay-dup-${order.id}`,
    });
    check("Second activation also success", result2.success === true, "");
    if (result2.success) {
      check("Was already activated", result2.wasAlreadyActivated === true, "");
      check(
        "Same evaluation",
        result2.evaluation.id ===
          (result1 as { success: true; evaluation: { id: string } }).evaluation
            .id,
        "",
      );
    }
  });

  it("should not create duplicate evaluation", async () => {
    const trader = await createTestTrader(
      prisma,
      `act-evaldup-${RUN_ID}@example.com`,
    );
    const { order } = await setupOrder(prisma, trader.id, OrderStatus.PAID);

    await provider.processPayment({
      orderId: order.id,
      amount: 100,
      currency: "USD",
      provider: "MOCK",
      idempotencyKey: `pay-evaldup-${order.id}`,
    });

    await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader.id,
      paymentReference: `pay-evaldup-${order.id}`,
    });
    await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader.id,
      paymentReference: `pay-evaldup-${order.id}`,
    });

    const evals = await prisma.evaluation.findMany({
      where: { traderId: trader.id },
    });
    check(
      "Single evaluation created",
      evals.length === 1,
      `count=${evals.length}`,
    );
  });
});

describe("Activation - Ledger and Audit", () => {
  it("should create ledger entry with payment reference", async () => {
    const trader = await createTestTrader(
      prisma,
      `act-ledger-${RUN_ID}@example.com`,
    );
    const { order } = await setupOrder(prisma, trader.id, OrderStatus.PAID);

    await provider.processPayment({
      orderId: order.id,
      amount: 100,
      currency: "USD",
      provider: "MOCK",
      idempotencyKey: `pay-ledger-${order.id}`,
    });

    const result = await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader.id,
      paymentReference: `pay-ledger-${order.id}`,
    });
    check("Activation success", result.success === true, "");
    if (result.success) {
      check("Ledger entry created", result.ledgerEntry !== undefined, "");
      if (result.ledgerEntry) {
        check(
          "Ledger entry references order",
          result.ledgerEntry.orderId === order.id,
          "",
        );
        check(
          "Ledger entry CREDIT",
          result.ledgerEntry.direction === "CREDIT",
          "",
        );
        check(
          "Ledger entry CUSTOMER_PAYMENT",
          result.ledgerEntry.entryType === "CUSTOMER_PAYMENT",
          "",
        );
      }
    }
  });
});

describe("Activation - Error Visibility", () => {
  it("should return explicit failure when no account available", async () => {
    const trader = await createTestTrader(
      prisma,
      `act-alloc-${RUN_ID}@example.com`,
    );
    const { order } = await setupOrder(prisma, trader.id, OrderStatus.PAID);

    await provider.processPayment({
      orderId: order.id,
      amount: 100,
      currency: "USD",
      provider: "MOCK",
      idempotencyKey: `pay-alloc-${order.id}`,
    });

    const result = await activateEvaluation(prisma, provider, {
      orderId: order.id,
      performedBy: trader.id,
      paymentReference: `pay-alloc-${order.id}`,
    });
    check(
      "Allocation failure returns explicit failure",
      result.success === false,
      `got success=${result.success}`,
    );
    check("No false success", !(result as { success: false }).success, "");
  });
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult as CleanupResult, "Activation Tests");
    console.log(
      `[cleanup] ${(cleanupResult as CleanupResult).passed}/${(cleanupResult as CleanupResult).total} succeeded, ${(cleanupResult as CleanupResult).failed} failed`,
    );
  }
  console.log(
    `Activation Tests: ${results.pass}/${results.pass + results.fail} passed`,
  );
  await prisma.$disconnect();
});
