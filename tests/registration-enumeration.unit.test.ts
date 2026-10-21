import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  registrationAcceptedPayload,
  REGISTRATION_ACCEPTED_MESSAGE,
} from "../lib/auth/registration-response";

const registrationRoute = readFileSync(
  new URL("../app/api/auth/register/route.ts", import.meta.url),
  "utf8",
);
const registrationPage = readFileSync(
  new URL("../app/register/page.tsx", import.meta.url),
  "utf8",
);
const verificationPage = readFileSync(
  new URL("../components/email-otp-verification.tsx", import.meta.url),
  "utf8",
);

test("registration acceptance response reveals no account state", () => {
  const email = "customer@example.com";
  const accepted = registrationAcceptedPayload(email);

  assert.deepEqual(accepted, {
    accepted: true,
    email,
    message: REGISTRATION_ACCEPTED_MESSAGE,
  });
  assert.match(REGISTRATION_ACCEPTED_MESSAGE, /If this address can be registered/);
  assert.match(REGISTRATION_ACCEPTED_MESSAGE, /sign in or reset your password/);
  assert.equal("trader" in accepted, false);
  assert.equal("emailSent" in accepted, false);
});

test("duplicate, successful, and concurrent duplicate registrations share one accepted contract", () => {
  const genericResponse = "NextResponse.json(registrationAcceptedPayload(email), { status: 202 })";
  const existingBranch = registrationRoute.match(/if \(existing\) \{([\s\S]*?)\n\s*\}/);

  assert.ok(existingBranch);
  assert.match(existingBranch[1], /await hashPassword\(body\.password\)/);
  assert.match(existingBranch[1], /registrationAcceptedPayload\(email\)/);
  assert.equal(registrationRoute.split(genericResponse).length - 1, 2);
  assert.match(registrationRoute, /error\.code === "P2002"[\s\S]*registrationAcceptedPayload\(normalizedEmail\)/);
  assert.doesNotMatch(registrationRoute, /Email already registered|emailSent|emailError|trader:\s*\{/);
});

test("registration UI uses the submitted address and handles the generic response", () => {
  assert.match(registrationPage, /response\.status === 202 && data\.accepted === true/);
  assert.match(registrationPage, /verification-email", email\.trim\(\)\.toLowerCase\(\)/);
  assert.doesNotMatch(registrationPage, /data\.trader|data\.emailSent|verification-delivery/);
  assert.match(verificationPage, /If this is a new account/);
  assert.match(verificationPage, /Already have an account/);
  assert.match(verificationPage, /forgot-password/);
});
