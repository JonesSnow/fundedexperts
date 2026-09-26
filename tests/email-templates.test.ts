import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
} from "../lib/email/templates";

const prisma = new PrismaClient();

const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

async function createTestTrader(email: string) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: {
      email,
      password: passwordHash,
      role: "TRADER",
      emailVerified: true,
    },
  });
}

describe("Email Templates", () => {
  before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "EmailDelivery" CASCADE');
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("should render verification email", async () => {
    const trader = await createTestTrader("verify-template-test@example.com");
    const result = await sendVerificationEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      "abc123",
      futureDate,
    );
    assert.equal(result.success, true, `Verification email should succeed, got: ${result.error}`);
  });

  it("should render password reset email", async () => {
    const trader = await createTestTrader("reset-template-test@example.com");
    const result = await sendPasswordResetEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      "xyz789",
      futureDate,
    );
    assert.equal(result.success, true, `Reset email should succeed, got: ${result.error}`);
  });

  it("should render welcome email", async () => {
    const trader = await createTestTrader("welcome-template-test@example.com");
    const result = await sendWelcomeEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { isVerified: true },
    );
    assert.equal(result.success, true, `Welcome email should succeed, got: ${result.error}`);
  });

  it("should render password changed email", async () => {
    const trader = await createTestTrader("pwchanged-template-test@example.com");
    const result = await sendPasswordChangedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { changedByAdmin: false },
    );
    assert.equal(result.success, true, `Password changed email should succeed, got: ${result.error}`);
  });
});
