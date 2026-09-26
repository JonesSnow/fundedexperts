import { describe, it, before, after, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { sanitizeSensitiveValue } from "../lib/logger";
import nodemailer, { Transporter } from "nodemailer";
import { GmailSmtpProvider } from "../lib/email/provider";
import { sendEmail, MAX_RETRIES, RETRY_DELAYS } from "../lib/email/index";

const prisma = new PrismaClient();

async function createTrader(email: string) {
  return prisma.trader.create({
    data: {
      email,
      password: "hashedplaceholder",
      role: "TRADER",
      emailVerified: true,
    },
  });
}

describe("Email Provider SMTP Reliability", () => {
  before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "EmailDelivery" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Trader" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Notification" CASCADE');
  });

  after(async () => {
    await prisma.$disconnect();
  });

  describe("SMTP connection timeout configuration", () => {
    let transporterCalls: Record<string, unknown>[] = [];

    it("should configure connectionTimeout: 5000 on nodemailer transport", async () => {
      const originalEnv = { ...process.env };
      process.env.EMAIL_MODE = "smtp";
      process.env.SMTP_HOST = "smtp.gmail.com";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = "test-user@gmail.com";
      process.env.SMTP_PASSWORD = "test-password";
      process.env.SMTP_FROM = "test@fundedexperts.com";

      try {
        const mockTransport = {
          sendMail: async () => ({ messageId: "test-id" }),
          close: () => {},
        };

        const createTransportMock = mock.method(nodemailer, "createTransport", (options: Record<string, unknown>) => {
          transporterCalls.push(options);
          return mockTransport as unknown as Transporter;
        });

        const provider = new GmailSmtpProvider();
        await provider.send({
          to: "timeout-config-test@example.com",
          subject: "Test",
          html: "<p>Test</p>",
          text: "Test",
        });

        createTransportMock.mock.restore();

        assert.ok(transporterCalls.length > 0, "createTransport must have been called");
        const options = transporterCalls[transporterCalls.length - 1];
        assert.equal(options.connectionTimeout, 5000, "connectionTimeout must be 5000ms");
      } finally {
        process.env.EMAIL_MODE = originalEnv.EMAIL_MODE;
        process.env.SMTP_HOST = originalEnv.SMTP_HOST;
        process.env.SMTP_PORT = originalEnv.SMTP_PORT;
        process.env.SMTP_USER = originalEnv.SMTP_USER;
        process.env.SMTP_PASSWORD = originalEnv.SMTP_PASSWORD;
        process.env.SMTP_FROM = originalEnv.SMTP_FROM;
      }
    });

    it("should configure greetingsTimeout: 5000 on nodemailer transport", async () => {
      const originalEnv = { ...process.env };
      process.env.EMAIL_MODE = "smtp";
      process.env.SMTP_HOST = "smtp.gmail.com";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = "test-user@gmail.com";
      process.env.SMTP_PASSWORD = "test-password";
      process.env.SMTP_FROM = "test@fundedexperts.com";

      try {
        const mockTransport = {
          sendMail: async () => ({ messageId: "test-id" }),
          close: () => {},
        };

        const createTransportMock = mock.method(nodemailer, "createTransport", (options: Record<string, unknown>) => {
          transporterCalls.push(options);
          return mockTransport as unknown as Transporter;
        });

        const provider = new GmailSmtpProvider();
        await provider.send({
          to: "greetings-timeout-test@example.com",
          subject: "Test",
          html: "<p>Test</p>",
          text: "Test",
        });

        createTransportMock.mock.restore();

        assert.ok(transporterCalls.length > 0, "createTransport must have been called");
        const options = transporterCalls[transporterCalls.length - 1];
        assert.equal(options.greetingsTimeout, 5000, "greetingsTimeout must be 5000ms");
      } finally {
        process.env.EMAIL_MODE = originalEnv.EMAIL_MODE;
        process.env.SMTP_HOST = originalEnv.SMTP_HOST;
        process.env.SMTP_PORT = originalEnv.SMTP_PORT;
        process.env.SMTP_USER = originalEnv.SMTP_USER;
        process.env.SMTP_PASSWORD = originalEnv.SMTP_PASSWORD;
        process.env.SMTP_FROM = originalEnv.SMTP_FROM;
      }
    });

    it("should configure socketTimeout: 10000 on nodemailer transport", async () => {
      const originalEnv = { ...process.env };
      process.env.EMAIL_MODE = "smtp";
      process.env.SMTP_HOST = "smtp.gmail.com";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = "test-user@gmail.com";
      process.env.SMTP_PASSWORD = "test-password";
      process.env.SMTP_FROM = "test@fundedexperts.com";

      try {
        const mockTransport = {
          sendMail: async () => ({ messageId: "test-id" }),
          close: () => {},
        };

        const createTransportMock = mock.method(nodemailer, "createTransport", (options: Record<string, unknown>) => {
          transporterCalls.push(options);
          return mockTransport as unknown as Transporter;
        });

        const provider = new GmailSmtpProvider();
        await provider.send({
          to: "socket-timeout-test@example.com",
          subject: "Test",
          html: "<p>Test</p>",
          text: "Test",
        });

        createTransportMock.mock.restore();

        assert.ok(transporterCalls.length > 0, "createTransport must have been called");
        const options = transporterCalls[transporterCalls.length - 1];
        assert.equal(options.socketTimeout, 10000, "socketTimeout must be 10000ms");
      } finally {
        process.env.EMAIL_MODE = originalEnv.EMAIL_MODE;
        process.env.SMTP_HOST = originalEnv.SMTP_HOST;
        process.env.SMTP_PORT = originalEnv.SMTP_PORT;
        process.env.SMTP_USER = originalEnv.SMTP_USER;
        process.env.SMTP_PASSWORD = originalEnv.SMTP_PASSWORD;
        process.env.SMTP_FROM = originalEnv.SMTP_FROM;
      }
    });
  });

  describe("SMTP timeout produces controlled FAILED delivery", () => {
    let originalEnv: Record<string, string | undefined>;

    beforeEach(() => {
      originalEnv = { ...process.env };
      process.env.EMAIL_MODE = "smtp";
      process.env.SMTP_HOST = "smtp.gmail.com";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = "timeout-user@gmail.com";
      process.env.SMTP_PASSWORD = "timeout-pass-123";
      process.env.SMTP_FROM = "test@fundedexperts.com";
    });

    afterEach(() => {
      process.env.EMAIL_MODE = originalEnv.EMAIL_MODE;
      process.env.SMTP_HOST = originalEnv.SMTP_HOST;
      process.env.SMTP_PORT = originalEnv.SMTP_PORT;
      process.env.SMTP_USER = originalEnv.SMTP_USER;
      process.env.SMTP_PASSWORD = originalEnv.SMTP_PASSWORD;
      process.env.SMTP_FROM = originalEnv.SMTP_FROM;
    });

    it("should mark EmailDelivery as FAILED when SMTP times out", async () => {
      const sendMock = mock.method(GmailSmtpProvider.prototype, "send", async () => ({
        success: false,
        error: "Connection timeout after 5000ms",
      }));

      try {
        const result = await sendEmail(
          {
            to: "timeout-fail-test@example.com",
            subject: "Test Timeout",
            html: "<p>Test</p>",
            text: "Test",
            templateId: "EVALUATION_STARTED",
          },
          { providerOverride: "gmail-smtp" }
        );

        assert.equal(result.success, false);
        assert.ok(result.deliveryId, "Should have delivery ID even on failure");

        const delivery = await prisma.emailDelivery.findUnique({
          where: { id: result.deliveryId },
        });
        assert.ok(delivery, "Delivery record must exist");
        assert.equal(delivery?.status, "FAILED", "Delivery must be FAILED after timeout");
        assert.ok(delivery?.failureReason, "Failure reason must be recorded");
        assert.equal(delivery?.attemptCount, MAX_RETRIES, "Should have exhausted all retry attempts");
      } finally {
        sendMock.mock.restore();
      }
    });

    it("should not leave any EmailDelivery stuck at SENDING after timeout", async () => {
      const sendMock = mock.method(GmailSmtpProvider.prototype, "send", async () => ({
        success: false,
        error: "connect ETIMEDOUT 142.250.1.108:587",
      }));

      try {
        const result = await sendEmail(
          {
            to: "no-stuck-sending-test@example.com",
            subject: "Test No Stuck",
            html: "<p>Test</p>",
            text: "Test",
            templateId: "EVALUATION_STARTED",
          },
          { providerOverride: "gmail-smtp" }
        );

        assert.equal(result.success, false);

        const delivery = await prisma.emailDelivery.findUnique({
          where: { id: result.deliveryId! },
        });
        assert.ok(delivery);
        assert.notEqual(delivery?.status, "SENDING", "Delivery must not be stuck at SENDING");
        assert.notEqual(delivery?.status, "QUEUED", "Delivery must not be stuck at QUEUED");
        assert.equal(delivery?.status, "FAILED", "Delivery must be FAILED after timeout");
      } finally {
        sendMock.mock.restore();
      }
    });
  });

  describe("SMTP success produces SENT", () => {
    it("should mark EmailDelivery as SENT on successful SMTP send", async () => {
      const sendMock = mock.method(GmailSmtpProvider.prototype, "send", async () => ({
        success: true,
        providerMessageId: "queued-12345@example.mail",
      }));

      try {
        const result = await sendEmail({
          to: "success-test@example.com",
          subject: "Test Success",
          html: "<p>Test</p>",
          text: "Test",
          templateId: "EVALUATION_STARTED",
        });

        assert.equal(result.success, true);
        assert.ok(result.deliveryId);

        const delivery = await prisma.emailDelivery.findUnique({
          where: { id: result.deliveryId },
        });
        assert.ok(delivery);
        assert.equal(delivery?.status, "SENT");
        assert.equal(delivery?.providerMessageId, "queued-12345@example.mail");
        assert.ok(delivery?.sentAt, "SentAt must be set");
        assert.equal(delivery?.attemptCount, 1, "Should succeed on first attempt");
      } finally {
        sendMock.mock.restore();
      }
    });
  });

  describe("Configuration failure produces controlled failure", () => {
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

    it("should return controlled failure when SMTP config is invalid", async () => {
      process.env.EMAIL_MODE = "smtp";
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASSWORD;
      delete process.env.SMTP_FROM;

      const result = await sendEmail(
        {
          to: "config-fail-test@example.com",
          subject: "Test Config Fail",
          html: "<p>Test</p>",
          text: "Test",
          templateId: "EVALUATION_STARTED",
        },
        { providerOverride: "gmail-smtp" }
      );

      assert.equal(result.success, false);
      assert.equal(result.error, "Email configuration invalid");
      assert.equal(result.deliveryId, undefined, "No delivery ID should be created when config is invalid");
    });
  });

  describe("Secrets are never included in errors or logs", () => {
    it("should redact password from SMTP error messages", () => {
      const smtpError = "SMTP 535-5.7.8 Username and Password not accepted. password=test-password-123";
      const sanitized = sanitizeSensitiveValue(smtpError);
      assert.ok(!sanitized.includes("test-password-123"), "SMTP password must be redacted");
      assert.ok(sanitized.includes("***REDACTED***"), "Redaction marker must be present");
    });

    it("should redact password and token from error strings", () => {
      const errorMsg = "535-5.7.8 password=mysecret token=abc123";
      const sanitized = sanitizeSensitiveValue(errorMsg);
      assert.ok(!sanitized.includes("mysecret"), "Password value must not appear");
      assert.ok(!sanitized.includes("abc123"), "Token value must not appear");
    });

    it("should not include SMTP credentials in failureReason stored in DB", async () => {
      const originalEnv = { ...process.env };
      process.env.EMAIL_MODE = "smtp";
      process.env.SMTP_HOST = "smtp.gmail.com";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = "test-user@gmail.com";
      process.env.SMTP_PASSWORD = "super-secret-password-456";
      process.env.SMTP_FROM = "test@fundedexperts.com";

      try {
        const sendMock = mock.method(GmailSmtpProvider.prototype, "send", async () => ({
          success: false,
          error: "password=super-secret-password-456 SMTP auth failed",
        }));

        const result = await sendEmail(
          {
            to: "secret-leak-test@example.com",
            subject: "Test Secret Leak",
            html: "<p>Test</p>",
            text: "Test",
            templateId: "EVALUATION_STARTED",
          },
          { providerOverride: "gmail-smtp" }
        );

        assert.equal(result.success, false);
        assert.ok(result.deliveryId);

        const delivery = await prisma.emailDelivery.findUnique({
          where: { id: result.deliveryId },
        });
        assert.ok(delivery);
        assert.ok(!delivery?.failureReason?.includes("super-secret-password-456"), "SMTP password must not be stored in failureReason");

        sendMock.mock.restore();
      } finally {
        process.env.EMAIL_MODE = originalEnv.EMAIL_MODE;
        process.env.SMTP_HOST = originalEnv.SMTP_HOST;
        process.env.SMTP_PORT = originalEnv.SMTP_PORT;
        process.env.SMTP_USER = originalEnv.SMTP_USER;
        process.env.SMTP_PASSWORD = originalEnv.SMTP_PASSWORD;
        process.env.SMTP_FROM = originalEnv.SMTP_FROM;
      }
    });

    it("should redact Bearer tokens from error messages", () => {
      const errorMsg = "Authorization failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
      const sanitized = sanitizeSensitiveValue(errorMsg);
      assert.ok(!sanitized.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "Bearer token value must be redacted");
      assert.ok(sanitized.includes("Bearer ***REDACTED***"));
    });
  });

  describe("Retry delays are serverless-safe", () => {
    it("should use short retry delays compatible with Vercel serverless", () => {
      assert.deepEqual(RETRY_DELAYS, [500, 1000], "Retry delays must be [500, 1000]");
      assert.equal(MAX_RETRIES, 3, "Max retries must be 3");
    });

    it("should have total worst-case time under Vercel timeout", () => {
      const delays = RETRY_DELAYS;
      const maxRetries = MAX_RETRIES;
      const connectionTimeout = 5000;
      const totalRetryDelay = delays.reduce((a: number, b: number) => a + b, 0);
      const totalWorstCase = connectionTimeout * maxRetries + totalRetryDelay;
      assert.ok(totalWorstCase < 30000, `Worst case ${totalWorstCase}ms must be under 30s Vercel timeout`);
    });
  });
});
