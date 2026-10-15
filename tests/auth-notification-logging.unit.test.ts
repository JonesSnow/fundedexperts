import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const registrationRoute = readFileSync(
  new URL("../app/api/auth/register/route.ts", import.meta.url),
  "utf8",
);
const loginRoute = readFileSync(
  new URL("../app/api/auth/login/route.ts", import.meta.url),
  "utf8",
);
const forgotPasswordRoute = readFileSync(
  new URL("../app/api/auth/forgot-password/route.ts", import.meta.url),
  "utf8",
);
const resetPasswordRoute = readFileSync(
  new URL("../app/api/auth/reset-password/route.ts", import.meta.url),
  "utf8",
);
const verifyEmailRoute = readFileSync(
  new URL("../app/api/auth/verify-email/route.ts", import.meta.url),
  "utf8",
);
const verifyEmailConfirmRoute = readFileSync(
  new URL("../app/api/auth/verify-email/confirm/route.ts", import.meta.url),
  "utf8",
);

function assertLoggedEmailBoundary(
  source: string,
  sender: string,
  loggerMessage: string,
  errorCode: string,
) {
  const senderPosition = source.indexOf(`${sender}(`);
  assert.notEqual(senderPosition, -1, `${sender} should be called`);
  const catchPosition = source.indexOf(".catch(() => {", senderPosition);
  assert.notEqual(catchPosition, -1, `${sender} rejection must be handled`);
  const catchBody = source.slice(catchPosition, source.indexOf("\n    });", catchPosition));
  assert.ok(catchBody.includes(`logger.error("AUTH", "${loggerMessage}"`));
  assert.ok(catchBody.includes(`code: "${errorCode}"`));
  assert.doesNotMatch(source, /error:\s*\{\s*code:[\s\S]*?message:\s*error\.message/);
}

test("registration reports thrown verification-email dispatch failures safely", () => {
  assertLoggedEmailBoundary(
    registrationRoute,
    "sendVerificationEmail",
    "Verification email dispatch failed after registration",
    "VERIFICATION_EMAIL_DISPATCH_FAILED",
  );
});

test("login reports thrown security-alert dispatch failures safely", () => {
  assertLoggedEmailBoundary(
    loginRoute,
    "sendLoginSecurityAlertEmail",
    "Login security alert dispatch failed",
    "LOGIN_ALERT_DISPATCH_FAILED",
  );
});

test("forgot-password reports thrown reset-email dispatch failures safely", () => {
  assertLoggedEmailBoundary(
    forgotPasswordRoute,
    "sendPasswordResetEmail",
    "Password reset email dispatch failed",
    "PASSWORD_RESET_EMAIL_DISPATCH_FAILED",
  );
});

test("password reset reports thrown password-changed-email failures safely", () => {
  assertLoggedEmailBoundary(
    resetPasswordRoute,
    "sendPasswordChangedEmail",
    "Password changed email dispatch failed",
    "PASSWORD_CHANGED_EMAIL_DISPATCH_FAILED",
  );
});

test("verification resend reports thrown verification-email failures safely", () => {
  assertLoggedEmailBoundary(
    verifyEmailRoute,
    "sendVerificationEmail",
    "Verification resend email dispatch failed",
    "VERIFICATION_RESEND_DISPATCH_FAILED",
  );
});

test("verification confirmation reports thrown welcome-email failures safely", () => {
  assertLoggedEmailBoundary(
    verifyEmailConfirmRoute,
    "sendWelcomeEmail",
    "Welcome email dispatch failed after verification",
    "WELCOME_EMAIL_DISPATCH_FAILED",
  );
});
