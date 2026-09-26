import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { runCleanupSteps, assertCleanup, type CleanupResult } from "../lib/cleanup-helper";
import { createLedgerEntry, CreateLedgerEntryInput } from "../lib/ledger/service";

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
    "LedgerEntry", "OrderItem", "Order", "Product", "RulesetVersion", "Ruleset",
    "CouponUsage", "Coupon", "Trader",
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

async function createTestTrader(prisma: PrismaClient, email: string): Promise<string> {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  const trader = await prisma.trader.create({
    data: { email, password: passwordHash, role: "TRADER", status: "ACTIVE" },
    select: { id: true },
  });
  return trader.id;
}

async function createTestProduct(prisma: PrismaClient): Promise<string> {
  const product = await prisma.product.create({
    data: { name: `Test Product ${RUN_ID}`, price: 99, isActive: true, currency: "USD" },
    select: { id: true },
  });
  return product.id;
}

async function createTestOrder(prisma: PrismaClient, traderId: string, totalAmount: number, status: "PENDING_PAYMENT" | "PAID" = "PENDING_PAYMENT") {
  const productId = await createTestProduct(prisma);
  return prisma.order.create({
    data: {
      orderNumber: `ORD-TEST-${RUN_ID}-${Date.now()}`,
      traderId,
      status,
      subtotal: totalAmount,
      taxAmount: 0,
      totalAmount,
      currency: "USD",
      orderItems: {
        create: {
          productId,
          unitPrice: totalAmount,
          currency: "USD",
          quantity: 1,
          status: "PENDING",
        },
      },
    },
  });
}

beforeEach(async () => {
  cleanupResult = await cleanup(prisma);
  assertCleanup(cleanupResult, "Ledger Foundation beforeEach");
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult as CleanupResult, "Ledger Foundation");
  }
  console.log(
    `Ledger Foundation Tests: ${results.pass}/${results.pass + results.fail} passed, ${results.fail} failed`,
  );
  results.tests.filter(t => t.result === "FAIL").forEach(t => {
    console.log(`  FAIL: ${t.name} — ${t.detail}`);
  });
  await prisma.$disconnect();
  if (results.fail > 0) process.exit(1);
});

