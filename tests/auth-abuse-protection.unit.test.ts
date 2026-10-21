import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  checkAuthClientRateLimit,
  createBoundedRateLimitKey,
} from "../lib/auth/rate-limit";

const loginRoute = readFileSync(
  new URL("../app/api/auth/login/route.ts", import.meta.url),
  "utf8",
);
const registrationRoute = readFileSync(
  new URL("../app/api/auth/register/route.ts", import.meta.url),
  "utf8",
);

const forgotPasswordRoute = readFileSync(
  new URL("../app/api/auth/forgot-password/route.ts", import.meta.url),
  "utf8",
);
const ordersRoute = readFileSync(
  new URL("../app/api/orders/route.ts", import.meta.url),
  "utf8",
);
const authRoutePaths = [
  "../app/api/auth/register/route.ts",
  "../app/api/auth/login/route.ts",
  "../app/api/auth/forgot-password/route.ts",
  "../app/api/auth/verify-email/route.ts",
  "../app/api/auth/verify-email/confirm/route.ts",
  "../app/api/auth/reset-password/verify/route.ts",
  "../app/api/auth/reset-password/route.ts",
];
const sensitiveAuthRoutes = authRoutePaths.map((path) => ({
  path,
  source: readFileSync(new URL(path, import.meta.url), "utf8"),
}));

test("forgot-password limits requests without resetting the account counter", () => {
  const rateLimitCheck = forgotPasswordRoute.indexOf("checkRateLimit(`forgot-password:${email}`)");
  const databaseLookup = forgotPasswordRoute.indexOf("prisma.trader.findUnique");

  assert.notEqual(rateLimitCheck, -1);
  assert.ok(databaseLookup > rateLimitCheck);
  assert.doesNotMatch(forgotPasswordRoute, /resetRateLimit/);
  assert.match(forgotPasswordRoute, /const cooldown = checkCooldown\(`forgot-password-request:\$\{email\}`/);
});

test("oversized auth subjects use a bounded rate-limit key", () => {
  assert.equal(createBoundedRateLimitKey("login", "a".repeat(255)), `login:${"a".repeat(255)}`);
  assert.equal(createBoundedRateLimitKey("register", "a".repeat(100_000)), "register:oversized");
  assert.equal(createBoundedRateLimitKey("login", ""), "login:unknown");
});

test("login and registration use bounded keys before validating submitted email", () => {
  assert.match(loginRoute, /createBoundedRateLimitKey\("login", email\)/);
  assert.match(loginRoute, /resetRateLimit\(rateLimitKey\)/);
  assert.doesNotMatch(loginRoute, /checkRateLimit\(`login:/);
  assert.match(registrationRoute, /createBoundedRateLimitKey\("register", email\)/);
  assert.doesNotMatch(registrationRoute, /checkRateLimit\(`register:/);
});

test("auth routes apply a client limit before database access", () => {
  for (const { path, source } of sensitiveAuthRoutes) {
    const clientLimit = source.indexOf("checkAuthClientRateLimit(request");
    const databaseAccess = source.indexOf("prisma.");

    assert.notEqual(clientLimit, -1, `${path} should apply a client limit`);
    assert.ok(databaseAccess > clientLimit, `${path} should limit before database access`);
  }
});

test("auth client limit uses the trusted production IP and enforces its budget", () => {
  const scope = `auth-client-regression-${randomUUID()}`;
  const request = {
    headers: new Headers({ "x-vercel-forwarded-for": "198.51.100.41" }),
  };

  assert.equal(checkAuthClientRateLimit(request, scope, 2, "production").allowed, true);
  assert.equal(checkAuthClientRateLimit(request, scope, 2, "production").allowed, true);
  assert.equal(checkAuthClientRateLimit(request, scope, 2, "production").allowed, false);
});

test("missing trusted client IP does not put all auth users in one global bucket", () => {
  const scope = `auth-client-no-ip-${randomUUID()}`;
  const request = {
    headers: new Headers({ "x-forwarded-for": "198.51.100.42" }),
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    assert.equal(checkAuthClientRateLimit(request, scope, 1, "production").allowed, true);
  }
});

test("order idempotency conflicts cannot reveal another trader's order", () => {
  const ownerCheck = ordersRoute.indexOf("if (existing.traderId !== traderId)");
  const duplicateResponse = ordersRoute.indexOf("order: existing", ownerCheck);

  assert.notEqual(ownerCheck, -1);
  assert.ok(duplicateResponse > ownerCheck);
  assert.match(
    ordersRoute.slice(ownerCheck, duplicateResponse),
    /status:\s*409/,
  );
});
