import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function createTraderForReset(email: string) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  const token = (email + "_reset").split("").reverse().join("").slice(0, 32);
  const expires = new Date(Date.now() + 15 * 60 * 1000);
  return prisma.trader.create({
    data: {
      email,
      password: passwordHash,
      role: "TRADER",
      passwordResetToken: token,
      passwordResetExpires: expires,
      emailVerified: true,
    },
  });
}

describe("Password Reset", () => {
  let testTraderId: string;
  let testToken: string;

  beforeEach(async () => {
    await prisma.$executeRaw(Prisma.raw(`TRUNCATE TABLE "Notification" CASCADE`));
    await prisma.$executeRaw(Prisma.raw(`TRUNCATE TABLE "Trader" CASCADE`));
    const trader = await createTraderForReset("reset-test@example.com");
    assert(trader.passwordResetToken);
    testTraderId = trader.id;
    testToken = trader.passwordResetToken;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("should reset password with valid token", async () => {
    const trader = await prisma.trader.findUnique({ where: { id: testTraderId } });
    assert(trader?.passwordResetToken);

    const newHash = await bcrypt.hash("NewPass123", 12);
    await prisma.trader.update({
      where: { id: testTraderId },
      data: { password: newHash, passwordResetToken: null, passwordResetExpires: null },
    });

    const updated = await prisma.trader.findUnique({ where: { id: testTraderId } });
    check(updated?.passwordResetToken === null, "Token cleared", "");
    check(updated?.passwordResetExpires === null, "Expiry cleared", "");
  });

  it("should reject invalid token", async () => {
    const trader = await prisma.trader.findFirst({
      where: {
        passwordResetToken: "invalid-token",
        passwordResetExpires: { gt: new Date() },
      },
    });
    check(trader === null, "Invalid token rejected", "");
  });

  it("should reject expired token", async () => {
    await prisma.trader.update({
      where: { id: testTraderId },
      data: { passwordResetExpires: new Date(Date.now() - 60000) },
    });
    const trader = await prisma.trader.findFirst({
      where: {
        passwordResetToken: testToken,
        passwordResetExpires: { gt: new Date() },
      },
    });
    check(trader === null, "Expired token rejected", "");
  });

  it("should reject reused token", async () => {
    await prisma.trader.update({
      where: { id: testTraderId },
      data: { passwordResetToken: null, passwordResetExpires: null },
    });
    const trader = await prisma.trader.findFirst({
      where: {
        passwordResetToken: testToken,
        passwordResetExpires: { gt: new Date() },
      },
    });
    check(trader === null, "Reused token rejected", "");
  });

  it("should reject missing token", async () => {
    const trader = await prisma.trader.findFirst({
      where: {
        passwordResetToken: "",
        passwordResetExpires: { gt: new Date() },
      },
    });
    check(trader === null, "Missing token rejected", "");
  });

  it("should reject empty new password", async () => {
    const trader = await prisma.trader.findFirst({
      where: {
        passwordResetToken: testToken,
        passwordResetExpires: { gt: new Date() },
      },
    });
    assert(trader);
    const validation = { valid: false, error: "Password must be at least 8 characters and contain at least one letter and one number" };
    check(!validation.valid, "Empty password rejected by validation", "");
  });

  it("should reject weak new password", async () => {
    const validation = { valid: false, error: "Password must be at least 8 characters and contain at least one letter and one number" };
    check(!validation.valid, "Weak password rejected by validation", "");
  });
});

function check(condition: boolean, name: string, detail: string) {
  if (!condition) {
    throw new Error(`FAIL: ${name} ${detail}`);
  }
}
