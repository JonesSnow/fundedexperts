import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import {
  PrismaClient,
  LedgerEntryType,
  LedgerDirection,
  LedgerEntryStatus,
} from "@prisma/client";
import {
  createLedgerEntry,
  getLedgerEntries,
  getLedgerEntryByReference,
} from "../lib/ledger";
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
    {
      label: "ledgerEntry.deleteMany",
      fn: () => prisma.ledgerEntry.deleteMany({}),
    },
  ];
  return runCleanupSteps(prisma, steps);
}

const prisma = new PrismaClient();

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

describe("Ledger Entry Creation", () => {
  it("should create a valid ledger entry", async () => {
    cleanupResult = await cleanup(prisma);
    const result = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-001`,
      entryType: LedgerEntryType.CUSTOMER_PAYMENT,
      amount: 99.99,
      direction: LedgerDirection.CREDIT,
      currency: "USD",
      createdBy: "system",
    });
    check("Entry created", result.success === true, "");
    if (result.success) {
      check("Entry has id", result.entry.id !== undefined, "");
      check(
        "Entry has entryNumber",
        result.entry.entryNumber !== undefined,
        "",
      );
      check(
        "Entry type correct",
        result.entry.entryType === LedgerEntryType.CUSTOMER_PAYMENT,
        "",
      );
      check("Entry amount correct", result.entry.amount.equals(99.99), "");
      check(
        "Entry direction correct",
        result.entry.direction === LedgerDirection.CREDIT,
        "",
      );
      check("Entry currency USD", result.entry.currency === "USD", "");
      check(
        "Entry status POSTED",
        result.entry.status === LedgerEntryStatus.POSTED,
        "",
      );
      check("Entry createdBy", result.entry.createdBy === "system", "");
    }
  });

  it("should enforce referenceId uniqueness", async () => {
    const result1 = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-unique`,
      entryType: LedgerEntryType.PLATFORM_FEE,
      amount: 10.0,
      direction: LedgerDirection.DEBIT,
      createdBy: "system",
    });
    check("First entry created", result1.success === true, "");

    const result2 = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-unique`,
      entryType: LedgerEntryType.PLATFORM_FEE,
      amount: 20.0,
      direction: LedgerDirection.DEBIT,
      createdBy: "system",
    });
    check("Duplicate returns existing", result2.success === true, "");
    if (result2.success) {
      check(
        "Duplicate has same id",
        result2.entry.id ===
          (result1 as { success: true; entry: { id: string } }).entry.id,
        "",
      );
      check("Duplicate has original amount", result2.entry.amount.equals(10.0), "");
    }
  });

  it("should reject invalid amount (zero)", async () => {
    const result = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-invalid`,
      entryType: LedgerEntryType.CUSTOMER_PAYMENT,
      amount: 0,
      direction: LedgerDirection.CREDIT,
      createdBy: "system",
    });
    check("Zero amount rejected", result.success === false, "");
    if (!result.success) {
      check(
        "Has VALIDATION_ERROR",
        result.errorCategory === "VALIDATION_ERROR",
        "",
      );
    }
  });

  it("should reject invalid amount (negative)", async () => {
    const result = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-neg`,
      entryType: LedgerEntryType.CUSTOMER_PAYMENT,
      amount: -10,
      direction: LedgerDirection.CREDIT,
      createdBy: "system",
    });
    check("Negative amount rejected", result.success === false, "");
  });

  it("should reject missing referenceId", async () => {
    const result = await createLedgerEntry(prisma, {
      entryType: LedgerEntryType.CUSTOMER_PAYMENT,
      amount: 10,
      direction: LedgerDirection.CREDIT,
      createdBy: "system",
    } as unknown as Parameters<typeof createLedgerEntry>[1]);
    check("Missing referenceId rejected", result.success === false, "");
  });

  it("should reject invalid entryType", async () => {
    const result = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-badtype`,
      entryType: "INVALID_TYPE" as LedgerEntryType,
      amount: 10,
      direction: LedgerDirection.CREDIT,
      createdBy: "system",
    });
    check("Invalid entryType rejected", result.success === false, "");
  });

  it("should reject invalid direction", async () => {
    const result = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-baddir`,
      entryType: LedgerEntryType.CUSTOMER_PAYMENT,
      amount: 10,
      direction: "INVALID" as LedgerDirection,
      createdBy: "system",
    });
    check("Invalid direction rejected", result.success === false, "");
  });

  it("should create DEBIT entries", async () => {
    const result = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-debit`,
      entryType: LedgerEntryType.PLATFORM_FEE,
      amount: 5.5,
      direction: LedgerDirection.DEBIT,
      createdBy: "system",
    });
    check("DEBIT entry created", result.success === true, "");
    if (result.success) {
      check(
        "Direction is DEBIT",
        result.entry.direction === LedgerDirection.DEBIT,
        "",
      );
    }
  });

  it("should create TRADER_PAYOUT entries", async () => {
    const result = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-payout`,
      entryType: LedgerEntryType.TRADER_PAYOUT,
      amount: 100.0,
      direction: LedgerDirection.DEBIT,
      currency: "EUR",
      createdBy: "admin",
    });
    check("TRADER_PAYOUT entry created", result.success === true, "");
  });

  it("should create INTERNAL_ADJUSTMENT entries", async () => {
    const result = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-adj`,
      entryType: LedgerEntryType.INTERNAL_ADJUSTMENT,
      amount: 1.0,
      direction: LedgerDirection.CREDIT,
      createdBy: "system",
    });
    check("INTERNAL_ADJUSTMENT entry created", result.success === true, "");
  });

  it("should create with metadata", async () => {
    const result = await createLedgerEntry(prisma, {
      referenceId: `ref-${RUN_ID}-meta`,
      entryType: LedgerEntryType.CUSTOMER_PAYMENT,
      amount: 50.0,
      direction: LedgerDirection.CREDIT,
      metadata: { note: "test metadata" },
      createdBy: "system",
    });
    check("Entry with metadata created", result.success === true, "");
    if (result.success) {
      check("Metadata stored", result.entry.metadata !== null, "");
    }
  });
});

