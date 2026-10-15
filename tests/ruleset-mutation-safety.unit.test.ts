import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { NextRequest } from "next/server";
import { createSession } from "../lib/auth/session";

let actor: { id: string; role: string; status: string } | null = { id: "admin-1", role: "ADMIN", status: "ACTIVE" };
let initialStatus = "PUBLISHED";
let transactionStatus = "PUBLISHED";
let writes = 0;
let transactions = 0;

const fakeTransaction = {
  rulesetVersion: {
    findUnique: async () => ({ status: transactionStatus }),
    findFirst: async () => ({ id: "version-1", status: transactionStatus }),
  },
  rule: {
    create: async () => { writes += 1; throw new Error("A published rule was mutated"); },
    findFirst: async () => ({ id: "rule-1" }),
    update: async () => { writes += 1; throw new Error("A published rule was mutated"); },
    delete: async () => { writes += 1; throw new Error("A published rule was mutated"); },
  },
  auditLog: { create: async () => { writes += 1; } },
};

const fakePrisma = {
  trader: { findUnique: async () => actor },
  rulesetVersion: {
    findFirst: async () => ({ id: "version-1", status: initialStatus }),
  },
  $transaction: async (callback: (tx: typeof fakeTransaction) => Promise<unknown>) => {
    transactions += 1;
    return callback(fakeTransaction);
  },
};

const previousPrisma = Reflect.get(globalThis, "__fundedExpertsPrisma");
Reflect.set(globalThis, "__fundedExpertsPrisma", fakePrisma);

let addRule: ((request: NextRequest, context: { params: Promise<{ id: string; version: string }> }) => Promise<Response>) | undefined;
let updateRule: ((request: NextRequest, context: { params: Promise<{ id: string; version: string; ruleId: string }> }) => Promise<Response>) | undefined;
let deleteRule: ((request: NextRequest, context: { params: Promise<{ id: string; version: string; ruleId: string }> }) => Promise<Response>) | undefined;
let adminCookie = "";

before(async () => {
  addRule = (await import("../app/api/rulesets/[id]/versions/[version]/rules/route")).POST;
  const mutations = await import("../app/api/rulesets/[id]/versions/[version]/rules/[ruleId]/route");
  updateRule = mutations.PUT;
  deleteRule = mutations.DELETE;
  adminCookie = `session=${await createSession("admin-1", "ADMIN", true)}`;
});

after(() => {
  if (previousPrisma === undefined) Reflect.deleteProperty(globalThis, "__fundedExpertsPrisma");
  else Reflect.set(globalThis, "__fundedExpertsPrisma", previousPrisma);
});

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest("https://fundedexperts.test/api/rulesets/rules/version-1/rules", {
    method,
    headers: { cookie: adminCookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const addBody = { name: "Optional target", ruleType: "PROFIT_TARGET", disposition: "OPTIONAL" };
const updateBody = { name: "Updated target", ruleType: "PROFIT_TARGET", disposition: "OPTIONAL" };

test("published versions reject rule creation before opening a transaction", async () => {
  initialStatus = "PUBLISHED";
  transactions = 0;
  writes = 0;
  assert.ok(addRule);
  const response = await addRule(request("POST", addBody), { params: Promise.resolve({ id: "ruleset-1", version: "1.0" }) });
  assert.equal(response.status, 409);
  assert.equal(transactions, 0);
  assert.equal(writes, 0);
});

test("a concurrent publish between preflight and insert blocks rule creation in the transaction", async () => {
  initialStatus = "DRAFT";
  transactionStatus = "PUBLISHED";
  transactions = 0;
  writes = 0;
  assert.ok(addRule);
  const response = await addRule(request("POST", addBody), { params: Promise.resolve({ id: "ruleset-1", version: "1.0" }) });
  assert.equal(response.status, 409);
  assert.equal(transactions, 1);
  assert.equal(writes, 0);
  initialStatus = "PUBLISHED";
});

test("published versions reject rule updates and deletes without mutation", async () => {
  transactionStatus = "PUBLISHED";
  writes = 0;
  assert.ok(updateRule);
  assert.ok(deleteRule);
  const context = { params: Promise.resolve({ id: "ruleset-1", version: "1.0", ruleId: "rule-1" }) };
  const updateResponse = await updateRule(request("PUT", updateBody), context);
  const deleteResponse = await deleteRule(request("DELETE"), context);
  assert.equal(updateResponse.status, 409);
  assert.equal(deleteResponse.status, 409);
  assert.equal(writes, 0);
});
