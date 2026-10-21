import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { NextRequest } from "next/server";
import { createSession } from "../lib/auth/session";
import { encodeCreatedAtCursor } from "../lib/cursor-pagination";

type FindUniqueArgs = { where: Record<string, unknown> };

let historyQueryCount = 0;
let customerLookupCount = 0;
let historyQueryArgs: Array<Record<string, unknown>> = [];
let orderRows: unknown[] = [];
let evaluationRows: unknown[] = [];
let fundedAccountRows: unknown[] = [];
let assignmentRows: unknown[] = [];
const admin = { id: "admin-test-id", role: "ADMIN", status: "ACTIVE", email: "admin@example.invalid", firstName: "Admin", lastName: null };
const pendingAdmin = { ...admin, id: "pending-admin-test-id", status: "PENDING" };
const customer = {
  id: "customer-test-id",
  email: "trader@example.invalid",
  role: "TRADER",
  firstName: "Test",
  lastName: "Trader",
  status: "ACTIVE",
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
};

const fakePrisma = {
  trader: {
    findUnique: async ({ where }: FindUniqueArgs) => {
      if (where.id === admin.id) return admin;
      if (where.id === pendingAdmin.id) return pendingAdmin;
      if (where.id === customer.id || where.email === customer.email) {
        customerLookupCount += 1;
        return customer;
      }
      return null;
    },
  },
  order: { findMany: async (args: unknown) => { historyQueryCount += 1; historyQueryArgs.push(args as Record<string, unknown>); return orderRows; } },
  evaluation: { findMany: async (args: unknown) => { historyQueryCount += 1; historyQueryArgs.push(args as Record<string, unknown>); return evaluationRows; } },
  fundedAccount: { findMany: async (args: unknown) => { historyQueryCount += 1; historyQueryArgs.push(args as Record<string, unknown>); return fundedAccountRows; } },
  accountAssignment: { findMany: async (args: unknown) => { historyQueryCount += 1; historyQueryArgs.push(args as Record<string, unknown>); return assignmentRows; } },
};

const previousPrisma = Reflect.get(globalThis, "__fundedExpertsPrisma");
Reflect.set(globalThis, "__fundedExpertsPrisma", fakePrisma);

const adminPage = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const customerLifecyclePage = readFileSync(new URL("../app/admin/customers/[id]/page.tsx", import.meta.url), "utf8");
const notificationsPage = readFileSync(new URL("../app/admin/notifications/page.tsx", import.meta.url), "utf8");

let getLifecycle: ((request: NextRequest) => Promise<Response>) | undefined;
let adminCookie = "";
let pendingAdminCookie = "";

before(async () => {
  getLifecycle = (await import("../app/api/admin/lifecycle/route")).GET;
  adminCookie = `session=${await createSession(admin.id, admin.role, true)}`;
  pendingAdminCookie = `session=${await createSession(pendingAdmin.id, pendingAdmin.role, true)}`;
});

after(() => {
  if (previousPrisma === undefined) Reflect.deleteProperty(globalThis, "__fundedExpertsPrisma");
  else Reflect.set(globalThis, "__fundedExpertsPrisma", previousPrisma);
});

function request(path: string, cookie = adminCookie) {
  return new NextRequest(`https://fundedexperts.test${path}`, {
    headers: { cookie },
  });
}

test("pending admins cannot access customer lifecycle data", async () => {
  if (!getLifecycle) throw new Error("Lifecycle route was not initialized");
  historyQueryCount = 0;
  customerLookupCount = 0;

  const response = await getLifecycle(
    request(`/api/admin/lifecycle?email=${encodeURIComponent(customer.email)}`, pendingAdminCookie),
  );

  assert.equal(response.status, 403);
  assert.equal(historyQueryCount, 0);
  assert.equal(customerLookupCount, 0);
});

test("identity-only lifecycle lookup skips all history and relation queries", async () => {
  if (!getLifecycle) throw new Error("Lifecycle route was not initialized");
  historyQueryCount = 0;

  const response = await getLifecycle(request(`/api/admin/lifecycle?email=${encodeURIComponent(customer.email)}&identityOnly=true`));
  const body = await response.json() as { success: boolean; customer?: { id: string; email: string }; orders?: unknown[] };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.customer, { ...customer, createdAt: customer.createdAt.toISOString() });
  assert.equal(body.orders, undefined);
  assert.equal(historyQueryCount, 0);
});

