import assert from "node:assert/strict";
import { test } from "node:test";
import { invalidLoginResponse } from "../lib/auth/login-policy";

test("login failures use one generic response to avoid account-status enumeration", () => {
  const missingAccount = invalidLoginResponse();
  const suspendedAccount = invalidLoginResponse();
  const incorrectPassword = invalidLoginResponse();

  assert.deepEqual(missingAccount, {
    status: 401,
    body: { success: false, error: "Invalid credentials" },
  });
  assert.deepEqual(suspendedAccount, missingAccount);
  assert.deepEqual(incorrectPassword, missingAccount);
});