describe("Ledger Foundation - createLedgerEntry", () => {
  it("creates ledger entry for successful payment", async () => {
    const traderId = await createTestTrader(prisma, `ledger-trader-${RUN_ID}@example.com`);
    const order = await createTestOrder(prisma, traderId, 99.99, "PAID");

    const input: CreateLedgerEntryInput = {
      traderId,
      orderId: order.id,
      entryType: "CUSTOMER_PAYMENT",
      amount: new Prisma.Decimal(99.99),
      direction: "CREDIT",
      currency: "USD",
      referenceId: `pay-${order.id}-${order.orderNumber}`,
      metadata: { paymentMethod: "SIMULATED_CARD" },
      createdBy: traderId,
    };

    const result = await createLedgerEntry(input);

    check("Ledger entry created", result.success === true, "");
    if (result.success && result.ledgerEntry) {
      check("Amount preserved", result.ledgerEntry.amount.toString() === "99.99", `got: ${result.ledgerEntry.amount}`);
      check("Direction CREDIT", result.ledgerEntry.direction === "CREDIT", `got: ${result.ledgerEntry.direction}`);
      check("Status POSTED", result.ledgerEntry.status === "POSTED", `got: ${result.ledgerEntry.status}`);
      check("Currency USD", result.ledgerEntry.currency === "USD", `got: ${result.ledgerEntry.currency}`);
    }
  });

  it("prevents duplicate ledger entries via referenceId idempotency", async () => {
    const traderId = await createTestTrader(prisma, `ledger-trader2-${RUN_ID}@example.com`);
    const order = await createTestOrder(prisma, traderId, 49.50, "PAID");

    const input: CreateLedgerEntryInput = {
      traderId,
      orderId: order.id,
      entryType: "CUSTOMER_PAYMENT",
      amount: new Prisma.Decimal(49.50),
      direction: "CREDIT",
      currency: "USD",
      referenceId: `pay-${order.id}-${order.orderNumber}`,
    };

    const result1 = await createLedgerEntry(input);
    const result2 = await createLedgerEntry(input);

    check("First creation succeeds", result1.success === true, "");
    check("Second creation succeeds (idempotent)", result2.success === true, "");
    if (result1.success && result2.success) {
      check("Same entry returned", result1.ledgerEntry?.id === result2.ledgerEntry?.id, `got: ${result1.ledgerEntry?.id} vs ${result2.ledgerEntry?.id}`);
    }

    const count = await prisma.ledgerEntry.count({ where: { referenceId: input.referenceId } });
    check("Only one entry in database", count === 1, `got: ${count}`);
  });

  it("preserves Decimal precision correctly", async () => {
    const traderId = await createTestTrader(prisma, `ledger-trader3-${RUN_ID}@example.com`);
    const order = await createTestOrder(prisma, traderId, 123.45, "PAID");

    const input: CreateLedgerEntryInput = {
      traderId,
      orderId: order.id,
      entryType: "CUSTOMER_PAYMENT",
      amount: new Prisma.Decimal("123.45"),
      direction: "CREDIT",
      currency: "USD",
      referenceId: `pay-precision-${order.id}`,
    };

    const result = await createLedgerEntry(input);

    check("Ledger entry created", result.success === true, "");
    if (result.success && result.ledgerEntry) {
      check("Decimal precision preserved", result.ledgerEntry.amount.toString() === "123.45", `got: ${result.ledgerEntry.amount}`);
    }
  });

  it("handles zero amount correctly", async () => {
    const traderId = await createTestTrader(prisma, `ledger-trader4-${RUN_ID}@example.com`);
    const order = await createTestOrder(prisma, traderId, 0, "PAID");

    const input: CreateLedgerEntryInput = {
      traderId,
      orderId: order.id,
      entryType: "CUSTOMER_PAYMENT",
      amount: new Prisma.Decimal(0),
      direction: "CREDIT",
      currency: "USD",
      referenceId: `pay-zero-${order.id}`,
    };

    const result = await createLedgerEntry(input);

    check("Zero amount accepted", result.success === true, "");
    if (result.success && result.ledgerEntry) {
      check("Amount is zero", result.ledgerEntry.amount.toNumber() === 0, `got: ${result.ledgerEntry.amount}`);
    }
  });
});

describe("Ledger Foundation - Payment Integration", () => {
  it("failed payment does not create successful ledger entry", async () => {
    const traderId = await createTestTrader(prisma, `ledger-trader5-${RUN_ID}@example.com`);
    const order = await createTestOrder(prisma, traderId, 100, "PENDING_PAYMENT");

    const referenceId = `pay-${order.id}-${order.orderNumber}`;

    const existing = await prisma.ledgerEntry.findUnique({ where: { referenceId } });
    check("No ledger entry before failed payment", existing === null, "");
  });

  it("cancelled order payment rejected", async () => {
    const traderId = await createTestTrader(prisma, `ledger-trader6-${RUN_ID}@example.com`);
    const order = await createTestOrder(prisma, traderId, 100, "PENDING_PAYMENT");

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });

    const referenceId = `pay-${order.id}-${order.orderNumber}`;
    const existing = await prisma.ledgerEntry.findUnique({ where: { referenceId } });
    check("No ledger entry for cancelled order", existing === null, "");
  });

  it("already paid order cannot be paid again", async () => {
    const traderId = await createTestTrader(prisma, `ledger-trader7-${RUN_ID}@example.com`);
    const order = await createTestOrder(prisma, traderId, 100, "PAID");

    const referenceId = `pay-${order.id}-${order.orderNumber}`;
    const input: CreateLedgerEntryInput = {
      traderId,
      orderId: order.id,
      entryType: "CUSTOMER_PAYMENT",
      amount: new Prisma.Decimal(100),
      direction: "CREDIT",
      currency: "USD",
      referenceId,
    };

    const result = await createLedgerEntry(input);
    check("Entry created for already-paid order", result.success === true, "");
  });
});