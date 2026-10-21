import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CUSTOMER_EVALUATION_ACCOUNT_SELECT } from "../lib/evaluation-account-select";

const startRoute = readFileSync(
  new URL("../app/api/evaluations/[id]/start/route.ts", import.meta.url),
  "utf8",
);

test("evaluation start selects only the customer-safe account fields", () => {
  assert.deepEqual(Object.keys(CUSTOMER_EVALUATION_ACCOUNT_SELECT).sort(), [
    "accountNumber",
    "accountSize",
    "broker",
    "currency",
    "healthStatus",
    "id",
    "login",
    "purpose",
    "server",
    "status",
  ]);
  assert.equal("credentials" in CUSTOMER_EVALUATION_ACCOUNT_SELECT, false);
  assert.equal("notes" in CUSTOMER_EVALUATION_ACCOUNT_SELECT, false);
  assert.match(
    startRoute,
    /account:\s*\{\s*select:\s*CUSTOMER_EVALUATION_ACCOUNT_SELECT\s*\}/,
  );
  assert.doesNotMatch(startRoute, /account:\s*true/);
});
