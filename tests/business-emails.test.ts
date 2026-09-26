import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  sendEvaluationStartedEmail,
  sendEvaluationPassedEmail,
  sendEvaluationFailedEmail,
  sendAccountAllocatedEmail,
  sendFundedAccountActivatedEmail,
  sendAccountStatusChangedEmail,
  sendRuleBreachEmail,
  sendPayoutRequestedEmail,
  sendPayoutApprovedEmail,
  sendPayoutRejectedEmail,
  sendSystemAlertEmail,
} from "../lib/email/templates";
import { buildTokenUrl, extractTokenFromHash } from "../lib/email/urls";
import { createLogger } from "../lib/logger";
import { generateIdempotencyKey } from "../lib/email/idempotency";

const prisma = new PrismaClient();

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

async function createTrader(email: string) {
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

function assertDelivery(record: { success: boolean; error?: string } | undefined, name: string, expectedError?: string) {
  if (!record) {
    throw new Error(`FAIL: ${name} - expected delivery record`);
  }
  assert.equal(record.success, true, `${name} should succeed: ${record.error}`);
  if (expectedError) {
    assert.equal(record.error, expectedError, `${name} should fail with: ${expectedError}`);
  }
}

describe("Business Email Events", () => {
  before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "EmailDelivery" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Trader" CASCADE');
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("should send evaluation started email with correct template", async () => {
    const trader = await createTrader("eval-started-test@example.com");
    const result = await sendEvaluationStartedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { evaluationId: "eval-test-1", productName: "Standard Challenge", accountSize: "100,000" },
    );

    assert.equal(result.success, true, `Evaluation started email should succeed: ${result.error}`);
    assert.ok(result.deliveryId, "Should have delivery ID");

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId } });
    assert.ok(delivery, "Delivery record should exist");
    assert.equal(delivery?.template, "EVALUATION_STARTED");
    assert.equal(delivery?.recipient, trader.email);
    assert.equal(delivery?.status, "SENT");
    assert.equal(delivery?.traderId, trader.id);
    assert.ok(delivery?.idempotencyKey, "Should have idempotency key");
  });

  it("should send evaluation passed email with totalPnl", async () => {
    const trader = await createTrader("eval-passed-test@example.com");
    const result = await sendEvaluationPassedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { evaluationId: "eval-test-2", productName: "Standard Challenge", totalPnl: "15,000.00" },
    );

    assert.equal(result.success, true, `Evaluation passed email should succeed: ${result.error}`);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId! } });
    assert.equal(delivery?.template, "EVALUATION_PASSED");
    assert.equal(delivery?.recipient, trader.email);
    assert.equal(delivery?.status, "SENT");
    assert.equal(delivery?.traderId, trader.id);
  });

  it("should send evaluation failed email with failure reason", async () => {
    const trader = await createTrader("eval-failed-test@example.com");
    const result = await sendEvaluationFailedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { evaluationId: "eval-test-3", productName: "Standard Challenge", failureReason: "Rule breach: Maximum drawdown exceeded" },
    );

    assert.equal(result.success, true, `Evaluation failed email should succeed: ${result.error}`);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId! } });
    assert.equal(delivery?.template, "EVALUATION_FAILED");
    assert.equal(delivery?.recipient, trader.email);
    assert.equal(delivery?.status, "SENT");
    assert.equal(delivery?.traderId, trader.id);
  });

  it("should send account allocated email after successful allocation", async () => {
    const trader = await createTrader("account-allocated-test@example.com");
    const result = await sendAccountAllocatedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { evaluationId: "eval-test-4", accountNumber: "MT5-123456" },
    );

    assert.equal(result.success, true, `Account allocated email should succeed: ${result.error}`);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId! } });
    assert.equal(delivery?.template, "ACCOUNT_ALLOCATED");
    assert.equal(delivery?.recipient, trader.email);
    assert.equal(delivery?.status, "SENT");
    assert.equal(delivery?.traderId, trader.id);
    assert.ok(delivery?.idempotencyKey?.includes("eval-test-4"), "Idempotency key should include evaluation ID");
  });

  it("should send funded account activated email on ACTIVE transition", async () => {
    const trader = await createTrader("funded-activated-test@example.com");
    const result = await sendFundedAccountActivatedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { accountId: "fa-test-1", accountSize: "150,000", status: "ACTIVE" },
    );

    assert.equal(result.success, true, `Funded account activated email should succeed: ${result.error}`);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId! } });
    assert.equal(delivery?.template, "FUNDED_ACCOUNT_ACTIVATED");
    assert.equal(delivery?.recipient, trader.email);
    assert.equal(delivery?.status, "SENT");
    assert.equal(delivery?.traderId, trader.id);
  });

  it("should send account status changed email on status transition", async () => {
    const trader = await createTrader("status-changed-test@example.com");
    const result = await sendAccountStatusChangedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { accountId: "fa-test-2", oldStatus: "APPROVED", newStatus: "ACTIVE", reason: "Manual approval" },
    );

    assert.equal(result.success, true, `Account status changed email should succeed: ${result.error}`);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId! } });
    assert.equal(delivery?.template, "ACCOUNT_STATUS_CHANGED");
    assert.equal(delivery?.recipient, trader.email);
    assert.equal(delivery?.status, "SENT");
    assert.equal(delivery?.traderId, trader.id);
  });

  it("should send rule breach email with violation details", async () => {
    const trader = await createTrader("rule-breach-test@example.com");
    const result = await sendRuleBreachEmail(
      "MT5-999999",
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { violationType: "MAX_DRAWDOWN_EXCEEDED", detectedAt: new Date().toISOString(), currentStatus: "BREACH_CONFIRMED" },
    );

    assert.equal(result.success, true, `Rule breach email should succeed: ${result.error}`);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId! } });
    assert.equal(delivery?.template, "RULE_BREACH_CONFIRMED");
    assert.equal(delivery?.recipient, trader.email);
    assert.equal(delivery?.status, "SENT");
    assert.equal(delivery?.traderId, trader.id);
  });

  it("should send payout requested email (template ready)", async () => {
    const trader = await createTrader("payout-requested-test@example.com");
    const result = await sendPayoutRequestedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { requestId: "payout-1", amount: 5000, currency: "USD", status: "PENDING_REVIEW" },
    );

    assert.equal(result.success, true, `Payout requested email should succeed: ${result.error}`);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId! } });
    assert.equal(delivery?.template, "PAYOUT_REQUESTED");
    assert.equal(delivery?.recipient, trader.email);
    assert.equal(delivery?.status, "SENT");
  });

  it("should send payout approved email (template ready)", async () => {
    const trader = await createTrader("payout-approved-test@example.com");
    const result = await sendPayoutApprovedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { requestId: "payout-2", amount: 5000, currency: "USD" },
    );

    assert.equal(result.success, true, `Payout approved email should succeed: ${result.error}`);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId! } });
    assert.equal(delivery?.template, "PAYOUT_APPROVED");
    assert.equal(delivery?.status, "SENT");
  });

  it("should send payout rejected email (template ready)", async () => {
    const trader = await createTrader("payout-rejected-test@example.com");
    const result = await sendPayoutRejectedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { requestId: "payout-3", amount: 5000, currency: "USD", reason: "Insufficient equity" },
    );

    assert.equal(result.success, true, `Payout rejected email should succeed: ${result.error}`);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId! } });
    assert.equal(delivery?.template, "PAYOUT_REJECTED");
    assert.equal(delivery?.status, "SENT");
  });

  it("should send system alert email", async () => {
    const trader = await createTrader("system-alert-test@example.com");
    const result = await sendSystemAlertEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { title: "Maintenance Notice", message: "Scheduled maintenance on Oct 1st", alertId: "alert-1" },
    );

    assert.equal(result.success, true, `System alert email should succeed: ${result.error}`);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: result.deliveryId! } });
    assert.equal(delivery?.template, "SYSTEM_ALERT");
    assert.equal(delivery?.recipient, trader.email);
    assert.equal(delivery?.status, "SENT");
  });
});

