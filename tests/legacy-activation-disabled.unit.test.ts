import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { PaymentProvider } from "../lib/payment";
import { activateEvaluation } from "../lib/activation";
import { allocateAccount } from "../lib/allocation";

describe("retired legacy activation and allocation entry points", () => {
  it("rejects legacy activation before accessing the database or payment provider", async () => {
    const prisma = new Proxy({}, { get: () => { throw new Error("database access attempted"); } }) as PrismaClient;
    const provider = new Proxy({}, { get: () => { throw new Error("payment provider access attempted"); } }) as PaymentProvider;

    const result = await activateEvaluation(prisma, provider, {
      orderId: "order-1",
      performedBy: "trader-1",
      paymentReference: "untrusted-reference",
    });

    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.errorCategory, "LEGACY_ACTIVATION_DISABLED");
  });

  it("rejects unscoped legacy allocation before accessing the database", async () => {
    const prisma = new Proxy({}, { get: () => { throw new Error("database access attempted"); } }) as PrismaClient;

    const result = await allocateAccount(prisma, { traderId: "trader-1" });

    assert.equal(result.success, false);
    if (!result.success) assert.match(result.error, /Legacy account allocation is disabled/);
  });
});
