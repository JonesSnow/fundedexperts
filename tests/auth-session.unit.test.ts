import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { createSession, getSession } from "../lib/auth/session";

test("session creation and verification require verified email", async () => {
  const token = await createSession("verified-trader", "TRADER", true);

  assert.deepEqual(await getSession(token), {
    sub: "verified-trader",
    role: "TRADER",
    emailVerified: true,
  });
  await assert.rejects(
    createSession("unverified-trader", "TRADER", false),
    /unverified email address/
  );
});

test("sessions without the verified-email claim are rejected", async () => {
  const secretValue = process.env.JWT_SECRET;
  if (!secretValue) {
    throw new Error("The unit-test runner must provide JWT_SECRET.");
  }

  const legacyToken = await new SignJWT({ role: "TRADER" })
    .setSubject("legacy-trader")
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(new TextEncoder().encode(secretValue));

  assert.equal(await getSession(legacyToken), null);
});
