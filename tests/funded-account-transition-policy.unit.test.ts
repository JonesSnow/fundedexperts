import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { transitionFundedAccountStatus } from "../lib/funded-account";
import { isValidFundedAccountTransition } from "../lib/funded-account-transition-policy";

test("funded activation requires the inventory-link workflow", () => {
  assert.equal(isValidFundedAccountTransition("APPROVED", "ACTIVE"), false);
  assert.equal(isValidFundedAccountTransition("ACTIVE", "SUSPENDED"), true);
  assert.equal(isValidFundedAccountTransition("SUSPENDED", "ACTIVE"), true);
  assert.equal(isValidFundedAccountTransition("COMPLETED", "ACTIVE"), false);
  assert.equal(isValidFundedAccountTransition("TERMINATED", "ACTIVE"), false);
});

test("transition API distinguishes invalid states, integrity conflicts, and internal failures", () => {
  const routeSource = readFileSync(new URL("../app/api/funded-accounts/[id]/transition/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /result\.errorCategory === "NOT_FOUND"[\s\S]*?\? 404/);
  assert.match(routeSource, /result\.errorCategory === "INVALID_TRANSITION"[\s\S]*?\? 400/);
  assert.match(routeSource, /result\.errorCategory === "TERMS_REVIEW_REQUIRED"[\s\S]*?\? 409/);
  assert.match(routeSource, /:\s*500;/);
});

test("admin status transition rejects APPROVED to ACTIVE without any database writes", async () => {
  let transactionStarted = false;
  const tx = {
    $queryRaw: async () => [{ id: "funded-1" }],
    fundedAccount: { findUnique: async () => ({ id: "funded-1", status: "APPROVED" }) },
  };
  const mockPrisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactionStarted = true;
      return callback(tx);
    },
  } as unknown as PrismaClient;

  const result = await transitionFundedAccountStatus(mockPrisma, {
    id: "funded-1",
    status: "ACTIVE",
    performedBy: "admin-1",
  });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.errorCategory, "INVALID_TRANSITION");
  assert.equal(transactionStarted, true);
});

test("suspension and termination require a documented reason before database access", async () => {
  let transactionStarted = false;
  const mockPrisma = {
    $transaction: async () => {
      transactionStarted = true;
      throw new Error("A reasonless status change must not reach the database");
    },
  } as unknown as PrismaClient;

  for (const status of ["SUSPENDED", "TERMINATED"] as const) {
    const result = await transitionFundedAccountStatus(mockPrisma, {
      id: "funded-1",
      status,
      reason: "  ",
      performedBy: "admin-1",
    });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.errorCategory, "REASON_REQUIRED");
  }
  assert.equal(transactionStarted, false);
});

async function runReactivation(credentialsConfigured: boolean) {
  const operations: string[] = [];
  const fundedAccount = {
    id: "funded-1",
    traderId: "trader-1",
    status: "SUSPENDED",
    accountId: "mt5-funded-1",
    evaluationId: "evaluation-1",
    rulesetVersionId: "ruleset-1",
    activatedAt: new Date("2026-01-01T00:00:00Z"),
    allocatedAt: new Date("2026-01-01T00:00:00Z"),
    trader: null,
    account: { id: "mt5-funded-1", status: "IN_USE", purpose: "FUNDED", accountSize: "50000.00", currency: "USD" },
    evaluation: { id: "evaluation-1", productId: "product-1", status: "PASSED", traderId: "trader-1", startingBalance: "50000.00", order: { orderItems: [{ productId: "product-1", productSnapshot: { productId: "product-1", denominationCurrency: "USD" } }] } },
  };
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const table = strings[0].includes('"FundedAccount"') ? "funded-lock" : "inventory-lock";
      operations.push(table);
      return table === "inventory-lock" ? [{ id: values[0], credentialsConfigured }] : [{ id: values[0] }];
    },
    fundedAccount: {
      findUnique: async ({ include }: { include?: unknown }) => include ? fundedAccount : { ...fundedAccount },
      findFirst: async () => {
        operations.push("other-funded-link-check");
        return null;
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(data.status, "ACTIVE");
        fundedAccount.status = "ACTIVE";
        operations.push("funded-reactivate");
        return { count: 1 };
      },
    },
    mT5Account: {
      findUnique: async () => {
        operations.push("inventory-read");
        return { id: "mt5-funded-1", status: "IN_USE", purpose: "FUNDED", accountSize: "50000", currency: "USD" };
      },
    },
    accountAssignment: {
      findMany: async () => {
        operations.push("assignment-read");
        return [{ traderId: "trader-1" }];
      },
    },
    auditLog: {
      create: async () => {
        operations.push("audit-create");
        return {};
      },
    },
  };
  const mockPrisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaClient;

  const result = await transitionFundedAccountStatus(mockPrisma, {
    id: "funded-1",
    status: "ACTIVE",
    performedBy: "admin-1",
  });

  return { result, operations };
}