describe("Email Idempotency", () => {
  let idempotencyKey: string;

  before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "EmailDelivery" CASCADE');
    idempotencyKey = generateIdempotencyKey("test-idempotency", "trader-1");
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("should skip duplicate send with same idempotency key (already SENT)", async () => {
    const trader = await createTrader("idempotency-test@example.com");

    const result1 = await sendEvaluationStartedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { evaluationId: "eval-idem-1", productName: "Challenge", accountSize: "100K" },
    );
    assert.equal(result1.success, true);

    const firstDelivery = await prisma.emailDelivery.findUnique({ where: { id: result1.deliveryId! } });
    assert.equal(firstDelivery?.status, "SENT");
    assert.equal(firstDelivery?.attemptCount, 1);

    const sentCountBefore = await prisma.emailDelivery.count({
      where: { status: "SENT", traderId: trader.id },
    });

    const result2 = await sendEvaluationStartedEmail(
      { id: trader.id, email: trader.email, firstName: trader.firstName ?? undefined },
      { evaluationId: "eval-idem-1", productName: "Challenge", accountSize: "100K" },
    );

    assert.equal(result2.success, true);
    assert.equal(result2.deliveryId, result1.deliveryId, "Should return the same delivery ID");

    const sentCountAfter = await prisma.emailDelivery.count({
      where: { status: "SENT", traderId: trader.id },
    });
    assert.equal(sentCountAfter, sentCountBefore, "No new SENT delivery should be created");
  });

  it("should generate deterministic idempotency keys", () => {
    const key1 = generateIdempotencyKey("evaluation-started", "eval-123");
    const key2 = generateIdempotencyKey("evaluation-started", "eval-123");
    assert.equal(key1, key2, "Same inputs should produce same key");
  });

  it("should generate different idempotency keys for different inputs", () => {
    const key1 = generateIdempotencyKey("evaluation-started", "eval-123");
    const key2 = generateIdempotencyKey("evaluation-started", "eval-456");
    assert.notEqual(key1, key2, "Different inputs should produce different keys");
  });
});

