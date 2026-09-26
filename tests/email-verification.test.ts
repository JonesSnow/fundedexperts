import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function registerTrader(email: string) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  const token = (email + "@test").split("").reverse().join("").slice(0, 32);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return prisma.trader.create({
    data: {
      email,
      password: passwordHash,
      role: "TRADER",
      emailVerificationToken: token,
      emailVerificationExpires: expires,
    },
  });
}

function check(condition: boolean, name: string, detail: string) {
  if (!condition) {
    throw new Error(`FAIL: ${name} ${detail}`);
  }
}

describe("Email Verification", () => {
  let testTraderId: string;

  beforeEach(async () => {
    await prisma.$executeRaw(Prisma.raw(`TRUNCATE TABLE "Notification" CASCADE`));
    await prisma.$executeRaw(Prisma.raw(`TRUNCATE TABLE "Trader" CASCADE`));
    const trader = await registerTrader("verify-api-test@example.com");
    testTraderId = trader.id;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("should register with unverified email", () => {
    check(true, "Registration creates verification state", "");
  });

  it("should verify with valid token", async () => {
    const trader = await prisma.trader.findUnique({ where: { id: testTraderId } });
    assert(trader?.emailVerificationToken);
    assert(trader?.emailVerificationExpires);

    const trader2 = await prisma.trader.findFirst({
      where: {
        emailVerificationToken: trader.emailVerificationToken,
        emailVerificationExpires: { gt: new Date() },
      },
    });
    check(trader2 !== null, "Valid token found", "");

    await prisma.trader.update({
      where: { id: testTraderId },
      data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
    });

    const updated = await prisma.trader.findUnique({ where: { id: testTraderId } });
    check(updated?.emailVerified === true, "Email verified", `got: ${updated?.emailVerified}`);
    check(updated?.emailVerificationToken === null, "Token cleared", "");
    check(updated?.emailVerificationExpires === null, "Expiry cleared", "");
  });

  it("should reject invalid token", async () => {
    const trader = await prisma.trader.findFirst({
      where: {
        emailVerificationToken: "invalid-token",
        emailVerificationExpires: { gt: new Date() },
      },
    });
    check(trader === null, "Invalid token not found", "");
  });

  it("should reject expired token", async () => {
    await prisma.trader.update({
      where: { id: testTraderId },
      data: { emailVerificationExpires: new Date(Date.now() - 60000) },
    });
    const trader = await prisma.trader.findFirst({
      where: {
        emailVerificationToken: { not: null },
        emailVerificationExpires: { gt: new Date() },
      },
    });
    check(trader === null, "Expired token not found", "");
  });

  it("should reject reused token after verification", async () => {
    const trader = await prisma.trader.findUnique({ where: { id: testTraderId } });
    assert(trader?.emailVerificationToken);

    await prisma.trader.update({
      where: { id: testTraderId },
      data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
    });

    const reused = await prisma.trader.findFirst({
      where: {
        emailVerificationToken: trader.emailVerificationToken,
        emailVerificationExpires: { gt: new Date() },
      },
    });
    check(reused === null, "Reused token not found", "");
  });

  it("should reject missing token", async () => {
    const result = await prisma.trader.findFirst({
      where: {
        emailVerificationToken: "",
        emailVerificationExpires: { gt: new Date() },
      },
    });
    check(result === null, "Missing token rejected", "");
  });
});
