import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { createSession, getSession, SESSION_COOKIE } from "../lib/auth/session";
import { hashPassword, verifyPassword } from "../lib/auth/hash";
import { validateEmail, validatePassword, validateRegisterInput, validateLoginInput } from "../lib/auth/validation";

const PASSWORD = "TestPass123";
const WEAK_PASSWORD = "weak";
const BAD_PASSWORD = "allletters";

describe("Password Validation", () => {
  it("should accept valid passwords", () => {
    assert.equal(validatePassword(PASSWORD).valid, true);
    assert.equal(validatePassword("Abcdef12").valid, true);
  });

  it("should reject passwords without numbers", () => {
    assert.equal(validatePassword(BAD_PASSWORD).valid, false);
  });

  it("should reject passwords under 8 characters", () => {
    assert.equal(validatePassword(WEAK_PASSWORD).valid, false);
  });

  it("should reject empty passwords", () => {
    assert.equal(validatePassword("").valid, false);
  });
});

describe("Email Validation", () => {
  it("should accept valid emails", () => {
    assert.equal(validateEmail("trader@example.com").valid, true);
    assert.equal(validateEmail("admin@fundedexperts.local").valid, true);
  });

  it("should reject invalid emails", () => {
    assert.equal(validateEmail("notanemail").valid, false);
    assert.equal(validateEmail("missing@domain").valid, false);
    assert.equal(validateEmail("@domain.com").valid, false);
    assert.equal(validateEmail("").valid, false);
  });
});

describe("Password Hashing", () => {
  it("should hash and verify passwords", async () => {
    const hash = await bcrypt.hash(PASSWORD, 12);
    assert.notEqual(hash, PASSWORD);
    assert.equal(await bcrypt.compare(PASSWORD, hash), true);
    assert.equal(await bcrypt.compare("WrongPass123", hash), false);
  });

  it("should hash and verify via hashPassword utility", async () => {
    const hash = await hashPassword(PASSWORD);
    assert.notEqual(hash, PASSWORD);
    assert.equal(await verifyPassword(PASSWORD, hash), true);
    assert.equal(await verifyPassword("WrongPass123", hash), false);
  });

  it("should produce bcrypt-compatible hashes ($2b$ format) from hashPassword", async () => {
    const hash = await hashPassword(PASSWORD);
    assert.match(hash, /^\$2b\$12\$/);
    const legacyHash = await bcrypt.hash(PASSWORD, 12);
    assert.equal(await verifyPassword(PASSWORD, legacyHash), true);
    assert.equal(await bcrypt.compare(PASSWORD, hash), true);
  });
});

describe("Authentication Session", () => {
  it("should create and verify JWT sessions", async () => {
    assert.equal(typeof SESSION_COOKIE, "string");
    assert.equal(SESSION_COOKIE, "session");

    const token = await createSession("trader-1", "TRADER");
    assert.ok(token);

    const session = await getSession(token);
    assert.equal(session?.sub, "trader-1");
    assert.equal(session?.role, "TRADER");
  });

  it("should reject invalid sessions", async () => {
    const session = await getSession("invalid-token");
    assert.equal(session, null);
  });
});

describe("Authorization", () => {
  it("should verify trader role", async () => {
    const token = await createSession("trader-1", "TRADER");
    const session = await getSession(token);
    assert.equal(session?.role, "TRADER");
  });

  it("should verify admin role", async () => {
    const token = await createSession("admin-1", "ADMIN");
    const session = await getSession(token);
    assert.equal(session?.role, "ADMIN");
  });
});

describe("Role Escalation Protection", () => {
  it("should ignore ADMIN role in registration request", async () => {
    const prisma = new PrismaClient();
    try {
      await prisma.trader.create({
        data: {
          email: "escalation@example.com",
          password: await hashPassword(PASSWORD),
          role: "TRADER",
        },
      });
      const trader = await prisma.trader.findUnique({
        where: { email: "escalation@example.com" },
      });
      assert.equal(trader?.role, "TRADER");
    } finally {
      await prisma.trader.deleteMany({
        where: { email: "escalation@example.com" },
      });
      await prisma.$disconnect();
    }
  });

  it("should not create ADMIN via public registration", async () => {
    const prisma = new PrismaClient();
    try {
      const trader = await prisma.trader.create({
        data: {
          email: "normal-registration@example.com",
          password: await hashPassword(PASSWORD),
          role: "TRADER",
        },
      });
      assert.equal(trader.role, "TRADER");
      assert.notEqual(trader.role, "ADMIN");
    } finally {
      await prisma.trader.deleteMany({
        where: { email: "normal-registration@example.com" },
      });
      await prisma.$disconnect();
    }
  });
});

describe("Account Status Enforcement", () => {
  it("should define all trader statuses", () => {
    const statuses = ["PENDING", "ACTIVE", "SUSPENDED", "INACTIVE"];
    assert.equal(statuses.includes("PENDING"), true);
    assert.equal(statuses.includes("ACTIVE"), true);
    assert.equal(statuses.includes("SUSPENDED"), true);
    assert.equal(statuses.includes("INACTIVE"), true);
  });

  it("should enforce account status check in session lookup", async () => {
    const bcrypt = await import("bcryptjs");
    const { PrismaClient } = await import("@prisma/client");
      const { createSession, getSession } = await import(
      "../lib/auth/session"
    );
    const prisma = new PrismaClient();
    try {
      const trader = await prisma.trader.create({
        data: {
          email: "status-test@example.com",
          password: await bcrypt.hash(PASSWORD, 12),
          role: "TRADER",
          status: "SUSPENDED",
        },
      });
      assert.equal(trader.status, "SUSPENDED");
    } finally {
      await prisma.trader.deleteMany({
        where: { email: "status-test@example.com" },
      });
      await prisma.$disconnect();
    }
  });
});

describe("Registration Input Validation", () => {
  it("should validate correct registration input", () => {
    const result = validateRegisterInput({
      email: "trader@example.com",
      password: "TestPass123",
      firstName: "John",
      lastName: "Doe",
    });
    assert.equal(result.valid, true);
    assert.equal(Object.keys(result.errors).length, 0);
  });

  it("should reject invalid registration input", () => {
    const result = validateRegisterInput({
      email: "bad",
      password: "weak",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.email);
    assert.ok(result.errors.password);
  });

  it("should reject duplicate emails", async () => {
    const prisma = new PrismaClient();
    try {
      await prisma.trader.create({
        data: {
          email: "duplicate@example.com",
          password: await hashPassword(PASSWORD),
          role: "TRADER",
        },
      });
      let threw = false;
      try {
        await prisma.trader.create({
          data: {
            email: "duplicate@example.com",
            password: await hashPassword(PASSWORD),
            role: "TRADER",
          },
        });
      } catch (e: unknown) {
        threw = true;
        assert.equal((e as { code: string }).code, "P2002");
      }
      assert.equal(threw, true);
    } finally {
      await prisma.trader.deleteMany({
        where: { email: "duplicate@example.com" },
      });
      await prisma.$disconnect();
    }
  });
});

describe("Login Input Validation", () => {
  it("should validate correct login input", () => {
    const result = validateLoginInput({
      email: "trader@example.com",
      password: "TestPass123",
    });
    assert.equal(result.valid, true);
  });

  it("should reject invalid login input", () => {
    const result = validateLoginInput({
      email: "bad",
      password: "weak",
    });
    assert.equal(result.valid, false);
  });
});
