import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, MT5Account, AccountAssignment, MT5AccountPurpose, AccountStatus, AuditAction } from "@prisma/client";
import { allocateAccount, AllocateAccountResult } from "../lib/allocation";
import { releaseAccount, ReleaseReason } from "../lib/release";
import { runCleanupSteps, assertCleanup, type CleanupResult } from "../lib/cleanup-helper";

const HAS_DB = process.env.DATABASE_URL !== undefined;

const TEST_PREFIX = "ALLOC-INTEG";

function genEmail(seed: string): string {
  return `${TEST_PREFIX}-${seed}@test.example`;
}

async function cleanup(prisma: PrismaClient): Promise<CleanupResult> {
  const steps = [
    { label: "orderItem.deleteMany", fn: () => prisma.orderItem.deleteMany({}) },
    { label: "ledgerEntry.deleteMany", fn: () => prisma.ledgerEntry.deleteMany({}) },
    { label: "order.deleteMany", fn: () => prisma.order.deleteMany({}) },
    { label: "auditLog.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE` },
    { label: "evaluation.deleteMany", fn: () => prisma.evaluation.deleteMany({}) },
    { label: "accountAssignment.deleteMany", fn: () => prisma.accountAssignment.deleteMany({}) },
    { label: "rulesetVersion.deleteMany", fn: () => prisma.rulesetVersion.deleteMany({}) },
    { label: "ruleset.deleteMany", fn: () => prisma.ruleset.deleteMany({}) },
    { label: "mT5Account.deleteMany", fn: () => prisma.mT5Account.deleteMany({}) },
    { label: "trader.deleteMany", fn: () => prisma.trader.deleteMany({}) },
  ];
  return runCleanupSteps(prisma, steps);
}

async function createEvaluation(prisma: PrismaClient, traderId: string) {
  const ruleset = await prisma.ruleset.create({ data: { name: `${TEST_PREFIX}-RS-${traderId.slice(0, 8)}` } });
  const version = await prisma.rulesetVersion.create({
    data: { rulesetId: ruleset.id, version: "1.0", status: "PUBLISHED" },
  });
  return prisma.evaluation.create({
    data: { traderId, rulesetVersionId: version.id, status: "IN_PROGRESS" },
  });
}

describe("Integration Tests (require PostgreSQL)", () => {
  let prisma: PrismaClient;

  before(async () => {
    if (!HAS_DB) {
      console.log("SKIPPED: DATABASE_URL not configured — integration tests require PostgreSQL");
      return;
    }
    prisma = new PrismaClient();
    const initialCleanup = await cleanup(prisma);
    assertCleanup(initialCleanup, "integration initial cleanup");
  });

  after(async () => {
    if (!HAS_DB) return;
    const finalCleanup = await cleanup(prisma);
    assertCleanup(finalCleanup, "integration final cleanup");
    await prisma.$disconnect();
  });

  afterEach(async () => {
    if (!HAS_DB) return;
    const result = await cleanup(prisma);
    if (!result.succeeded) {
      console.error("CLEANUP FAILURE: integration afterEach cleanup failed");
      process.exitCode = 1;
    }
  });

  if (!HAS_DB) {
    it("skipped", async () => {});
    return;
  }

  describe("Successful Allocation", () => {
    it("should allocate an available account to a trader", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader1"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader.id);
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-001`, status: "AVAILABLE", accountSize: 100 },
      });

      const result = await allocateAccount(prisma, { traderId: trader.id });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.account.id, account.id);
        assert.equal(result.account.status, "IN_USE");
        assert.equal(result.assignment.traderId, trader.id);
        assert.equal(result.assignment.accountId, account.id);
        assert.equal(result.assignment.status, "ASSIGNED");
      }
    });
  });

  describe("No Eligible Account Available", () => {
    it("should fail when no AVAILABLE account exists", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader2"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader.id);
      await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-002`, status: "IN_USE", accountSize: 100 },
      });

      const result = await allocateAccount(prisma, { traderId: trader.id });

      assert.equal(result.success, false);
      assert.equal((result as { error: string }).error, "No available accounts matching criteria");
    });
  });

  describe("Account Status Update", () => {
    it("should update account status to IN_USE after allocation", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader3"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader.id);
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-003`, status: "AVAILABLE", accountSize: 200 },
      });

      const result = await allocateAccount(prisma, { traderId: trader.id });

      assert.equal(result.success, true);
      if (result.success) {
        const updated = await prisma.mT5Account.findUnique({ where: { id: account.id } });
        assert.equal(updated?.status, "IN_USE");
      }
    });
  });

  describe("Assignment Creation", () => {
    it("should create an AccountAssignment record", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader4"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader.id);
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-004`, status: "AVAILABLE", accountSize: 50 },
      });

      const result = await allocateAccount(prisma, { traderId: trader.id });

      assert.equal(result.success, true);
      if (result.success) {
        const assignment = await prisma.accountAssignment.findUnique({
          where: { id: result.assignment.id },
        });
        assert.notEqual(assignment, null);
        assert.equal(assignment?.traderId, trader.id);
        assert.equal(assignment?.accountId, account.id);
        assert.equal(assignment?.status, "ASSIGNED");
      }
    });
  });

  describe("Audit Log Creation", () => {
    it("should create an audit log entry on allocation", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader5"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader.id);
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-005`, status: "AVAILABLE", accountSize: 75 },
      });

      const result = await allocateAccount(prisma, { traderId: trader.id });

      assert.equal(result.success, true);
      if (result.success) {
        const auditLogs = await prisma.auditLog.findMany({
          where: { entityId: account.id, action: "ACCOUNT_ASSIGNED" },
        });
        assert.equal(auditLogs.length >= 1, true);
        const log = auditLogs.find((l) => l.performedBy === trader.id);
        assert.notEqual(log, undefined);
        const details = log?.details as Record<string, unknown>;
        assert.equal(typeof details?.accountNumber, "string");
        assert.equal(typeof details?.assignmentId, "string");
        assert.equal(details?.credentials, undefined);
        assert.equal(details?.password, undefined);
      }
    });
  });

  describe("Transaction Rollback", () => {
    it("should rollback when assignment creation fails", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader6"), password: "TestPass123", role: "TRADER" },
      });
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-006`, status: "AVAILABLE", accountSize: 100 },
      });

      const brokenPrisma = new PrismaClient();
      let rolledBack = false;
      try {
        await brokenPrisma.$transaction(async (tx) => {
          const acct = await tx.mT5Account.findFirst({
            where: { id: account.id, status: "AVAILABLE" },
          });
          if (!acct) return;
          await tx.mT5Account.update({ where: { id: acct.id }, data: { status: "IN_USE" } });
          await tx.accountAssignment.create({
            data: {
              traderId: trader.id,
              accountId: acct.id,
              status: "ASSIGNED",
            },
          });
          await tx.$executeRaw`SELECT 1/0`;
        });
      } catch {
        rolledBack = true;
      }

      const finalAccount = await brokenPrisma.mT5Account.findUnique({ where: { id: account.id } });
      const finalAssignment = await brokenPrisma.accountAssignment.count({
        where: { accountId: account.id, traderId: trader.id, status: "ASSIGNED" },
      });

      assert.equal(rolledBack, true);
      assert.equal(finalAccount?.status, "AVAILABLE", "Account status should be AVAILABLE after rollback");
      assert.equal(finalAssignment, 0, "No assignment should exist after rollback");

      await brokenPrisma.$disconnect();
    });
  });

  describe("Duplicate Active Assignment Prevention", () => {
    it("should prevent duplicate active assignments via database constraint", async () => {
      const trader1 = await prisma.trader.create({
        data: { email: genEmail("trader7a"), password: "TestPass123", role: "TRADER" },
      });
      const trader2 = await prisma.trader.create({
        data: { email: genEmail("trader7b"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader1.id);
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-007`, status: "AVAILABLE", accountSize: 100 },
      });

      const result1 = await allocateAccount(prisma, { traderId: trader1.id });
      assert.equal(result1.success, true);

      try {
        await prisma.accountAssignment.create({
          data: { traderId: trader2.id, accountId: account.id, status: "ASSIGNED" },
        });
        assert.fail("Should have thrown duplicate key error");
      } catch (e: unknown) {
        const err = e as unknown as { code: string };
        assert.equal(err.code === "P2002" || err.code === "23505", true, "Expected unique constraint violation");
      }

      await prisma.accountAssignment.delete({
        where: { id: (result1 as { success: true; assignment: AccountAssignment }).assignment.id },
      });
    });
  });

  describe("Invalid Account Eligibility", () => {
    it("should not allocate an IN_USE account", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader8"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader.id);
      await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-008`, status: "IN_USE", accountSize: 100 },
      });

      const result = await allocateAccount(prisma, { traderId: trader.id });

      assert.equal(result.success, false);
      assert.equal((result as { error: string }).error, "No available accounts matching criteria");
    });

    it("should not allocate an account below minimum size", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader9"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader.id);
      await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-009`, status: "AVAILABLE", accountSize: 50 },
      });

      const result = await allocateAccount(prisma, { traderId: trader.id, minAccountSize: 100 });

      assert.equal(result.success, false);
      assert.equal((result as { error: string }).error, "No available accounts matching criteria");
    });
  });

  describe("Assignment History Preservation", () => {
    it("should allow historical assignments while preventing active duplicates", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader10"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader.id);
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-010`, status: "AVAILABLE", accountSize: 100 },
      });

      const result1 = await allocateAccount(prisma, { traderId: trader.id });
      assert.equal(result1.success, true);

      const assignmentId = (result1 as { success: true; assignment: AccountAssignment }).assignment.id;

      await prisma.accountAssignment.update({
        where: { id: assignmentId },
        data: { status: "RETURNED", returnedAt: new Date() },
      });

      await prisma.mT5Account.update({
        where: { id: account.id },
        data: { status: "AVAILABLE", updatedAt: new Date() },
      });

      const result2 = await allocateAccount(prisma, { traderId: trader.id });
      assert.equal(result2.success, true, "Should allow reallocation after RETURNED and AVAILABLE reset");

      const allAssignments = await prisma.accountAssignment.findMany({
        where: { accountId: account.id },
      });
      assert.equal(allAssignments.length, 2, "Should have two historical assignments");
      assert.equal(allAssignments[0].status, "RETURNED");
      assert.equal(allAssignments[1].status, "ASSIGNED");
    });
  });

  describe("Account Release", () => {
    it("should release an allocated account successfully", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader-rel"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader.id);
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-REL`, status: "AVAILABLE", accountSize: 100 },
      });

      const allocResult = await allocateAccount(prisma, { traderId: trader.id });
      assert.equal(allocResult.success, true);

      const result = await releaseAccount(prisma, {
        traderId: trader.id,
        accountId: account.id,
        reason: "EVALUATION_COMPLETED",
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.account.status, "AVAILABLE");
        assert.equal(result.evaluationUpdated, true);
        assert.equal(result.evaluationStatus, "PASSED");
      }

      const assignment = await prisma.accountAssignment.findUnique({
        where: { id: (allocResult as { success: true; assignment: AccountAssignment }).assignment.id },
      });
      assert.equal(assignment?.status, "RETURNED");
      assert.notEqual(assignment?.returnedAt, null);
    });

    it("should fail to release another trader's assignment without override", async () => {
      const trader1 = await prisma.trader.create({
        data: { email: genEmail("trader-rel2a"), password: "TestPass123", role: "TRADER" },
      });
      const trader2 = await prisma.trader.create({
        data: { email: genEmail("trader-rel2b"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader1.id);
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-REL2`, status: "AVAILABLE", accountSize: 100 },
      });

      const allocResult = await allocateAccount(prisma, { traderId: trader1.id });
      assert.equal(allocResult.success, true);

      const result = await releaseAccount(prisma, {
        traderId: trader2.id,
        accountId: account.id,
        reason: "ADMINISTRATIVE_CORRECTION",
      });

      assert.equal(result.success, false);
      assert.equal((result as { error: string }).error, "Not authorized to release another trader's assignment");
    });

    it("should allow release with admin override", async () => {
      const trader1 = await prisma.trader.create({
        data: { email: genEmail("trader-rel3a"), password: "TestPass123", role: "TRADER" },
      });
      const trader2 = await prisma.trader.create({
        data: { email: genEmail("trader-rel3b"), password: "TestPass123", role: "TRADER" },
      });
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-REL3`, status: "IN_USE", accountSize: 100 },
      });

      await prisma.accountAssignment.create({
        data: { traderId: trader1.id, accountId: account.id, status: "ASSIGNED" },
      });

      const result = await releaseAccount(prisma, {
        traderId: trader2.id,
        accountId: account.id,
        reason: "ADMINISTRATIVE_CORRECTION",
        isAdminOverride: true,
      });

      assert.equal(result.success, true);
      assert.equal((result as { success: true; account: MT5Account }).account.status, "AVAILABLE");
    });

    it("should preserve assignment history after release", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader-rel4"), password: "TestPass123", role: "TRADER" },
      });
      await createEvaluation(prisma, trader.id);
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-REL4`, status: "AVAILABLE", accountSize: 100 },
      });

      const allocResult = await allocateAccount(prisma, { traderId: trader.id });
      assert.equal(allocResult.success, true);

      const releaseResult = await releaseAccount(prisma, {
        traderId: trader.id,
        accountId: account.id,
        reason: "EVALUATION_FAILED",
      });
      assert.equal(releaseResult.success, true);

      const allAssignments = await prisma.accountAssignment.findMany({
        where: { accountId: account.id },
        orderBy: { createdAt: "asc" },
      });
      assert.equal(allAssignments.length, 1, "Should have one assignment (updated to RETURNED)");
      assert.equal(allAssignments[0].status, "RETURNED");
      assert.notEqual(allAssignments[0].returnedAt, null);
    });

    it("should fail to release an account with no active assignment", async () => {
      const trader = await prisma.trader.create({
        data: { email: genEmail("trader-rel5"), password: "TestPass123", role: "TRADER" },
      });
      const account = await prisma.mT5Account.create({
        data: { accountNumber: `${TEST_PREFIX}-ACCT-REL5`, status: "AVAILABLE", accountSize: 100 },
      });

      const result = await releaseAccount(prisma, {
        traderId: trader.id,
        accountId: account.id,
        reason: "EVALUATION_COMPLETED",
      });

      assert.equal(result.success, false);
      assert.equal((result as { error: string }).error, "No active assignment found for this account");
    });
  });
});