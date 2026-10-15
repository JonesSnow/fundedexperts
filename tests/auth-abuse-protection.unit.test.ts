import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const forgotPasswordRoute = readFileSync(
  new URL("../app/api/auth/forgot-password/route.ts", import.meta.url),
  "utf8",
);
const ordersRoute = readFileSync(
  new URL("../app/api/orders/route.ts", import.meta.url),
  "utf8",
);

test("forgot-password limits requests without resetting the account counter", () => {
  const rateLimitCheck = forgotPasswordRoute.indexOf("checkRateLimit(`forgot-password:${email}`)");
  const databaseLookup = forgotPasswordRoute.indexOf("prisma.trader.findUnique");

  assert.notEqual(rateLimitCheck, -1);
  assert.ok(databaseLookup > rateLimitCheck);
  assert.doesNotMatch(forgotPasswordRoute, /resetRateLimit/);
  assert.match(forgotPasswordRoute, /const cooldown = checkCooldown\(`forgot-password-request:\$\{email\}`/);
});

test("order idempotency conflicts cannot reveal another trader's order", () => {
  const ownerCheck = ordersRoute.indexOf("if (existing.traderId !== trader.id)");
  const duplicateResponse = ordersRoute.indexOf("order: existing", ownerCheck);

  assert.notEqual(ownerCheck, -1);
  assert.ok(duplicateResponse > ownerCheck);
  assert.match(
    ordersRoute.slice(ownerCheck, duplicateResponse),
    /status:\s*409/,
  );
});
