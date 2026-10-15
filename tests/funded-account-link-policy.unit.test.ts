import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { linkAccount } from "../lib/funded-account";
import { evaluateFundedAccountLink, getEvaluationDenominationCurrency, type FundedAccountLinkState } from "../lib/funded-account-link-policy";

const validState: FundedAccountLinkState = {
  fundedStatus: "APPROVED",
  linkedAccountId: null,
  requestedAccountId: "mt5-funded-1",
  traderId: "trader-1",
  evaluationStatus: "PASSED",
  evaluationTraderId: "trader-1",
  expectedAccountSize: "50000.00",
  expectedAccountCurrency: "USD",
  accountStatus: "AVAILABLE",
  accountPurpose: "FUNDED",
  accountSize: "50000",
  accountCurrency: "USD",
  activeAssignmentTraderId: null,
  activeAssignmentCount: 0,
  linkedToAnotherFundedAccount: false,
};

test("approved passed evaluations can only receive matching available FUNDED accounts", () => {
  assert.deepEqual(evaluateFundedAccountLink(validState), { kind: "ready" });
  assert.equal(evaluateFundedAccountLink({ ...validState, accountPurpose: "EVALUATION" }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...validState, accountSize: "25000" }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...validState, accountSize: "0" }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...validState, accountCurrency: "EUR" }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...validState, expectedAccountCurrency: null }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...validState, accountStatus: "IN_USE" }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...validState, activeAssignmentTraderId: "trader-2" }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...validState, linkedToAnotherFundedAccount: true }).kind, "rejected");
});

test("evaluation currency is read only from one immutable purchased-product snapshot", () => {
  const item = { productId: "product-1", productSnapshot: { productId: "product-1", denominationCurrency: "USD" } };
  assert.equal(getEvaluationDenominationCurrency([item], "product-1"), "USD");
  assert.equal(getEvaluationDenominationCurrency([]), null);
  assert.equal(getEvaluationDenominationCurrency([{ ...item, productSnapshot: { productId: "product-1", denominationCurrency: "usd" } }]), null);
  assert.equal(getEvaluationDenominationCurrency([{ ...item, productSnapshot: { productId: "another-product", denominationCurrency: "USD" } }]), null);
  assert.equal(getEvaluationDenominationCurrency([item], "another-product"), null);
  assert.equal(getEvaluationDenominationCurrency([item, item]), null);
});

test("linking requires a passed evaluation owned by the funded-account trader", () => {
  assert.equal(evaluateFundedAccountLink({ ...validState, evaluationStatus: "IN_PROGRESS" }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...validState, evaluationTraderId: "another-trader" }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...validState, expectedAccountSize: null }).kind, "rejected");
});

test("same-account retries are idempotent only while inventory and assignment still agree", () => {
  const linked = {
    ...validState,
    fundedStatus: "ACTIVE",
    linkedAccountId: "mt5-funded-1",
    accountStatus: "IN_USE",
    activeAssignmentTraderId: "trader-1",
    activeAssignmentCount: 1,
  };
  assert.deepEqual(evaluateFundedAccountLink(linked), { kind: "already-linked" });
  assert.equal(evaluateFundedAccountLink({ ...linked, accountStatus: "AVAILABLE" }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...linked, activeAssignmentTraderId: null }).kind, "rejected");
  assert.equal(evaluateFundedAccountLink({ ...linked, activeAssignmentCount: 2 }).kind, "rejected");
});

test("funded account linking locks both records and commits inventory, assignment, status, and audit together", () => {
  const source = readFileSync(new URL("../lib/funded-account.ts", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../app/api/funded-accounts/[id]/link-account/route.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function linkAccount(");
  const end = source.indexOf("export async function transitionFundedAccountStatus(", start);
  const linkImplementation = source.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(linkImplementation, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(linkImplementation, /FROM "FundedAccount"[\s\S]*?FOR UPDATE/);
  assert.match(linkImplementation, /FROM "MT5Account"[\s\S]*?FOR UPDATE/);
  assert.match(linkImplementation, /tx\.mT5Account\.updateMany/);
  assert.match(linkImplementation, /tx\.accountAssignment\.create/);
  assert.match(linkImplementation, /tx\.fundedAccount\.updateMany/);
  assert.match(linkImplementation, /currency:\s*expectedAccountCurrency/);
  assert.match(linkImplementation, /tx\.auditLog\.create/);
  assert.match(routeSource, /result\.errorCategory === "LINK_FAILED"[\s\S]*?\? 500/);
});

test("linkAccount reserves matching inventory and writes its assignment, activation, and audit through the same mocked transaction", async () => {
  const operations: string[] = [];
  const fundedAccount = {
    id: "funded-1",
    traderId: "trader-1",
    status: "APPROVED",
    accountId: null as string | null,
    allocatedAt: null,
    activatedAt: null,
    trader: null,
    evaluation: {
      id: "evaluation-1",
      traderId: "trader-1",
      status: "PASSED",
      startingBalance: "50000.00",
      productId: "product-1",
      order: { orderItems: [{ productId: "product-1", productSnapshot: { productId: "product-1", denominationCurrency: "USD" } }] },
    },
  };
  const mt5Account = {
    id: "mt5-funded-1",
    accountNumber: 123456,
    accountSize: "50000.00",
    currency: "USD",
    purpose: "FUNDED",
    status: "AVAILABLE",
  };
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const table = strings[0].includes('"FundedAccount"') ? "funded-lock" : "inventory-lock";
      operations.push(table);
      return [{ id: values[0] }];
    },
    fundedAccount: {
      findUnique: async () => ({ ...fundedAccount }),
      findFirst: async () => null,
      updateMany: async () => {
        operations.push("funded-activate");
        fundedAccount.accountId = mt5Account.id;
        fundedAccount.status = "ACTIVE";
        return { count: 1 };
      },
    },
    mT5Account: {
      findUnique: async () => mt5Account,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        assert.equal(where.status, "AVAILABLE");
        assert.equal(where.purpose, "FUNDED");
        assert.equal(where.accountSize, fundedAccount.evaluation.startingBalance);
        assert.equal(where.currency, "USD");
        assert.equal(data.status, "IN_USE");
        operations.push("inventory-reserve");
        return { count: 1 };
      },
    },
    accountAssignment: {
      findMany: async () => [],
      create: async () => {
        operations.push("assignment-create");
        return { id: "assignment-1" };
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

  const result = await linkAccount(mockPrisma, {
    fundedAccountId: fundedAccount.id,
    accountId: mt5Account.id,
    performedBy: "admin-1",
  });

  assert.equal(result.success, true);
  assert.deepEqual(operations, [
    "funded-lock",
    "inventory-lock",
    "inventory-reserve",
    "assignment-create",
    "funded-activate",
    "audit-create",
  ]);
});
