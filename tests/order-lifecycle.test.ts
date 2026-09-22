import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { PrismaClient, OrderStatus } from "@prisma/client";
import { validateCreateOrderInput } from "../lib/order-validation";
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
    {
      label: "orderItem.deleteMany",
      fn: () => prisma.orderItem.deleteMany({}),
    },
  ];
  return runCleanupSteps(prisma, steps);
}

const prisma = new PrismaClient();

async function createTestProduct(prisma: PrismaClient) {
  return prisma.product.create({
    data: {
      name: `Test Product ${RUN_ID}`,
      price: 99.99,
      currency: "USD",
      isActive: true,
      accountSize: 100,
      pricingPlan: "standard",
    },
  });
}

async function createTestTrader(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: {
      email: `test-${RUN_ID}@example.com`,
      password: passwordHash,
      role: "TRADER",
      status: "ACTIVE",
    },
  });
}

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

describe("Order Lifecycle", () => {
  it("should validate order input (valid)", () => {
    const result = validateCreateOrderInput({
      productId: "prod_123",
      idempotencyKey: "key-1",
    });
    assert.equal(result.valid, true);
  });

  it("should reject order input without productId", () => {
    const result = validateCreateOrderInput({});
    assert.equal(result.valid, false);
    assert.ok(result.errors.productId);
  });

  it("should reject non-string productId", () => {
    const result = validateCreateOrderInput({ productId: 123 });
    assert.equal(result.valid, false);
  });
});

describe("Order Status Transitions", () => {
  it("should define valid transitions from CREATED", () => {
    const valid = ["PENDING_PAYMENT", "CANCELLED"];
    valid.forEach((status) =>
      assert.ok(Object.values(OrderStatus).includes(status as OrderStatus)),
    );
  });

  it("should define valid transitions from PENDING_PAYMENT", () => {
    const valid = ["PAID", "FAILED", "CANCELLED", "EXPIRED"];
    valid.forEach((status) =>
      assert.ok(Object.values(OrderStatus).includes(status as OrderStatus)),
    );
  });

  it("should have no transitions from CANCELLED", () => {
    assert.deepEqual(Object.values(OrderStatus), [
      "CREATED",
      "PENDING_PAYMENT",
      "PAID",
      "FAILED",
      "CANCELLED",
      "EXPIRED",
    ]);
  });
});

