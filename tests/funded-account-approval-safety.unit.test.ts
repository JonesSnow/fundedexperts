import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { approveFundedAccount } from "../lib/funded-account";

function mockPrisma(initialStatus: string) {
  const operations: string[] = [];
  const account = {
    id: "funded-1",
    status: initialStatus,
    evaluationId: "evaluation-1",
    rulesetVersionId: "ruleset-1",
  };
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      operations.push("funded-lock");
      assert.equal(values[0], account.id);
      assert.match(strings.join("?"), /FOR UPDATE/);
      return [{ id: account.id }];
    },
    fundedAccount: {
      findUnique: async () => {
        operations.push("funded-read");
        return { ...account };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        assert.equal(where.status, account.status);
        assert.equal(data.status, "APPROVED");
        operations.push("funded-approve");
        account.status = "APPROVED";
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }: { data: { details: { statusChange: { from: string; to: string } } } }) => {
        assert.deepEqual(data.details.statusChange, { from: initialStatus, to: "APPROVED" });
        operations.push("audit-create");
        return {};
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaClient;
  return { prisma, operations };
}

test("approval reads and conditionally advances the locked current state with its audit", async () => {
  const { prisma, operations } = mockPrisma("ELIGIBLE");
  const result = await approveFundedAccount(prisma, { id: "funded-1", performedBy: "admin-1" });

  assert.deepEqual(operations, ["funded-lock", "funded-read", "funded-approve", "funded-read", "audit-create"]);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.account.status, "APPROVED");
});

test("a stale approval cannot overwrite a later ACTIVE state", async () => {
  const { prisma, operations } = mockPrisma("ACTIVE");
  const result = await approveFundedAccount(prisma, { id: "funded-1", performedBy: "admin-1" });

  assert.deepEqual(operations, ["funded-lock", "funded-read"]);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.errorCategory, "INVALID_STATE");
});

test("repeated approval is idempotent and does not create a duplicate audit event", async () => {
  const { prisma, operations } = mockPrisma("APPROVED");
  const result = await approveFundedAccount(prisma, { id: "funded-1", performedBy: "admin-1" });

  assert.deepEqual(operations, ["funded-lock", "funded-read"]);
  assert.equal(result.success, true);
});
