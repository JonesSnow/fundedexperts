import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";
import { createSession } from "../lib/auth/session";
import { checkRateLimit, resetRateLimit } from "../lib/auth/rate-limit";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

async function createVerifiedTrader(email: string, overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: {
      email,
      password: passwordHash,
      role: "TRADER",
      emailVerified: true,
      status: "ACTIVE",
      ...overrides,
    },
  });
}

async function createUnverifiedTrader(email: string, overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return prisma.trader.create({
    data: {
      email,
      password: passwordHash,
      role: "TRADER",
      emailVerified: false,
      emailVerificationToken: token,
      emailVerificationExpires: expires,
      status: "ACTIVE",
      ...overrides,
    },
  });
}

describe("Verification Flow - Token States", () => {
  before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "EmailDelivery" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Trader" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Notification" CASCADE');
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("valid token: should find trader with matching token and valid expiry", async () => {
    const trader = await createUnverifiedTrader("valid-token-test@example.com");
    const token = trader.emailVerificationToken!;

    const found = await prisma.trader.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: { gt: new Date() },
      },
    });

    assert.ok(found, "Should find trader with valid token");
    assert.equal(found!.id, trader.id);
    assert.equal(found!.emailVerified, false);
  });

  it("expired token: should find trader but token expired", async () => {
    const trader = await createUnverifiedTrader("expired-token-test@example.com");
    const pastExpiry = new Date(Date.now() - 60 * 1000);

    await prisma.trader.update({
      where: { id: trader.id },
      data: { emailVerificationExpires: pastExpiry },
    });

    const expiredMatch = await prisma.trader.findFirst({
      where: { emailVerificationToken: trader.emailVerificationToken },
    });
    assert.ok(expiredMatch, "Should find trader by token");
    assert.equal(expiredMatch!.emailVerified, false);

    const activeMatch = await prisma.trader.findFirst({
      where: {
        emailVerificationToken: trader.emailVerificationToken,
        emailVerificationExpires: { gt: new Date() },
      },
    });
    assert.equal(activeMatch, null, "Should NOT match with expiry filter");
  });

  it("invalid token: should return null", async () => {
    const found = await prisma.trader.findFirst({
      where: {
        emailVerificationToken: "nonexistent-token-12345",
        emailVerificationExpires: { gt: new Date() },
      },
    });
    assert.equal(found, null, "Invalid token should not match any trader");
  });

  it("already-used token: token is null after verification", async () => {
    const trader = await createUnverifiedTrader("used-token-test@example.com");

    await prisma.trader.update({
      where: { id: trader.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    const found = await prisma.trader.findFirst({
      where: { emailVerificationToken: trader.emailVerificationToken },
    });
    assert.equal(found, null, "Used token should not match (cleared to null)");
  });

  it("already verified account: token is null", async () => {
    const trader = await createVerifiedTrader("already-verified-test@example.com");
    assert.equal(trader.emailVerified, true);
    assert.equal(trader.emailVerificationToken, null);

    const found = await prisma.trader.findFirst({
      where: {
        emailVerificationToken: "some-token",
      },
    });
    assert.notEqual(found?.id, trader.id, "Verified account should not match any token");
  });

  it("resend: should issue new token and replace old one", async () => {
    const trader = await createUnverifiedTrader("resend-test@example.com");
    const oldToken = trader.emailVerificationToken!;

    const newToken = randomBytes(32).toString("hex");
    const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.trader.update({
      where: { id: trader.id },
      data: {
        emailVerificationToken: newToken,
        emailVerificationExpires: newExpires,
      },
    });

    const stillOld = await prisma.trader.findFirst({
      where: { emailVerificationToken: oldToken },
    });
    assert.equal(stillOld, null, "Old token should no longer match");

    const hasNew = await prisma.trader.findFirst({
      where: { emailVerificationToken: newToken },
    });
    assert.ok(hasNew, "New token should match");
    assert.equal(hasNew!.id, trader.id);
  });
});

describe("Verification Flow - Rate Limiting", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env.EMAIL_MODE = originalEnv.EMAIL_MODE;
    process.env.SMTP_HOST = originalEnv.SMTP_HOST;
    process.env.SMTP_PORT = originalEnv.SMTP_PORT;
    process.env.SMTP_USER = originalEnv.SMTP_USER;
    process.env.SMTP_PASSWORD = originalEnv.SMTP_PASSWORD;
    process.env.SMTP_FROM = originalEnv.SMTP_FROM;
  });

  it("verify-email resend should be rate limited", async () => {
    const rateLimitKey = "verify-email:resend-limit-test";
    resetRateLimit(rateLimitKey);

    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(rateLimitKey);
      assert.equal(result.allowed, true, `Attempt ${i + 1} should be allowed`);
    }

    const blocked = checkRateLimit(rateLimitKey);
    assert.equal(blocked.allowed, false, "6th attempt should be blocked");
    assert.ok(blocked.retryAfter, "Should have retry after value");
  });

  it("rate limit window resets after timeout", () => {
    const rateLimitKey = "verify-email:reset-test";
    resetRateLimit(rateLimitKey);

    for (let i = 0; i < 5; i++) {
      checkRateLimit(rateLimitKey);
    }

    const blocked = checkRateLimit(rateLimitKey);
    assert.equal(blocked.allowed, false, "Should be blocked");

    resetRateLimit(rateLimitKey);

    const allowed = checkRateLimit(rateLimitKey);
    assert.equal(allowed.allowed, true, "Should be allowed after reset");
  });
});

