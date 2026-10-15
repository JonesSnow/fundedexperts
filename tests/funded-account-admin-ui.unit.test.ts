import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchingFundedInventory, type FundedInventoryCandidate } from "../lib/funded-account-admin";

const inventory: FundedInventoryCandidate[] = [
  { id: "matching", accountNumber: "123456", accountSize: "50000.00", currency: "USD", purpose: "FUNDED", status: "AVAILABLE" },
  { id: "wrong-size", accountNumber: "123457", accountSize: "25000", currency: "USD", purpose: "FUNDED", status: "AVAILABLE" },
  { id: "wrong-purpose", accountNumber: "123458", accountSize: "50000", currency: "USD", purpose: "EVALUATION", status: "AVAILABLE" },
  { id: "reserved", accountNumber: "123459", accountSize: "50000", currency: "USD", purpose: "FUNDED", status: "IN_USE" },
  { id: "wrong-currency", accountNumber: "123460", accountSize: "50000", currency: "EUR", purpose: "FUNDED", status: "AVAILABLE" },
];

test("funded-assignment candidates require exact positive size and currency, FUNDED purpose, and AVAILABLE state", () => {
  assert.deepEqual(matchingFundedInventory("50000", "USD", inventory).map((account) => account.id), ["matching"]);
  assert.deepEqual(matchingFundedInventory("50000.000", "USD", inventory).map((account) => account.id), ["matching"]);
  assert.deepEqual(matchingFundedInventory("50000", "EUR", inventory).map((account) => account.id), ["wrong-currency"]);
  assert.deepEqual(matchingFundedInventory("25000.01", "USD", inventory), []);
  assert.deepEqual(matchingFundedInventory(0, "USD", inventory), []);
  assert.deepEqual(matchingFundedInventory("not-a-number", "USD", inventory), []);
  assert.deepEqual(matchingFundedInventory("50000", null, inventory), []);
});

test("admin funded-account API projection exposes only the size, currency, and status fields needed for honest assignment UI", () => {
  const route = readFileSync(new URL("../app/api/funded-accounts/route.ts", import.meta.url), "utf8");
  assert.match(route, /take:\s*100/);
  assert.match(route, /getEvaluationDenominationCurrency\(evaluation\.order\?\.orderItems,\s*evaluation\.productId\)/);
  assert.match(route, /startingBalance:\s*evaluation\.startingBalance/);
  assert.match(route, /account:\s*\{\s*select:\s*\{[^}]*accountSize:\s*true,\s*currency:\s*true,\s*purpose:\s*true\s*\}\s*\}/);
});

test("admin interface calls the existing approval, inventory, link, and transition endpoints", () => {
  const page = readFileSync(new URL("../app/admin/funded-accounts/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\/api\/funded-accounts/);
  assert.match(page, /\/api\/admin\/mt5-accounts/);
  assert.match(page, /\/approve/);
  assert.match(page, /\/link-account/);
  assert.match(page, /\/transition/);
  assert.match(page, /No available FUNDED account matches the required size and currency/);
  assert.match(page, /size and currency match the passed evaluation/);
  assert.match(page, /Approval is unavailable because this record does not show a passed evaluation/);
});
