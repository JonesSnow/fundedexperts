import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("registration only clears its rate limit after creating an account", () => {
  const route = readFileSync(
    new URL("../app/api/auth/register/route.ts", import.meta.url),
    "utf8",
  );
  const validationFailure = route.match(/if \(!validation\.valid\) \{([\s\S]*?)\n\s*\}/);
  const existingAccount = route.match(/if \(existing\) \{([\s\S]*?)\n\s*\}/);
  const accountCreated = route.indexOf("const trader = await prisma.trader.create");
  const successfulRateLimitReset = route.indexOf("resetRateLimit(`register:${email}`)");

  assert.ok(validationFailure);
  assert.ok(existingAccount);
  assert.doesNotMatch(validationFailure[1], /resetRateLimit/);
  assert.doesNotMatch(existingAccount[1], /resetRateLimit/);
  assert.ok(accountCreated >= 0);
  assert.ok(successfulRateLimitReset > accountCreated);
});