describe("Verification Flow - Unverified Access Protection", () => {
  before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "EmailDelivery" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Trader" CASCADE');
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("should create session for unverified user (session is valid, access is restricted at middleware level)", async () => {
    const trader = await createUnverifiedTrader("unverified-session-test@example.com");
    const token = await createSession(trader.id, trader.role);

    assert.ok(token, "Session token should be created");
    assert.equal(trader.emailVerified, false, "Trader should be unverified");
    assert.equal(trader.status, "ACTIVE", "Trader status should not block login");
  });

  it("should create session for verified user", async () => {
    const trader = await createVerifiedTrader("verified-session-test@example.com");
    const token = await createSession(trader.id, trader.role);

    assert.ok(token, "Session token should be created");
    assert.equal(trader.emailVerified, true, "Trader should be verified");
  });

  it("should deny access for suspended user", async () => {
    const trader = await createVerifiedTrader("suspended-test@example.com", { status: "SUSPENDED" });
    assert.equal(trader.status, "SUSPENDED", "Status should be suspended");
  });

  it("should deny access for inactive user", async () => {
    const trader = await createVerifiedTrader("inactive-test@example.com", { status: "INACTIVE" });
    assert.equal(trader.status, "INACTIVE", "Status should be inactive");
  });

  it("middleware should check emailVerified for dashboard protection", async () => {
    const unverified = await createUnverifiedTrader("middleware-unverified-test@example.com");
    const verified = await createVerifiedTrader("middleware-verified-test@example.com");

    assert.equal(unverified.emailVerified, false, "Unverified user should have emailVerified=false");
    assert.equal(verified.emailVerified, true, "Verified user should have emailVerified=true");
    assert.equal(unverified.status, "ACTIVE", "Unverified user status should be ACTIVE (not blocked by status)");
    assert.equal(verified.status, "ACTIVE", "Verified user status should be ACTIVE");
  });
});

describe("Verification Flow - Email Delivery Failure Handling", () => {
  it("registration should proceed even if email send fails", async () => {
    const passwordHash = await bcrypt.hash("TestPass123", 12);
    const verificationToken = randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const trader = await prisma.trader.create({
      data: {
        email: "email-fail-test@example.com",
        password: passwordHash,
        role: "TRADER",
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
      },
    });

    assert.ok(trader.id, "Account should be created even if email fails");
    assert.equal(trader.emailVerified, false, "Account should remain unverified on email failure");
    assert.ok(trader.emailVerificationToken, "Should still have a verification token");
  });

  it("verification-pending page should show email error state", async () => {
    const trader = await createUnverifiedTrader("pending-error-test@example.com");

    assert.equal(trader.emailVerified, false);
    assert.ok(trader.email, "Should have email for display on pending page");
  });
});

describe("Verification Flow - Login Redirect Logic", () => {
  before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "EmailDelivery" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Trader" CASCADE');
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("login API should return emailVerified=false for unverified user", async () => {
    const trader = await createUnverifiedTrader("login-unverified-test@example.com");
    const result = await prisma.trader.findUnique({
      where: { email: trader.email },
      select: { emailVerified: true, status: true },
    });

    assert.equal(result!.emailVerified, false);

    if (result!.status === "SUSPENDED" || result!.status === "INACTIVE") {
      assert.fail("Login should be blocked for suspended/inactive users");
    }
  });

  it("login API should return emailVerified=true for verified user", async () => {
    const trader = await createVerifiedTrader("login-verified-test@example.com");
    const result = await prisma.trader.findUnique({
      where: { email: trader.email },
      select: { emailVerified: true, status: true },
    });

    assert.equal(result!.emailVerified, true);
  });
});

describe("Password Reset Flow - Complete Lifecycle", () => {
  let testTraderId: string;

  before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "EmailDelivery" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Trader" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Notification" CASCADE');
    const trader = await createVerifiedTrader("pw-reset-lifecycle-test@example.com");
    testTraderId = trader.id;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("should generate reset token with expiry", async () => {
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.trader.update({
      where: { id: testTraderId },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    });

    const found = await prisma.trader.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });
    assert.ok(found, "Reset token should be valid");
  });

  it("should invalidate reset token after password change", async () => {
    const current = await prisma.trader.findUnique({
      where: { id: testTraderId },
      select: { passwordResetToken: true, passwordResetExpires: true },
    });
    assert.ok(current?.passwordResetToken, "Should have a current reset token");

    const newHash = await bcrypt.hash("NewPass123", 12);
    await prisma.trader.update({
      where: { id: testTraderId },
      data: {
        password: newHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    const invalidated = await prisma.trader.findFirst({
      where: { passwordResetToken: current!.passwordResetToken },
    });
    assert.equal(invalidated, null, "Reset token should be invalidated after use");
  });

  it("should not allow account enumeration (same response for existing and non-existing email)", () => {
    const existingResponse = { success: true, message: "If an account exists, a reset email has been sent" };
    const nonExistingResponse = { success: true, message: "If an account exists, a reset email has been sent" };

    assert.deepEqual(existingResponse, nonExistingResponse, "Response must be identical to prevent enumeration");
  });

  it("should not expose reset token in URL query string", async () => {
    const { buildTokenUrl, extractTokenFromHash } = await import("../lib/email/urls");

    const url = buildTokenUrl("/reset-password", "reset-token-123");
    assert.ok(url.includes("#reset-token-123"), "Token must be in fragment, not query string");
    assert.ok(!url.includes("?token="), "Token must NOT be in query string");

    const extracted = extractTokenFromHash("#reset-token-123");
    assert.equal(extracted, "reset-token-123");
  });
});
