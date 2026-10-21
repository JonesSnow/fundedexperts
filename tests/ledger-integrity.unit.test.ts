import assert from "node:assert/strict";
import { Prisma, PrismaClient, LedgerEntryType, LedgerDirection, LedgerEntry } from "@prisma/client";
import test from "node:test";
import { createLedgerEntry, type CreateLedgerEntryInput } from "../lib/ledger";

const baseInput: CreateLedgerEntryInput = {
  traderId: "trader-1",
  orderId: "order-1",
  referenceId: "payment-ref-1",
  entryType: LedgerEntryType.CUSTOMER_PAYMENT,
  amount: "12.34",
  direction: LedgerDirection.CREDIT,
  currency: "USD",
};

function makeEntry(input: CreateLedgerEntryInput): LedgerEntry {
  return {
    id: "ledger-entry-1",
    entryNumber: "LED-0001",
    traderId: input.traderId ?? null,
    orderId: input.orderId ?? null,
    referenceId: input.referenceId,
    entryType: input.entryType,
    amount: new Prisma.Decimal(input.amount),
    direction: input.direction,
    currency: input.currency ?? "USD",
    status: "POSTED",
    metadata: null,
    createdBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function prismaStub(ledgerEntry: {
  findUnique: (args: unknown) => Promise<LedgerEntry | null>;
  create: (args: unknown) => Promise<LedgerEntry>;
}): PrismaClient {
  return { ledgerEntry } as unknown as PrismaClient;
}

test("ledger rejects fractional precision that would be rounded by Decimal(18,2) before any query", async () => {
  let databaseCalls = 0;
  const prisma = prismaStub({
    async findUnique() { databaseCalls += 1; return null; },
    async create() { databaseCalls += 1; return makeEntry(baseInput); },
  });

  const result = await createLedgerEntry(prisma, { ...baseInput, amount: "1.005" });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.errorCategory, "VALIDATION_ERROR");
  assert.equal(databaseCalls, 0);
});

test("identical ledger references are idempotent", async () => {
  const existing = makeEntry(baseInput);
  let createCalls = 0;
  const prisma = prismaStub({
    async findUnique() { return existing; },
    async create() { createCalls += 1; return existing; },
  });

  const result = await createLedgerEntry(prisma, baseInput);

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.entry.id, existing.id);
  assert.equal(createCalls, 0);
});

test("reusing a ledger reference with any changed transaction term conflicts", async () => {
  const existing = makeEntry(baseInput);
  const conflictingTerms: Array<Partial<CreateLedgerEntryInput>> = [
    { amount: "99.99" },
    { traderId: "another-trader" },
    { orderId: "another-order" },
    { entryType: LedgerEntryType.PLATFORM_FEE },
    { direction: LedgerDirection.DEBIT },
    { currency: "EUR" },
  ];

  for (const terms of conflictingTerms) {
    let createCalls = 0;
    const prisma = prismaStub({
      async findUnique() { return existing; },
      async create() { createCalls += 1; return existing; },
    });

    const result = await createLedgerEntry(prisma, { ...baseInput, ...terms });

    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.errorCategory, "IDEMPOTENCY_CONFLICT");
    assert.equal(createCalls, 0);
  }
});

test("a unique-key race resolves to the existing identical ledger transaction", async () => {
  const existing = makeEntry(baseInput);
  let lookups = 0;
  const prisma = prismaStub({
    async findUnique() { lookups += 1; return lookups === 1 ? null : existing; },
    async create() { throw Object.assign(new Error("unique conflict"), { code: "P2002" }); },
  });

  const result = await createLedgerEntry(prisma, baseInput);

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.entry.id, existing.id);
  assert.equal(lookups, 2);
});

test("a unique-key race with different terms returns an idempotency conflict", async () => {
  const existing = makeEntry(baseInput);
  let lookups = 0;
  const prisma = prismaStub({
    async findUnique() { lookups += 1; return lookups === 1 ? null : existing; },
    async create() { throw Object.assign(new Error("unique conflict"), { code: "P2002" }); },
  });

  const result = await createLedgerEntry(prisma, { ...baseInput, amount: "99.99" });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.errorCategory, "IDEMPOTENCY_CONFLICT");
  assert.equal(lookups, 2);
});

test("ledger persists decimal strings without converting through floating point", async () => {
  let createdAmount: unknown;
  const prisma = prismaStub({
    async findUnique() { return null; },
    async create(args) {
      const data = (args as { data: { amount: unknown } }).data;
      createdAmount = data.amount;
      return makeEntry({ ...baseInput, amount: String(data.amount) });
    },
  });

  const result = await createLedgerEntry(prisma, { ...baseInput, amount: "0.10" });

  assert.equal(result.success, true);
  assert.equal(createdAmount instanceof Prisma.Decimal, true);
  assert.equal((createdAmount as Prisma.Decimal).toString(), "0.1");
});