describe("Ledger Queries", () => {
  it("should retrieve entry by reference", async () => {
    const entry = await getLedgerEntryByReference(prisma, `ref-${RUN_ID}-001`);
    check("Entry found by reference", entry !== null, "");
    if (entry) {
      check(
        "Entry reference matches",
        entry.referenceId === `ref-${RUN_ID}-001`,
        "",
      );
    }
  });

  it("should return null for unknown reference", async () => {
    const entry = await getLedgerEntryByReference(
      prisma,
      `non-existent-${RUN_ID}`,
    );
    check("Unknown reference returns null", entry === null, "");
  });

  it("should list entries filtered by type", async () => {
    const entries = await getLedgerEntries(prisma, {
      entryType: LedgerEntryType.PLATFORM_FEE,
    });
    check("Entries found", entries.length >= 1, `count=${entries.length}`);
    entries.forEach((e) => {
      check(
        "All PLATFORM_FEE",
        e.entryType === LedgerEntryType.PLATFORM_FEE,
        "",
      );
    });
  });

  it("should list entries filtered by traderId", async () => {
    const entries = await getLedgerEntries(prisma, {
      traderId: "non-existent-trader",
    });
    check(
      "No entries for unknown trader",
      entries.length === 0,
      `count=${entries.length}`,
    );
  });
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult, "Ledger Entry Creation");
    console.log(
      `[cleanup] ${cleanupResult.passed}/${cleanupResult.total} succeeded, ${cleanupResult.failed} failed`,
    );
  }
  console.log(
    `Ledger Tests: ${results.pass}/${results.pass + results.fail} passed`,
  );
  await prisma.$disconnect();
});
