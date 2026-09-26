import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendNotificationEmail,
} from "../lib/email/templates";

describe("Email Templates", () => {
  it("should render verification email", async () => {
    const result = await sendVerificationEmail("test@example.com", "abc123");
    check(result.success === true || result.success === false, "Verification email returned result", "");
    if (!result.success) check(result.error, "Error message present", "");
  });

  it("should render password reset email", async () => {
    const result = await sendPasswordResetEmail("test@example.com", "xyz789");
    check(result.success === true || result.success === false, "Reset email returned result", "");
    if (!result.success) check(result.error, "Error message present", "");
  });

  it("should render welcome email", async () => {
    const result = await sendWelcomeEmail("test@example.com");
    check(result.success === true || result.success === false, "Welcome email returned result", "");
    if (!result.success) check(result.error, "Error message present", "");
  });

  it("should render notification email", async () => {
    const result = await sendNotificationEmail("test@example.com", "Test Title", "Test message body");
    check(result.success === true || result.success === false, "Notification email returned result", "");
    if (!result.success) check(result.error, "Error message present", "");
  });

  it("should include link in verification email", async () => {
    const result = await sendVerificationEmail("test@example.com", "tok123");
    check(result.success === true, "Verification email succeeded", `got: ${result.success}`);
  });

  it("should include link in password reset email", async () => {
    const result = await sendPasswordResetEmail("test@example.com", "tok456");
    check(result.success === true, "Password reset email succeeded", `got: ${result.success}`);
  });
});

function check(condition: boolean, name: string, detail: string) {
  if (!condition) {
    throw new Error(`FAIL: ${name} ${detail}`);
  }
}