test("reactivation requires the original matching account and assignment to remain intact", async () => {
  const { result, operations } = await runReactivation(true);

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.account.status, "ACTIVE");
  assert.deepEqual(operations, [
    "funded-lock",
    "inventory-lock",
    "inventory-read",
    "assignment-read",
    "other-funded-link-check",
    "funded-reactivate",
    "audit-create",
  ]);
});

test("funded-account reactivation is rejected when encrypted credentials are missing", async () => {
  const { result, operations } = await runReactivation(false);

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.errorCategory, "TERMS_REVIEW_REQUIRED");
  assert.deepEqual(operations, ["funded-lock", "inventory-lock", "inventory-read", "assignment-read", "other-funded-link-check"]);
});

test("terminal funded-account transitions revoke the assignment and deactivate its inventory atomically", async () => {
  const operations: string[] = [];
  const fundedAccount = {
    id: "funded-1",
    traderId: "trader-1",
    status: "ACTIVE",
    accountId: "mt5-funded-1",
    evaluationId: "evaluation-1",
    rulesetVersionId: "ruleset-1",
    activatedAt: new Date("2026-01-01T00:00:00Z"),
    allocatedAt: new Date("2026-01-01T00:00:00Z"),
    trader: null,
    account: { id: "mt5-funded-1", status: "IN_USE", purpose: "FUNDED", accountSize: "50000.00", currency: "USD" },
    evaluation: { id: "evaluation-1", productId: "product-1", status: "PASSED", traderId: "trader-1", startingBalance: "50000.00", order: { orderItems: [{ productId: "product-1", productSnapshot: { productId: "product-1", denominationCurrency: "USD" } }] } },
  };
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      operations.push(strings[0].includes('"FundedAccount"') ? "funded-lock" : "inventory-lock");
      return [{ id: values[0] }];
    },
    fundedAccount: {
      findUnique: async ({ include }: { include?: unknown }) => include ? fundedAccount : { ...fundedAccount },
      findFirst: async () => {
        operations.push("other-funded-link-check");
        return null;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        assert.equal(where.status, "ACTIVE");
        assert.equal(where.accountId, "mt5-funded-1");
        assert.equal(data.status, "TERMINATED");
        fundedAccount.status = "TERMINATED";
        operations.push("funded-terminate");
        return { count: 1 };
      },
    },
    mT5Account: {
      findUnique: async () => {
        operations.push("inventory-read");
        return { id: "mt5-funded-1", status: "IN_USE", purpose: "FUNDED" };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        assert.equal(where.status, "IN_USE");
        assert.equal(data.status, "INACTIVE");
        operations.push("inventory-deactivate");
        return { count: 1 };
      },
    },
    accountAssignment: {
      findMany: async () => {
        operations.push("assignment-read");
        return [{ id: "assignment-1", traderId: "trader-1" }];
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        assert.equal(where.id, "assignment-1");
        assert.equal(where.status, "ASSIGNED");
        assert.equal(data.status, "REVOKED");
        assert.ok(data.revokedAt instanceof Date);
        operations.push("assignment-revoke");
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }: { data: { details: { statusChange?: { from?: string; to?: string }; inventoryRelease?: { assignmentStatus?: { to?: string }; accountStatus?: { to?: string } } } } }) => {
        assert.deepEqual(data.details.statusChange, { from: "ACTIVE", to: "TERMINATED" });
        assert.equal(data.details.inventoryRelease?.assignmentStatus?.to, "REVOKED");
        assert.equal(data.details.inventoryRelease?.accountStatus?.to, "INACTIVE");
        operations.push("audit-create");
        return {};
      },
    },
  };
  const mockPrisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaClient;

  const result = await transitionFundedAccountStatus(mockPrisma, {
    id: "funded-1",
    status: "TERMINATED",
    reason: "Compliance decision",
    performedBy: "admin-1",
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.account.status, "TERMINATED");
  assert.deepEqual(operations, [
    "funded-lock",
    "inventory-lock",
    "inventory-read",
    "assignment-read",
    "other-funded-link-check",
    "assignment-revoke",
    "inventory-deactivate",
    "funded-terminate",
    "audit-create",
  ]);
});