describe("Logger Sanitization", () => {
  it("should sanitize sensitive values in metadata", () => {
    const sanitizedOutput: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => { sanitizedOutput.push(msg); };

    try {
      const logger = createLogger({ environment: "production" });
      logger.error("TEST", "Password reset failed", {
        metadata: { password: "secret123", token: "abc456", apiKey: "key789" },
      });
    } finally {
      console.log = originalLog;
    }

    const lastOutput = sanitizedOutput[sanitizedOutput.length - 1];
    const entry = JSON.parse(lastOutput);
    assert.equal(entry.metadata.password, "***REDACTED***");
    assert.equal(entry.metadata.token, "***REDACTED***");
    assert.equal(entry.metadata.apiKey, "***REDACTED***");
  });

  it("should sanitize sensitive values in error messages", () => {
    const errorOutput: string[] = [];
    const originalError = console.error;
    console.error = (msg: string) => { errorOutput.push(msg); };

    try {
      const logger = createLogger({ environment: "production" });
      logger.error("TEST", "SMTP connection failed", {
        error: {
          code: "AUTH_FAILED",
          message: "password=hunter2 token=abc123 secret=mykey",
          stack: "Error: password=hunter2",
        },
      });
    } finally {
      console.error = originalError;
    }

    const output = errorOutput.join("\n");
    assert.ok(!output.includes("hunter2"), "Password value must not appear in logs");
    assert.ok(!output.includes("abc123"), "Token value must not appear in logs");
    assert.ok(!output.includes("mykey"), "Secret value must not appear in logs");
  });

  it("should sanitize Bearer tokens in strings", () => {
    const sanitizedOutput: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => { sanitizedOutput.push(msg); };

    try {
      const logger = createLogger({ environment: "production" });
      logger.error("TEST", "API auth check", {
        metadata: { authHeader: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" },
      });
    } finally {
      console.log = originalLog;
    }

    const lastOutput = sanitizedOutput[sanitizedOutput.length - 1];
    const entry = JSON.parse(lastOutput);
    assert.equal(entry.metadata.authHeader, "***REDACTED***");
  });

  it("should preserve safe error code and stack", () => {
    const logOutput: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => { logOutput.push(msg); };

    try {
      const logger = createLogger({ environment: "production" });
      logger.error("TEST", "Something went wrong", {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid email format",
          stack: "Error: Invalid email format\n    at validate (app.js:10)",
        },
      });
    } finally {
      console.log = originalLog;
    }

    const lastOutput = logOutput[logOutput.length - 1];
    const entry = JSON.parse(lastOutput);
    assert.equal(entry.error.code, "VALIDATION_ERROR");
    assert.equal(entry.error.message, "Invalid email format");
    assert.ok(entry.error.stack, "Stack should be preserved");
  });
});

describe("Token URL Security", () => {
  it("should use fragment for verification token (not query string)", () => {
    const url = buildTokenUrl("/verify-email", "my-secret-token");
    assert.ok(url.includes("#my-secret-token"), "URL should contain #token");
    assert.ok(!url.includes("?token="), "URL must NOT contain ?token=");
    assert.ok(!url.includes("?token=my-secret-token"), "URL must NOT contain token as query param");
  });

  it("should use fragment for reset token (not query string)", () => {
    const url = buildTokenUrl("/reset-password", "reset-secret-token");
    assert.ok(url.includes("#reset-secret-token"), "URL should contain #token");
    assert.ok(!url.includes("?token="), "URL must NOT contain ?token=");
  });

  it("should extract token from fragment correctly", () => {
    const token = extractTokenFromHash("#my-secret-token");
    assert.equal(token, "my-secret-token");
  });

  it("should extract token from fragment without leading hash", () => {
    const token = extractTokenFromHash("my-secret-token");
    assert.equal(token, "my-secret-token");
  });

  it("should extract token from fragment with additional params", () => {
    const token = extractTokenFromHash("#my-secret-token?redirect=/dashboard");
    assert.equal(token, "my-secret-token");
  });

  it("should return null for empty hash", () => {
    assert.equal(extractTokenFromHash(""), null);
    assert.equal(extractTokenFromHash("#"), null);
  });
});
