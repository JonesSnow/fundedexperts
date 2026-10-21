import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createRoute = readFileSync(new URL("../app/api/admin/mt5-accounts/route.ts", import.meta.url), "utf8");
const updateRoute = readFileSync(new URL("../app/api/admin/mt5-accounts/[id]/route.ts", import.meta.url), "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("MT5 inventory creation and its durable audit record share one transaction", () => {
  const transaction = sourceBetween(
    createRoute,
    "const account = await prisma.$transaction(async (tx) => {",
    'logger.info("MT5_ACCOUNT", "Demo account created by admin"',
  );
  assert.ok(transaction.indexOf("tx.mT5Account.create") < transaction.indexOf("tx.auditLog.create"));
  assert.match(transaction, /action: "ACCOUNT_CREATED"/);
  assert.match(transaction, /performedBy: admin\.id/);
  assert.doesNotMatch(transaction.slice(transaction.indexOf("tx.auditLog.create")), /credentials\s*:/);
});

test("MT5 status, metadata, and credential updates persist an audit row atomically", () => {
  const statusTransaction = sourceBetween(
    updateRoute,
    "const transition = await prisma.$transaction(async (tx) => {",
    'if (transition.kind === "missing")',
  );
  const metadataTransaction = sourceBetween(
    updateRoute,
    "updated = await prisma.$transaction(async (tx) => {",
    'logger.info("MT5_ACCOUNT", "Demo account updated by admin"',
  );

  assert.ok(statusTransaction.indexOf("tx.mT5Account.updateMany") < statusTransaction.indexOf("tx.auditLog.create"));
  assert.match(statusTransaction, /credentialsChanged: credentials !== undefined/);
  assert.doesNotMatch(statusTransaction.slice(statusTransaction.indexOf("tx.auditLog.create")), /credentials\s*:/);

  assert.ok(metadataTransaction.indexOf("tx.mT5Account.update") < metadataTransaction.indexOf("tx.auditLog.create"));
  assert.match(metadataTransaction, /action: "ACCOUNT_UPDATED"/);
  assert.match(metadataTransaction, /credentialsChanged: credentials !== undefined/);
  assert.doesNotMatch(metadataTransaction.slice(metadataTransaction.indexOf("tx.auditLog.create")), /credentials\s*:/);
});
