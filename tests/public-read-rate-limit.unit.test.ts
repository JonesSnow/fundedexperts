import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkClientRateLimit, resetRateLimit } from "../lib/auth/rate-limit";

const productsRoute = readFileSync(
  new URL("../app/api/products/route.ts", import.meta.url),
  "utf8",
);
const productDetailRoute = readFileSync(
  new URL("../app/api/products/[id]/route.ts", import.meta.url),
  "utf8",
);

test("public product reads use per-client limits with room for normal browsing", () => {
  assert.match(productsRoute, /checkClientRateLimit\(request,\s*["']products:list["'],\s*60\)/);
  assert.match(productDetailRoute, /checkClientRateLimit\(request,\s*`product:\$\{id\}`,\s*60\)/);

  const scope = `public-catalog-test:${randomUUID()}`;
  const firstClientKey = `${scope}:192.0.2.10`;
  const secondClientKey = `${scope}:192.0.2.11`;
  resetRateLimit(firstClientKey);
  resetRateLimit(secondClientKey);

  try {
    const firstClient = new Request("https://example.test/api/products", {
      headers: { "x-vercel-forwarded-for": "192.0.2.10" },
    });
    const secondClient = new Request("https://example.test/api/products", {
      headers: { "x-vercel-forwarded-for": "192.0.2.11" },
    });

    for (let attempt = 0; attempt < 60; attempt += 1) {
      assert.equal(checkClientRateLimit(firstClient, scope, 60).allowed, true);
    }
    assert.equal(checkClientRateLimit(firstClient, scope, 60).allowed, false);
    assert.equal(checkClientRateLimit(secondClient, scope, 60).allowed, true);
  } finally {
    resetRateLimit(firstClientKey);
    resetRateLimit(secondClientKey);
  }
});

test("production rate limits ignore untrusted forwarded-for when Vercel IP is absent", () => {
  const scope = `public-catalog-untrusted-forwarded-test:${randomUUID()}`;
  const unknownClientKey = `${scope}:unknown`;
  resetRateLimit(unknownClientKey);

  try {
    const forgedAddressA = new Request("https://example.test/api/products", {
      headers: { "x-forwarded-for": "192.0.2.21" },
    });
    const forgedAddressB = new Request("https://example.test/api/products", {
      headers: { "x-forwarded-for": "192.0.2.22" },
    });

    assert.equal(checkClientRateLimit(forgedAddressA, scope, 1, "production").allowed, true);
    assert.equal(checkClientRateLimit(forgedAddressB, scope, 1, "production").allowed, false);
  } finally {
    resetRateLimit(unknownClientKey);
  }
});