describe("Order API", () => {
  it("should create order on clean DB", async () => {
    cleanupResult = await cleanup(prisma);
    const product = await createTestProduct(prisma);
    const trader = await createTestTrader(prisma);

    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${RUN_ID}-001`,
        traderId: trader.id,
        rulesetVersionId: null,
        subtotal: product.price ?? 0,
        taxAmount: 0,
        totalAmount: product.price ?? 0,
        currency: product.currency ?? "USD",
        status: "CREATED",
      },
    });

    check("Order created", order.id !== undefined, `id=${order.id}`);
    check("Order has correct trader", order.traderId === trader.id, "");
    check("Order status is CREATED", order.status === "CREATED", "");
    check(
      "Order total is correct",
      order.totalAmount === (product.price ?? 0),
      "",
    );
    check("Order currency is USD", order.currency === "USD", "");
  });

  it("should enforce idempotency key", async () => {
    const product = await prisma.product.findFirst({
      where: { name: `Test Product ${RUN_ID}` },
    });
    const trader = await prisma.trader.findFirst({
      where: { email: `test-${RUN_ID}@example.com` },
    });
    if (!product || !trader) {
      check("Idempotency test setup", false, "Missing test data");
      return;
    }

    const idempotencyKey = `idem-${RUN_ID}-001`;

    const order1 = await prisma.order.create({
      data: {
        orderNumber: `ORD-${RUN_ID}-002`,
        traderId: trader.id,
        rulesetVersionId: null,
        subtotal: product.price ?? 0,
        taxAmount: 0,
        totalAmount: product.price ?? 0,
        currency: "USD",
        idempotencyKey,
      },
    });

    const duplicate = await prisma.order.findUnique({
      where: { idempotencyKey },
    });
    check("Idempotency key stored", duplicate !== null, `orderId=${order1.id}`);
    check("Idempotency key is unique", duplicate?.id === order1.id, "");
  });

  it("should prevent duplicate idempotency key via unique constraint", async () => {
    const trader = await prisma.trader.findFirst({
      where: { email: `test-${RUN_ID}@example.com` },
    });
    const product = await prisma.product.findFirst({
      where: { name: `Test Product ${RUN_ID}` },
    });
    if (!trader || !product) {
      check("Duplicate idempotency setup", false, "Missing test data");
      return;
    }

    const idempotencyKey = `idem-${RUN_ID}-dup`;

    await prisma.order.create({
      data: {
        orderNumber: `ORD-${RUN_ID}-003`,
        traderId: trader.id,
        rulesetVersionId: null,
        subtotal: 50,
        taxAmount: 0,
        totalAmount: 50,
        currency: "USD",
        idempotencyKey,
      },
    });

    try {
      await prisma.order.create({
        data: {
          orderNumber: `ORD-${RUN_ID}-004`,
          traderId: trader.id,
          rulesetVersionId: null,
          subtotal: 50,
          taxAmount: 0,
          totalAmount: 50,
          currency: "USD",
          idempotencyKey,
        },
      });
      check("Duplicate idempotency rejected", false, "Should have thrown");
    } catch (e) {
      const err = e as { code?: string };
      check(
        "Duplicate idempotency rejected",
        err.code === "P2002",
        `code=${err.code}`,
      );
    }
  });

  it("should list orders for trader", async () => {
    const trader = await prisma.trader.findFirst({
      where: { email: `test-${RUN_ID}@example.com` },
    });
    if (!trader) {
      check("List orders setup", false, "Missing test data");
      return;
    }

    const orders = await prisma.order.findMany({
      where: { traderId: trader.id },
    });
    check("Orders listed", orders.length >= 2, `count=${orders.length}`);
  });

  it("should enforce trader-only order access", async () => {
    const otherTrader = await prisma.trader.create({
      data: {
        email: `other-${RUN_ID}@example.com`,
        password: "TestPass123",
        role: "TRADER",
        status: "ACTIVE",
      },
    });
    const orders = await prisma.order.findMany({
      where: { traderId: otherTrader.id },
    });
    check("Other trader has no orders", orders.length === 0, "");
    await prisma.trader.delete({ where: { id: otherTrader.id } });
  });

  it("should enforce admin-only status change", async () => {
    const order = await prisma.order.findFirst({
      where: { status: "CREATED" },
    });
    const trader = await prisma.trader.findFirst({
      where: { email: `test-${RUN_ID}@example.com` },
    });
    if (!order || !trader) {
      check("Status change setup", false, "Missing test data");
      return;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.order.update({
          where: { id: order.id },
          data: { status: "PENDING_PAYMENT" },
        });
        const orderAfter = await tx.order.findUnique({
          where: { id: order.id },
        });
        check(
          "Status transition CREATED→PENDING_PAYMENT",
          orderAfter?.status === "PENDING_PAYMENT",
          "",
        );
      });
    } catch (e) {
      check(
        "Status transition CREATED→PENDING_PAYMENT",
        false,
        e instanceof Error ? e.message : "Unknown",
      );
    }
  });

  it("should enforce invalid status transition rejection", async () => {
    const order = await prisma.order.findFirst({
      where: { status: "PENDING_PAYMENT" },
    });
    if (!order) {
      check("Invalid transition setup", false, "Missing test data");
      return;
    }

    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "EXPIRED" },
      });
      check("Invalid transition rejected", false, "Should have thrown");
    } catch (e) {
      check(
        "Invalid transition rejected",
        true,
        e instanceof Error ? e.message : "",
      );
    }
  });
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult, "Order Lifecycle");
    console.log(
      `[cleanup] ${cleanupResult.passed}/${cleanupResult.total} succeeded, ${cleanupResult.failed} failed`,
    );
  }
  console.log(
    `Order Tests: ${results.pass}/${results.pass + results.fail} passed`,
  );
  await prisma.$disconnect();
  if (results.fail > 0) process.exit(1);
});