test("default lifecycle lookup keeps the existing history response", async () => {
  if (!getLifecycle) throw new Error("Lifecycle route was not initialized");
  historyQueryCount = 0;
  historyQueryArgs = [];
  const startedAt = new Date("2026-10-02T12:00:00.000Z");
  orderRows = [{
    id: "order-1",
    orderNumber: "ORD-1",
    status: "PENDING_PAYMENT",
    currency: "USD",
    subtotal: "100.00",
    taxAmount: "0.00",
    totalAmount: "100.00",
    createdAt: startedAt,
    orderItems: [{ product: { name: "Pro" } }],
  }];
  evaluationRows = [{
    id: "evaluation-1",
    status: "IN_PROGRESS",
    startedAt,
    completedAt: null,
    totalPnl: "10.25",
    maxDrawdown: "2.00",
    rulesetVersion: { version: "v2", ruleset: { name: "Pro rules" } },
    account: { accountNumber: "70001", broker: "Demo broker", server: "Demo server", status: "IN_USE", healthStatus: "CONNECTED" },
    ruleEvaluations: [{ result: "PASS", rule: { ruleType: "DAILY_DRAWDOWN", name: "Daily loss" } }],
  }];
  fundedAccountRows = [{ id: "funded-1", status: "APPROVED", allocatedAt: startedAt, activatedAt: null, closedAt: null, createdAt: startedAt }];
  assignmentRows = [{
    id: "assignment-1",
    assignedAt: startedAt,
    account: { id: "account-1", accountNumber: "70001", broker: "Demo broker", server: "Demo server", status: "IN_USE", healthStatus: "CONNECTED" },
  }];

  const response = await getLifecycle(request(`/api/admin/lifecycle?customerId=${encodeURIComponent(customer.id)}`));
  const body = await response.json() as {
    success: boolean;
    orders?: Array<Record<string, unknown>>;
    evaluations?: Array<Record<string, unknown>>;
    fundedAccounts?: unknown[];
    assignments?: unknown[];
    nextCursors?: Record<string, string | null>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  const firstOrderItem = (body.orders?.[0]?.orderItems as Array<{ product: { name: string } | null }> | undefined)?.[0];
  assert.equal(firstOrderItem?.product?.name, "Pro");
  assert.deepEqual(body.evaluations?.[0], {
    id: "evaluation-1",
    status: "IN_PROGRESS",
    startedAt: startedAt.toISOString(),
    completedAt: null,
    totalPnl: "10.25",
    maxDrawdown: "2.00",
    rulesetName: "Pro rules",
    rulesetVersion: "v2",
    account: { accountNumber: "70001", broker: "Demo broker", server: "Demo server", status: "IN_USE", healthStatus: "CONNECTED" },
    ruleResults: [{ ruleName: "Daily loss", result: "PASS" }],
  });
  assert.equal(body.fundedAccounts?.length, 1);
  assert.equal(body.assignments?.length, 1);
  assert.deepEqual(body.nextCursors, { orders: null, evaluations: null, fundedAccounts: null, assignments: null });
  assert.equal(historyQueryArgs.every((args) => args.take === 51), true);
  assert.equal(JSON.stringify(body).includes("ruleEvaluations"), false);
  assert.equal(JSON.stringify(body).includes("login"), false);
  const assignmentsQuery = historyQueryArgs[3] as { select: { account: { select: Record<string, boolean> } } };
  assert.equal(assignmentsQuery.select.account.select.login, undefined);
  assert.equal(historyQueryCount, 4);
});

test("lifecycle history pages are bounded, stable, and query only the requested section", async () => {
  if (!getLifecycle) throw new Error("Lifecycle route was not initialized");
  historyQueryCount = 0;
  historyQueryArgs = [];
  const olderDate = new Date("2026-09-30T12:00:00.000Z");
  const cursor = encodeCreatedAtCursor({ id: "123e4567-e89b-12d3-a456-426614174000", createdAt: olderDate });
  orderRows = [
    { id: "123e4567-e89b-12d3-a456-426614174001", orderNumber: "ORD-2", status: "PAID", currency: "USD", subtotal: "100.00", taxAmount: "0.00", totalAmount: "100.00", createdAt: new Date("2026-10-02T12:00:00.000Z"), orderItems: [] },
    { id: "123e4567-e89b-12d3-a456-426614174002", orderNumber: "ORD-1", status: "PAID", currency: "USD", subtotal: "100.00", taxAmount: "0.00", totalAmount: "100.00", createdAt: new Date("2026-10-01T12:00:00.000Z"), orderItems: [] },
  ];

  const response = await getLifecycle(request(`/api/admin/lifecycle?customerId=${customer.id}&section=orders&limit=1&before=${encodeURIComponent(cursor)}`));
  const body = await response.json() as { success: boolean; orders?: Array<{ id: string }>; nextCursors?: Record<string, string | null> };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.orders?.length, 1);
  assert.equal(body.nextCursors?.orders, encodeCreatedAtCursor({ id: "123e4567-e89b-12d3-a456-426614174001", createdAt: new Date("2026-10-02T12:00:00.000Z") }));
  assert.deepEqual(body.nextCursors, { orders: body.nextCursors?.orders, evaluations: null, fundedAccounts: null, assignments: null });
  assert.equal(historyQueryCount, 1);
  assert.equal(historyQueryArgs[0]?.take, 2);
  assert.deepEqual(historyQueryArgs[0]?.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal(JSON.stringify(historyQueryArgs[0]?.where).includes("123e4567-e89b-12d3-a456-426614174000"), true);

  historyQueryCount = 0;
  const invalid = await getLifecycle(request(`/api/admin/lifecycle?customerId=${customer.id}&section=orders&before=invalid`));
  assert.equal(invalid.status, 400);
  assert.equal(historyQueryCount, 0);
});

test("identity search screens opt into the lightweight lookup", () => {
  assert.match(adminPage, /identityOnly=true/);
  assert.match(notificationsPage, /identityOnly=true/);
  assert.match(customerLifecyclePage, /Load older/);
  assert.match(customerLifecyclePage, /section,/);
});
