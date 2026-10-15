import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateMt5AccountStatusChange } from "../lib/mt5-account-status-policy";

test("admin account status route never permits AVAILABLE with an active assignment", () => {
  const route = readFileSync(
    new URL("../app/api/accounts/[id]/status/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /const activeAssignment = await tx\.accountAssignment\.findFirst/);
  assert.match(route, /evaluateMt5AccountStatusChange\([\s\S]*?Boolean\(activeAssignment\)/);
  assert.doesNotMatch(route, /adminOverride/);
  assert.match(route, /prisma\.\$transaction\(async \(tx\) => \{[\s\S]*?FOR UPDATE[\s\S]*?tx\.accountAssignment\.findFirst/);
  assert.match(route, /tx\.mT5Account\.updateMany\(\{[\s\S]*?where: \{ id, status: account\.status \}/);
  assert.doesNotMatch(route, /prisma\.mT5Account\.update\(/);
  assert.ok(route.indexOf("const activeAssignment = await tx.accountAssignment.findFirst") < route.indexOf("if (newStatus === account.status)"));
});

test("all admin status mutation routes serialize on the inventory row and audit inside the transaction", () => {
  const route = readFileSync(
    new URL("../app/api/admin/mt5-accounts/[id]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /if \(status !== undefined\) \{[\s\S]*?prisma\.\$transaction\(async \(tx\) => \{[\s\S]*?FOR UPDATE/);
  assert.match(route, /FOR UPDATE[\s\S]*?tx\.accountAssignment\.findFirst[\s\S]*?evaluateMt5AccountStatusChange/);
  assert.match(route, /tx\.mT5Account\.updateMany\([\s\S]*?where: \{ id, status: current\.status \}/);
  assert.match(route, /tx\.auditLog\.create/);
  const statusBranch = route.slice(
    route.indexOf("if (status !== undefined) {"),
    route.indexOf("} else {", route.indexOf("if (status !== undefined) {")),
  );
  assert.doesNotMatch(statusBranch, /prisma\.mT5Account\.update\(/);
});

test("account creation cannot create an IN_USE account without an assignment", () => {
  const route = readFileSync(new URL("../app/api/accounts/route.ts", import.meta.url), "utf8");

  const inUseCheck = route.indexOf('else if (body.status === "IN_USE")');
  const createWrite = route.indexOf("tx.mT5Account.create");
  assert.notEqual(inUseCheck, -1);
  assert.ok(createWrite > inUseCheck);
  assert.match(route.slice(inUseCheck, createWrite), /errors\.status\s*=/);
});

test("account inventory creation and its audit entry share one transaction", () => {
  const route = readFileSync(new URL("../app/api/accounts/route.ts", import.meta.url), "utf8");
  const transactionStart = route.indexOf("const account = await prisma.$transaction(async (tx) => {");
  const responseStart = route.indexOf("return NextResponse.json(", transactionStart);
  const transactionBlock = route.slice(transactionStart, responseStart);

  assert.notEqual(transactionStart, -1);
  assert.match(transactionBlock, /tx\.mT5Account\.create/);
  assert.match(transactionBlock, /tx\.auditLog\.create/);
  assert.doesNotMatch(transactionBlock, /\bprisma\.(?:mT5Account|auditLog)\./);
});

test("reconciliation revalidates inventory state and assignments under the account row lock", () => {
  const reconciliation = readFileSync(new URL("../lib/reconciliation.ts", import.meta.url), "utf8");
  const repairStart = reconciliation.indexOf('if (account.status === "AVAILABLE" && activeAssignments.length > 0)');
  const repairEnd = reconciliation.indexOf('if (activeAssignments.length > 1)', repairStart);
  const repairBranch = reconciliation.slice(repairStart, repairEnd);

  assert.notEqual(repairStart, -1);
  assert.match(repairBranch, /prisma\.\$transaction\(async \(tx\) => \{[\s\S]*?FOR UPDATE/);
  assert.match(repairBranch, /current\.status !== "AVAILABLE"/);
  assert.match(repairBranch, /tx\.accountAssignment\.findMany[\s\S]*?activeAssignments\.length === 0/);
  assert.match(repairBranch, /tx\.mT5Account\.updateMany\([\s\S]*?status: "AVAILABLE"/);
  assert.match(repairBranch, /tx\.auditLog\.create/);
  assert.doesNotMatch(repairBranch, /tx\.mT5Account\.update\(/);
});

test("account status policy rejects assignment-inconsistent transitions and preserves the existing state machine", () => {
  assert.deepEqual(evaluateMt5AccountStatusChange("AVAILABLE", "IN_USE", false), {
    kind: "assignment-conflict",
    message: "Cannot set IN_USE: no active assignment exists",
  });
  assert.deepEqual(evaluateMt5AccountStatusChange("IN_USE", "AVAILABLE", true), {
    kind: "assignment-conflict",
    message: "Cannot set AVAILABLE: an active assignment exists.",
  });
  assert.deepEqual(evaluateMt5AccountStatusChange("AVAILABLE", "AVAILABLE", false), { kind: "allowed" });
  assert.deepEqual(evaluateMt5AccountStatusChange("AVAILABLE", "INACTIVE", false), { kind: "allowed" });
  assert.deepEqual(evaluateMt5AccountStatusChange("INACTIVE", "IN_USE", false), {
    kind: "assignment-conflict",
    message: "Cannot set IN_USE: no active assignment exists",
  });
  assert.deepEqual(evaluateMt5AccountStatusChange("INACTIVE", "IN_USE", true), {
    kind: "invalid-transition",
    from: "INACTIVE",
  });
});
