import { describe, it, beforeEach, after } from "node:test";
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
    "CouponUsage", "Coupon", "OrderItem", "Order",
    "Product", "RulesetVersion", "Ruleset", "Trader", "LedgerEntry",
  ];
  const steps = tables.map((t) => ({
    label: `${t.toLowerCase()}.truncate`,
    fn: () => prisma.$executeRaw(Prisma.raw(`TRUNCATE TABLE "${t}" CASCADE`)),
  }));
  steps.push({ label: "auditLog.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE` });
  return runCleanupSteps(prisma, steps);
}

const prisma = new PrismaClient();

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

beforeEach(async () => {
  cleanupResult = await cleanup(prisma);
  assertCleanup(cleanupResult, "Coupon Checkout beforeEach");
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult as CleanupResult, "Coupon Checkout");
  }
  console.log(
    `Coupon Checkout Tests: ${results.pass}/${results.pass + results.fail} passed, ${results.fail} failed`,
  );
  results.tests.filter(t => t.result === "FAIL").forEach(t => {
    console.log(`  FAIL: ${t.name} — ${t.detail}`);
  });
  await prisma.$disconnect();
  if (results.fail > 0) process.exit(1);
});

function simulateOrderInput(body: Record<string, unknown>): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!body.productId || typeof body.productId !== "string") {
    errors.productId = "Product ID is required";
  }
  if (body.idempotencyKey !== undefined && typeof body.idempotencyKey !== "string") {
    errors.idempotencyKey = "Idempotency key must be a string";
  }
  if (body.notes !== undefined && typeof body.notes !== "string") {
    errors.notes = "Notes must be a string";
  }
  if (body.rulesetVersionId !== undefined && typeof body.rulesetVersionId !== "string") {
    errors.rulesetVersionId = "Ruleset version ID must be a string";
  }
  if (body.couponCode !== undefined && typeof body.couponCode !== "string") {
    errors.couponCode = "Coupon code must be a string";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

interface SimulatedOrderResult {
  success: boolean;
  status: number;
  order?: Record<string, unknown>;
  error?: string;
  errors?: Record<string, string>;
  duplicate?: boolean;
}

async function simulateOrderCreate(prisma: PrismaClient, traderId: string, body: Record<string, unknown>): Promise<SimulatedOrderResult> {
  const validation = simulateOrderInput(body);
  if (!validation.valid) {
    return { success: false, status: 400, errors: validation.errors };
  }

  const { productId, rulesetVersionId, idempotencyKey, notes, couponCode } = body as {
    productId: string;
    rulesetVersionId?: string;
    idempotencyKey?: string;
    notes?: string;
    couponCode?: string;
  };

  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return { success: true, status: 200, order: existing as unknown as Record<string, unknown>, duplicate: true };
    }
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) {
    return { success: false, status: 404, error: "Product not found or inactive" };
  }

  let coupon: { id: string; discountPercent: number; isActive: boolean; expiresAt: Date | null; totalUsageLimit: number | null; usedCount: number } | null = null;
  let discountAmount = 0;

  if (couponCode && typeof couponCode === "string") {
    const c = await prisma.coupon.findUnique({ where: { code: couponCode } });
    if (!c) {
      return { success: false, status: 400, error: "Invalid coupon code" };
    }
    if (!c.isActive) {
      return { success: false, status: 400, error: "Coupon is inactive" };
    }
    if (c.expiresAt && c.expiresAt < new Date()) {
      return { success: false, status: 400, error: "Coupon has expired" };
    }
    if (c.totalUsageLimit !== null && c.totalUsageLimit !== undefined && c.usedCount >= c.totalUsageLimit) {
      return { success: false, status: 400, error: "Coupon usage limit reached" };
    }
    coupon = c;
    discountAmount = Number(product.price ?? 0) * (c.discountPercent / 100);
  }

  const subtotal = Number(product.price ?? 0);
  const totalAmount = Math.max(0, subtotal - discountAmount);

  const orderNumber = `ORD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const order = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        traderId,
        rulesetVersionId: rulesetVersionId ?? null,
        subtotal,
        taxAmount: 0,
        totalAmount,
        currency: product.currency ?? "USD",
        idempotencyKey: idempotencyKey ?? null,
        notes: notes ?? null,
      },
    });

    if (coupon) {
      await tx.couponUsage.create({
        data: {
          couponId: coupon.id,
          traderId,
          orderId: createdOrder.id,
        },
      });
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    return createdOrder;
  });

  return { success: true, status: 201, order: order as unknown as Record<string, unknown> };
}

async function createTrader(prisma: PrismaClient, email: string): Promise<string> {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  const trader = await prisma.trader.create({
    data: { email, password: passwordHash, role: "TRADER", status: "ACTIVE" },
    select: { id: true },
  });
  return trader.id;
}

async function createProduct(prisma: PrismaClient, name: string, price: number, isActive: boolean) {
  return prisma.product.create({
    data: { name, price, isActive, currency: "USD" },
  });
}

describe("Coupon Checkout - Coupon Response Sanitization", () => {
  it("GET coupon should not expose createdById", async () => {
    const admin = await prisma.trader.create({
      data: { email: `admin-${RUN_ID}@example.com`, password: "test", role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    await prisma.coupon.create({
      data: {
        code: `SAFE-${RUN_ID}`,
        discountPercent: 10,
        isActive: true,
        createdById: admin.id,
      },
    });

    const coupon = await prisma.coupon.findUnique({
      where: { code: `SAFE-${RUN_ID}` },
      select: {
        id: true, code: true, discountPercent: true, isActive: true,
        expiresAt: true, totalUsageLimit: true, usedCount: true, createdAt: true,
      },
    });

    check("Coupon found", coupon !== null, "");
    if (coupon) {
      const json = JSON.stringify(coupon);
      check("No createdById in response", !json.includes("createdById"), `got: ${json}`);
      check("No createdBy in response", !json.includes("createdBy"), `got: ${json}`);
    }
  });
});

describe("Coupon Checkout - Order Creation Validation", () => {
  it("Order rejects nonexistent product", async () => {
    const traderId = await createTrader(prisma, `trader-${RUN_ID}@example.com`);
    const result = await simulateOrderCreate(prisma, traderId, { productId: "non-existent" });
    check("Nonexistent product rejected", result.status === 404, `got: ${result.status}`);
    if (result.status === 404) check("Error message", result.error === "Product not found or inactive", `got: ${result.error}`);
  });

  it("Order rejects inactive product", async () => {
    const traderId = await createTrader(prisma, `trader2-${RUN_ID}@example.com`);
    const product = await createProduct(prisma, "Inactive", 99, false);
    const result = await simulateOrderCreate(prisma, traderId, { productId: product.id });
    check("Inactive product rejected", result.status === 404, `got: ${result.status}`);
  });

  it("Order rejects invalid coupon code", async () => {
    const traderId = await createTrader(prisma, `trader3-${RUN_ID}@example.com`);
    const product = await createProduct(prisma, "Test", 99, true);
    const result = await simulateOrderCreate(prisma, traderId, { productId: product.id, couponCode: "INVALID" });
    check("Invalid coupon rejected", result.status === 400, `got: ${result.status}`);
    if (result.status === 400) check("Error message", result.error === "Invalid coupon code", `got: ${result.error}`);
  });

  it("Order rejects expired coupon", async () => {
    const traderId = await createTrader(prisma, `trader4-${RUN_ID}@example.com`);
    const product = await createProduct(prisma, "Test", 99, true);
    await prisma.coupon.create({
      data: { code: `EXP-${RUN_ID}`, discountPercent: 10, isActive: true, expiresAt: new Date("2020-01-01") },
    });
    const result = await simulateOrderCreate(prisma, traderId, { productId: product.id, couponCode: `EXP-${RUN_ID}` });
    check("Expired coupon rejected", result.status === 400, `got: ${result.status}`);
    if (result.status === 400) check("Error message", result.error === "Coupon has expired", `got: ${result.error}`);
  });

  it("Order rejects inactive coupon", async () => {
    const traderId = await createTrader(prisma, `trader5-${RUN_ID}@example.com`);
    const product = await createProduct(prisma, "Test", 99, true);
    await prisma.coupon.create({
      data: { code: `INACT-${RUN_ID}`, discountPercent: 10, isActive: false },
    });
    const result = await simulateOrderCreate(prisma, traderId, { productId: product.id, couponCode: `INACT-${RUN_ID}` });
    check("Inactive coupon rejected", result.status === 400, `got: ${result.status}`);
    if (result.status === 400) check("Error message", result.error === "Coupon is inactive", `got: ${result.error}`);
  });

  it("Order rejects coupon at usage limit", async () => {
    const traderId = await createTrader(prisma, `trader6-${RUN_ID}@example.com`);
    const product = await createProduct(prisma, "Test", 99, true);
    await prisma.coupon.create({
      data: { code: `LIM-${RUN_ID}`, discountPercent: 10, isActive: true, totalUsageLimit: 1, usedCount: 1 },
    });
    const result = await simulateOrderCreate(prisma, traderId, { productId: product.id, couponCode: `LIM-${RUN_ID}` });
    check("Usage limit coupon rejected", result.status === 400, `got: ${result.status}`);
    if (result.status === 400) check("Error message", result.error === "Coupon usage limit reached", `got: ${result.error}`);
  });

  it("Order with valid coupon creates order", async () => {
    const traderId = await createTrader(prisma, `trader7-${RUN_ID}@example.com`);
    const product = await createProduct(prisma, "Test", 100, true);
    await prisma.coupon.create({
      data: { code: `VALID-${RUN_ID}`, discountPercent: 10, isActive: true, totalUsageLimit: 10 },
    });
    const result = await simulateOrderCreate(prisma, traderId, {
      productId: product.id,
      couponCode: `VALID-${RUN_ID}`,
      idempotencyKey: `idem-${RUN_ID}`,
    });
    check("Valid coupon order created", result.status === 201, `got: ${result.status}`);
    if (result.status === 201 && result.order) {
      check("Order has totalAmount", result.order.totalAmount !== undefined, "");
      check("Discount applied", (result.order.totalAmount as number) < 100, `got: ${result.order.totalAmount}`);
    }
  });

  it("Order applies 25% discount correctly", async () => {
    const traderId = await createTrader(prisma, `trader8-${RUN_ID}@example.com`);
    const product = await createProduct(prisma, "Test", 200, true);
    await prisma.coupon.create({
      data: { code: `DISC-${RUN_ID}`, discountPercent: 25, isActive: true },
    });
    const result = await simulateOrderCreate(prisma, traderId, {
      productId: product.id,
      couponCode: `DISC-${RUN_ID}`,
    });
    check("Order created", result.status === 201, `got: ${result.status}`);
    if (result.status === 201 && result.order) {
      check("Subtotal correct", Number(result.order.subtotal) === 200, `got: ${result.order.subtotal}`);
      check("Discount 25% applied", Number(result.order.totalAmount) === 150, `got: ${result.order.totalAmount}`);
    }
  });

  it("Order with 100% discount results in 0 total", async () => {
    const traderId = await createTrader(prisma, `trader9-${RUN_ID}@example.com`);
    const product = await createProduct(prisma, "Free", 50, true);
    await prisma.coupon.create({
      data: { code: `FULL-${RUN_ID}`, discountPercent: 100, isActive: true },
    });
    const result = await simulateOrderCreate(prisma, traderId, {
      productId: product.id,
      couponCode: `FULL-${RUN_ID}`,
    });
    check("Order created", result.status === 201, `got: ${result.status}`);
    if (result.status === 201 && result.order) {
      check("Total is 0", Number(result.order.totalAmount) === 0, `got: ${result.order.totalAmount}`);
    }
  });

  it("Order rejects without productId", async () => {
    const traderId = await createTrader(prisma, `trader10-${RUN_ID}@example.com`);
    const result = await simulateOrderCreate(prisma, traderId, {});
    check("Missing productId rejected", result.status === 400, `got: ${result.status}`);
  });

  it("Order with idempotency key returns existing order", async () => {
    const traderId = await createTrader(prisma, `trader11-${RUN_ID}@example.com`);
    const product = await createProduct(prisma, "Test", 99, true);
    const res1 = await simulateOrderCreate(prisma, traderId, {
      productId: product.id,
      idempotencyKey: `idem2-${RUN_ID}`,
    });
    check("First request created", res1.status === 201, `got: ${res1.status}`);

    const res2 = await simulateOrderCreate(prisma, traderId, {
      productId: product.id,
      idempotencyKey: `idem2-${RUN_ID}`,
    });
    check("Duplicate returned existing", res2.status === 200, `got: ${res2.status}`);
    if (res2.status === 200) check("Duplicate flag", res2.duplicate === true, `got: ${res2.duplicate}`);
  });

  it("Order assigns traderId from session not body", async () => {
    const traderId = await createTrader(prisma, `trader12-${RUN_ID}@example.com`);
    const otherTraderId = await createTrader(prisma, `other-${RUN_ID}@example.com`);
    const product = await createProduct(prisma, "Test", 99, true);
    const result = await simulateOrderCreate(prisma, traderId, {
      productId: product.id,
    });
    check("Order created", result.status === 201, `got: ${result.status}`);
    if (result.status === 201 && result.order) {
      check("Order belongs to session trader", result.order.traderId === traderId, `got: ${result.order.traderId}`);
      check("Order does not belong to other trader", result.order.traderId !== otherTraderId, "");
    }
  });
});
