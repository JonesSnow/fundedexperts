import assert from "node:assert/strict";
import { test } from "node:test";
import nextConfig from "../next.config";

test("application responses receive baseline browser security headers", async () => {
  const rules = await nextConfig.headers?.();
  assert.ok(rules);

  const applicationRule = rules.find((rule) => rule.source === "/:path*");
  assert.ok(applicationRule);
  const headers = new Map(
    applicationRule.headers.map(({ key, value }) => [key.toLowerCase(), value]),
  );

  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
});
