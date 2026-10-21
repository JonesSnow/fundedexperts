import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("registration does not reset public rate limits after account creation", () => {
  const route = readFileSync(
    new URL("../app/api/auth/register/route.ts", import.meta.url),
    "utf8",
  );
  const validationFailure = route.match(/if \(!validation\.valid\) \{([\s\S]*?)\n\s*\}/);
  const existingAccount = route.match(/if \(existing\) \{([\s\S]*?)\n\s*\}/);
  assert.ok(validationFailure);
  assert.ok(existingAccount);
  assert.doesNotMatch(validationFailure[1], /resetRateLimit/);
  assert.doesNotMatch(existingAccount[1], /resetRateLimit/);
  assert.doesNotMatch(route, /resetRateLimit/);
});
