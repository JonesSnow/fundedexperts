import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { NextRequest } from "next/server";
import { createSession } from "../lib/auth/session";

let actor: { id: string; role: string; status: string } | null = { id: "admin-1", role: "ADMIN", status: "ACTIVE" };
let auditRows: Array<Record<string, unknown>> = [];
let lastAuditQuery: unknown;
let auditQueryCount = 0;
let actorQueryCount = 0;
let throwAuditQuery: Error | null = null;

const fakePrisma = {
  trader: {
    findUnique: async () => {
      actorQueryCount += 1;
      return actor;
    },
  },
  auditLog: {
    findMany: async (args: unknown) => {
      auditQueryCount += 1;
      lastAuditQuery = args;
      if (throwAuditQuery) throw throwAuditQuery;
      return auditRows;
    },
  },
};

const previousPrisma = Reflect.get(globalThis, "__fundedExpertsPrisma");
Reflect.set(globalThis, "__fundedExpertsPrisma", fakePrisma);

let getAuditLogs: ((request: NextRequest) => Promise<Response>) | undefined;
let adminCookie = "";

before(async () => {
  getAuditLogs = (await import("../app/api/admin/audit-logs/route")).GET;
  adminCookie = `session=${await createSession("admin-1", "ADMIN", true)}`;
});

after(() => {
  if (previousPrisma === undefined) Reflect.deleteProperty(globalThis, "__fundedExpertsPrisma");
  else Reflect.set(globalThis, "__fundedExpertsPrisma", previousPrisma);
});

function request(path: string, cookie?: string) {
  return new NextRequest(`https://fundedexperts.test${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

async function callRoute(path: string, cookie?: string) {
  if (!getAuditLogs) throw new Error("Audit logs route was not initialized");
  return getAuditLogs(request(path, cookie));
}

test("audit log API rejects requests without a session before database access", async () => {
  actorQueryCount = 0;
  auditQueryCount = 0;
  const response = await callRoute("/api/admin/audit-logs");
  assert.equal(response.status, 401);
  assert.equal(actorQueryCount, 0);
  assert.equal(auditQueryCount, 0);
});

test("audit log API rejects non-admin and inactive actors", async () => {
  actor = { id: "trader-1", role: "TRADER", status: "ACTIVE" };
  const nonAdmin = await callRoute("/api/admin/audit-logs", adminCookie);
  assert.equal(nonAdmin.status, 403);

  actor = { id: "admin-1", role: "ADMIN", status: "SUSPENDED" };
  const suspendedAdmin = await callRoute("/api/admin/audit-logs", adminCookie);
  assert.equal(suspendedAdmin.status, 403);

  actor = { id: "admin-1", role: "ADMIN", status: "ACTIVE" };
});

test("audit log API returns bounded event metadata and excludes sensitive detail payloads", async () => {
  const timestamp = new Date("2026-10-15T12:00:00.000Z");
  auditRows = [
    { id: "event-2", action: "PRODUCT_UPDATED", entityType: "Product", entityId: "product-2", performedBy: "admin-1", timestamp, details: { token: "private-value" } },
    { id: "event-1", action: "RULESET_PUBLISHED", entityType: "Ruleset", entityId: "ruleset-1", performedBy: null, timestamp, details: { email: "private@example.invalid" } },
  ];
  const response = await callRoute("/api/admin/audit-logs?limit=1", adminCookie);
  const body: unknown = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    events: [{
      id: "event-2",
      action: "PRODUCT_UPDATED",
      entityType: "Product",
      entityId: "product-2",
      performedBy: "admin-1",
      timestamp: timestamp.toISOString(),
    }],
    nextCursor: "event-2",
  });
  assert.equal(JSON.stringify(body).includes("private-value"), false);
  assert.equal(JSON.stringify(body).includes("private@example.invalid"), false);
  const query = lastAuditQuery as { take?: number; select?: Record<string, boolean>; orderBy?: unknown };
  assert.equal(query.take, 2);
  assert.equal(query.select?.details, undefined);
  assert.equal(query.select?.id, true);
  assert.ok(query.orderBy);
});

test("audit log API validates page bounds and forwards a cursor safely", async () => {
  const invalid = await callRoute("/api/admin/audit-logs?limit=500", adminCookie);
  assert.equal(invalid.status, 400);

  auditRows = [{ id: "older", action: "ACCOUNT_UPDATED", entityType: "MT5Account", entityId: "account-1", performedBy: "admin-1", timestamp: new Date("2026-10-14T12:00:00.000Z") }];
  const paged = await callRoute("/api/admin/audit-logs?before=event-2", adminCookie);
  const body = await paged.json() as { events?: unknown[]; nextCursor?: string | null };
  assert.equal(paged.status, 200);
  assert.deepEqual(body.events?.length, 1);
  assert.equal(body.nextCursor, null);
  const query = lastAuditQuery as { cursor?: { id: string }; skip?: number };
  assert.deepEqual(query.cursor, { id: "event-2" });
  assert.equal(query.skip, 1);
});

test("audit log API returns a generic unavailable response when the database query fails", async () => {
  throwAuditQuery = new Error("private connection string");
  const response = await callRoute("/api/admin/audit-logs", adminCookie);
  const body = await response.json();
  throwAuditQuery = null;

  assert.equal(response.status, 503);
  assert.deepEqual(body, { success: false, error: "Audit history is temporarily unavailable." });
  assert.equal(JSON.stringify(body).includes("private connection string"), false);
});
