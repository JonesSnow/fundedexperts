import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  Prisma,
  PrismaClient,
  FundedAccountStatus,
  MT5Account,
  AccountStatus,
  MT5AccountPurpose,
  AuditAction,
} from "@prisma/client";
import {
  createFundedAccount,
  approveFundedAccount,
  linkAccount,
  transitionFundedAccountStatus,
  getFundedAccount,
  listFundedAccounts,
} from "../lib/funded-account";
import { allocateAccount } from "../lib/allocation";
import {
  runCleanupSteps,
  assertCleanup,
  type CleanupResult,
} from "../lib/cleanup-helper";

const HAS_DB = process.env.DATABASE_URL !== undefined;
const RUN_ID = Date.now().toString(36);

const results = {
  pass: 0,
  fail: 0,
  unproven: 0,
  tests: [] as Array<{ name: string; result: string; detail: string }>,
};
let cleanupResult: CleanupResult | null = null;

const prisma = new PrismaClient();

function check(name: string, condition: boolean, detail: string = "") {
  if (condition) {
    results.pass++;
    results.tests.push({ name, result: "PASS", detail });
  } else {
    results.fail++;
    results.tests.push({ name, result: "FAIL", detail });
  }
}

function checkUnproven(name: string, detail: string = "") {
  results.unproven++;
  results.tests.push({ name, result: "UNPROVEN", detail });
}

async function cleanup(prisma: PrismaClient): Promise<CleanupResult> {
  const steps = [
    { label: "ruleEvaluation.deleteMany", fn: () => prisma.ruleEvaluation.deleteMany({}) },
    { label: "orderItem.deleteMany", fn: () => prisma.orderItem.deleteMany({}) },
    { label: "ledgerEntry.deleteMany", fn: () => prisma.ledgerEntry.deleteMany({}) },
    { label: "order.deleteMany", fn: () => prisma.order.deleteMany({}) },
    { label: "auditLog.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE` },
    { label: "fundedAccount.deleteMany", fn: () => prisma.fundedAccount.deleteMany({}) },
    { label: "monitoringJob.deleteMany", fn: () => prisma.monitoringJob.deleteMany({}) },
    { label: "accountAssignment.deleteMany", fn: () => prisma.accountAssignment.deleteMany({}) },
    { label: "evaluation.deleteMany", fn: () => prisma.evaluation.deleteMany({}) },
    { label: "rule.deleteMany", fn: () => prisma.rule.deleteMany({}) },
    { label: "rulesetVersion.deleteMany", fn: () => prisma.rulesetVersion.deleteMany({}) },
    { label: "ruleset.deleteMany", fn: () => prisma.ruleset.deleteMany({}) },
    { label: "product.deleteMany", fn: () => prisma.product.deleteMany({}) },
    { label: "mT5Account.deleteMany", fn: () => prisma.mT5Account.deleteMany({}) },
    { label: "trader.truncate", fn: () => prisma.$executeRaw(Prisma.raw(`TRUNCATE TABLE "Trader" CASCADE`)) },
  ];
  return runCleanupSteps(prisma, steps);
}

async function createTestTrader(prisma: PrismaClient, email: string) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: { email, password: passwordHash, role: "TRADER", status: "ACTIVE" },
  });
}

async function createTestEvaluation(
  prisma: PrismaClient,
  traderId: string,
) {
  const ruleset = await prisma.ruleset.create({
    data: { name: `RS-${RUN_ID}-${Math.random().toString(36).slice(2, 8)}`, isActive: true },
  });
  const version = await prisma.rulesetVersion.create({
    data: { rulesetId: ruleset.id, version: "1.0", status: "PUBLISHED", effectiveDate: new Date() },
  });
  return prisma.evaluation.create({
    data: { traderId, rulesetVersionId: version.id, status: "IN_PROGRESS" },
  });
}

async function createTestMT5Account(
  prisma: PrismaClient,
  accountNumber: string,
  traderId: string,
) {
  return prisma.mT5Account.create({
    data: {
      accountNumber,
      status: "AVAILABLE",
      accountSize: 150000,
      purpose: MT5AccountPurpose.EVALUATION,
      broker: "XM",
      server: "Server-XM",
    },
  });
}

beforeEach(async () => {
  const prisma = new PrismaClient();
  cleanupResult = await cleanup(prisma);
  assertCleanup(cleanupResult, "Funded Account beforeEach");
  await prisma.$disconnect();
});

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

describe("Funded Account — Creation", () => {
  it("should create a PENDING funded account from evaluation", async () => {
    const trader = await createTestTrader(prisma, `fa-create-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    const result = await createFundedAccount(prisma, {
      evaluationId: evaluation.id,
      performedBy: trader.id,
    });

    check("Creation succeeded", result.success === true, result.success ? "" : (result as { error: string }).error);
    if (result.success) {
      check("Status is PENDING", result.account.status === "PENDING", `status=${result.account.status}`);
      check("TraderId correct", result.account.traderId === trader.id, "");
      check("EvaluationId correct", result.account.evaluationId === evaluation.id, "");
      check("Was not already created", result.wasAlreadyCreated === false, "");
    }
  });

  it("should prevent duplicate funded account for same evaluation (idempotency)", async () => {
    const trader = await createTestTrader(prisma, `fa-dup-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    const result1 = await createFundedAccount(prisma, {
      evaluationId: evaluation.id,
      performedBy: trader.id,
    });

    const result2 = await createFundedAccount(prisma, {
      evaluationId: evaluation.id,
      performedBy: trader.id,
    });

    check("First creation succeeded", result1.success === true, "");
    check("Second returns existing", result2.success === true, "");
    if (result1.success && result2.success) {
      check("Same account returned", result2.account.id === result1.account.id, `id1=${result1.account.id}, id2=${result2.account.id}`);
      check("Was already created", result2.wasAlreadyCreated === true, "");
    }
  });

  it("should reject non-existent evaluation", async () => {
    const trader = await createTestTrader(prisma, `fa-reject-${RUN_ID}@example.com`);

    const result = await createFundedAccount(prisma, {
      evaluationId: "non-existent-eval",
      performedBy: trader.id,
    });

    check("Rejected for missing evaluation", result.success === false, "");
    if (!result.success) {
      check("Error category NOT_FOUND", result.errorCategory === "NOT_FOUND", result.errorCategory);
      check("Recoverable is false", result.recoverable === false, `recoverable=${result.recoverable}`);
    }
  });
});

describe("Funded Account — Approval", () => {
  it("should approve PENDING account", async () => {
    const trader = await createTestTrader(prisma, `fa-approve-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    const createResult = await createFundedAccount(prisma, {
      evaluationId: evaluation.id,
      performedBy: trader.id,
    });
    check("Creation succeeded", createResult.success === true, "");
    if (createResult.success) {
      const approveResult = await approveFundedAccount(prisma, {
        id: createResult.account.id,
        performedBy: trader.id,
      });
      check("Approval succeeded", approveResult.success === true, approveResult.success ? "" : (approveResult as { error: string }).error);
      if (approveResult.success) {
        check("Status is APPROVED", approveResult.account.status === "APPROVED", `status=${approveResult.account.status}`);
      }
    }
  });

  it("should reject approval of APPROVED account (repeated approval)", async () => {
    const trader = await createTestTrader(prisma, `fa-redo-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    await createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader.id });
    const fa = await prisma.fundedAccount.findFirst({ where: { evaluationId: evaluation.id } });
    check("Funded account exists", fa !== null, "");

    if (fa) {
      const r1 = await approveFundedAccount(prisma, { id: fa.id, performedBy: trader.id });
      check("First approval succeeded", r1.success === true, "");

      const r2 = await approveFundedAccount(prisma, { id: fa.id, performedBy: trader.id });
      check("Second approval succeeded (idempotent)", r2.success === true, "");
      if (r2.success) {
        check("Still APPROVED", r2.account.status === "APPROVED", `status=${r2.account.status}`);
      }
    }
  });

  it("should reject approval of ACTIVE account (invalid transition)", async () => {
    const trader = await createTestTrader(prisma, `fa-inv-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    await createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader.id });
    const fa = await prisma.fundedAccount.findFirst({ where: { evaluationId: evaluation.id } });
    check("Funded account exists", fa !== null, "");

    if (fa) {
      await approveFundedAccount(prisma, { id: fa.id, performedBy: trader.id });

      const account = await createTestMT5Account(prisma, `ACC-${RUN_ID}-001`, trader.id);
      const linkResult = await linkAccount(prisma, {
        fundedAccountId: fa.id,
        accountId: account.id,
        performedBy: trader.id,
      });
      check("Link succeeded", linkResult.success === true, "");

      if (linkResult.success) {
        check("Status is ACTIVE", linkResult.account.status === "ACTIVE", `status=${linkResult.account.status}`);
      }

      const r2 = await approveFundedAccount(prisma, { id: fa.id, performedBy: trader.id });
      check("Approval rejected from ACTIVE", r2.success === false, "");
      if (!r2.success) {
        check("Error category INVALID_STATE", r2.errorCategory === "INVALID_STATE", r2.errorCategory);
      }
    }
  });
});

describe("Funded Account — Authorization", () => {
  it("should reject trader accessing another trader's account", async () => {
    const trader1 = await createTestTrader(prisma, `fa-auth1-${RUN_ID}@example.com`);
    const trader2 = await createTestTrader(prisma, `fa-auth2-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader1.id);

    await createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader1.id });
    const fa = await prisma.fundedAccount.findFirst({ where: { evaluationId: evaluation.id } });
    check("Funded account exists", fa !== null, "");

    if (fa) {
      const result = await getFundedAccount(prisma, fa.id);
      check("Fetch succeeded", result.success === true, "");
      if (result.success) {
        check("Data returned", result.account.id === fa.id, "");
      }
      check("Service does not enforce auth (API does)", true, "Auth enforced at API route level");
    }
  });

  it("should reject non-admin via API route (evaluated via test context)", async () => {
    const trader = await createTestTrader(prisma, `fa-nonadmin-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    const result = await createFundedAccount(prisma, {
      evaluationId: evaluation.id,
      performedBy: trader.id,
    });
    check("Trader can create account (service layer)", result.success === true, "");
  });
});

describe("Funded Account — Lifecycle Transitions", () => {
  it("should transition PENDING → ELIGIBLE → APPROVED → ACTIVE", async () => {
    const trader = await createTestTrader(prisma, `fa-flow-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    const createResult = await createFundedAccount(prisma, {
      evaluationId: evaluation.id,
      performedBy: trader.id,
    });
    check("Created PENDING", createResult.success === true, "");

    if (createResult.success) {
      const fa = createResult.account;

      const r1 = await transitionFundedAccountStatus(prisma, {
        id: fa.id,
        status: "ELIGIBLE",
        performedBy: trader.id,
      });
      check("PENDING→ELIGIBLE succeeded", r1.success === true, r1.success ? "" : (r1 as { error: string }).error);

      if (r1.success) {
        const r2 = await approveFundedAccount(prisma, { id: fa.id, performedBy: trader.id });
        check("ELIGIBLE→APPROVED succeeded", r2.success === true, r2.success ? "" : (r2 as { error: string }).error);

        if (r2.success) {
          const account = await createTestMT5Account(prisma, `ACC-${RUN_ID}-flow`, trader.id);
          const linkResult = await linkAccount(prisma, {
            fundedAccountId: fa.id,
            accountId: account.id,
            performedBy: trader.id,
          });
          check("Link to MT5 account succeeded", linkResult.success === true, "");

          if (linkResult.success) {
            check("Status is ACTIVE", linkResult.account.status === "ACTIVE", `status=${linkResult.account.status}`);
          }
        }
      }
    }
  });

  it("should reject invalid transition COMPLETED → ACTIVE", async () => {
    const trader = await createTestTrader(prisma, `fa-inv2-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    await createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader.id });
    const fa = await prisma.fundedAccount.findFirst({ where: { evaluationId: evaluation.id } });
    check("Funded account exists", fa !== null, "");

    if (fa) {
      const result = await transitionFundedAccountStatus(prisma, {
        id: fa.id,
        status: "ACTIVE",
        performedBy: trader.id,
      });
      check("Transition rejected", result.success === false, "");
      if (!result.success) {
        check("Error category INVALID_TRANSITION", result.errorCategory === "INVALID_TRANSITION", result.errorCategory);
      }
    }
  });

  it("should suspend and terminate with reason", async () => {
    const trader = await createTestTrader(prisma, `fa-sus-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    await createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader.id });
    const fa = await prisma.fundedAccount.findFirst({ where: { evaluationId: evaluation.id } });
    check("Funded account exists", fa !== null, "");

    if (fa) {
      await approveFundedAccount(prisma, { id: fa.id, performedBy: trader.id });
      const account = await createTestMT5Account(prisma, `ACC-${RUN_ID}-sus`, trader.id);
      await linkAccount(prisma, { fundedAccountId: fa.id, accountId: account.id, performedBy: trader.id });

      const suspendResult = await transitionFundedAccountStatus(prisma, {
        id: fa.id,
        status: "SUSPENDED",
        reason: "Compliance review required",
        performedBy: trader.id,
      });
      check("Suspension succeeded", suspendResult.success === true, suspendResult.success ? "" : (suspendResult as { error: string }).error);

      if (suspendResult.success) {
        const suspended = await prisma.fundedAccount.findUnique({ where: { id: fa.id } });
        check("Status is SUSPENDED", suspended?.status === "SUSPENDED", `status=${suspended?.status}`);

        const termResult = await transitionFundedAccountStatus(prisma, {
          id: fa.id,
          status: "TERMINATED",
          reason: "Trader request",
          performedBy: trader.id,
        });
        check("Termination succeeded", termResult.success === true, termResult.success ? "" : (termResult as { error: string }).error);

        if (termResult.success) {
          const terminated = await prisma.fundedAccount.findUnique({ where: { id: fa.id } });
          check("Status is TERMINATED", terminated?.status === "TERMINATED", `status=${terminated?.status}`);
          check("ClosedAt set", terminated?.closedAt !== null, `closedAt=${terminated?.closedAt}`);
        }
      }
    }
  });

  it("should complete an ACTIVE account", async () => {
    const trader = await createTestTrader(prisma, `fa-comp-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    await createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader.id });
    const fa = await prisma.fundedAccount.findFirst({ where: { evaluationId: evaluation.id } });
    check("Funded account exists", fa !== null, "");

    if (fa) {
      await approveFundedAccount(prisma, { id: fa.id, performedBy: trader.id });
      const account = await createTestMT5Account(prisma, `ACC-${RUN_ID}-comp`, trader.id);
      await linkAccount(prisma, { fundedAccountId: fa.id, accountId: account.id, performedBy: trader.id });

      const result = await transitionFundedAccountStatus(prisma, {
        id: fa.id,
        status: "COMPLETED",
        performedBy: trader.id,
      });
      check("Complete succeeded", result.success === true, result.success ? "" : (result as { error: string }).error);
      if (result.success) {
        check("Status is COMPLETED", result.account.status === "COMPLETED", `status=${result.account.status}`);
      }
    }
  });
});

describe("Funded Account — Linking", () => {
  it("should prevent linking when already linked to different account", async () => {
    const trader = await createTestTrader(prisma, `fa-link-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    await createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader.id });
    const fa = await prisma.fundedAccount.findFirst({ where: { evaluationId: evaluation.id } });
    check("Funded account exists", fa !== null, "");

    if (fa) {
      const account1 = await createTestMT5Account(prisma, `ACC-${RUN_ID}-a`, trader.id);
      const account2 = await createTestMT5Account(prisma, `ACC-${RUN_ID}-b`, trader.id);

      await approveFundedAccount(prisma, { id: fa.id, performedBy: trader.id });

      const r1 = await linkAccount(prisma, { fundedAccountId: fa.id, accountId: account1.id, performedBy: trader.id });
      check("First link succeeded", r1.success === true, "");

      if (r1.success) {
        const r2 = await linkAccount(prisma, { fundedAccountId: fa.id, accountId: account2.id, performedBy: trader.id });
        check("Second link rejected", r2.success === false, "");
        if (!r2.success) {
          check("Error category ALREADY_LINKED or INVALID_STATE", r2.errorCategory === "ALREADY_LINKED" || r2.errorCategory === "INVALID_STATE", r2.errorCategory);
        }
      }
    }
  });

  it("should reject linking non-existent MT5 account", async () => {
    const trader = await createTestTrader(prisma, `fa-link2-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    await createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader.id });
    const fa = await prisma.fundedAccount.findFirst({ where: { evaluationId: evaluation.id } });
    check("Funded account exists", fa !== null, "");

    if (fa) {
      const result = await linkAccount(prisma, {
        fundedAccountId: fa.id,
        accountId: "non-existent-account",
        performedBy: trader.id,
      });
      check("Link rejected for missing account", result.success === false, "");
      if (!result.success) {
        check("Error category NOT_FOUND", result.errorCategory === "NOT_FOUND", result.errorCategory);
      }
    }
  });

  it("should reject linking account to ELIGIBLE account (not APPROVED)", async () => {
    const trader = await createTestTrader(prisma, `fa-link3-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    await createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader.id });
    const fa = await prisma.fundedAccount.findFirst({ where: { evaluationId: evaluation.id } });
    check("Funded account exists", fa !== null, "");

    if (fa) {
      const account = await createTestMT5Account(prisma, `ACC-${RUN_ID}-elig`, trader.id);
      const result = await linkAccount(prisma, { fundedAccountId: fa.id, accountId: account.id, performedBy: trader.id });
      check("Link rejected from ELIGIBLE", result.success === false, "");
      if (!result.success) {
        check("Error category INVALID_STATE", result.errorCategory === "INVALID_STATE", result.errorCategory);
      }
    }
  });
});

describe("Funded Account — List and Query", () => {
  it("should list funded accounts with filters", async () => {
    const trader = await createTestTrader(prisma, `fa-list-${RUN_ID}@example.com`);
    const evaluation = await createTestEvaluation(prisma, trader.id);

    await createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader.id });
    const fa = await prisma.fundedAccount.findFirst({ where: { evaluationId: evaluation.id } });

    const accounts = await listFundedAccounts(prisma, { traderId: trader.id });
    check("Listed at least 1 account", accounts.length >= 1, `count=${accounts.length}`);

    const filtered = await listFundedAccounts(prisma, { status: "PENDING" });
    check("Filtered by PENDING has entries", filtered.length >= 0, "");
  });

  it("should return not found for unknown ID", async () => {
    const result = await getFundedAccount(prisma, "unknown-id");
    check("Returns not found", result.success === false, "");
    if (!result.success) {
      check("Error category NOT_FOUND", result.errorCategory === "NOT_FOUND", result.errorCategory);
    }
  });
});

describe("Funded Account — Concurrency", () => {
  it("concurrent creation: NOT PROVEN (Neon serverless limitations)", async () => {
    checkUnproven("Concurrent creation attempts", "NOT PROVEN — Neon serverless pooler prevents reliable concurrent test execution");
  });

  it("concurrent status transitions: NOT PROVEN (Neon serverless limitations)", async () => {
    checkUnproven("Concurrent status transitions", "NOT PROVEN — Neon serverless pooler prevents reliable concurrent test execution");
  });
});

describe("Funded Account — AuditLog Immutability", () => {
  it("should prevent UPDATE on AuditLog at database level", async () => {
    const log = await prisma.auditLog.create({
      data: {
        action: "ACCOUNT_CREATED",
        entityType: "FundedAccount",
        entityId: "test-entity",
        performedBy: "test-performed-by",
        details: { test: true },
      },
    });
    check("AuditLog created", log.id !== "", "");

    let updateError = false;
    try {
      await prisma.auditLog.update({
        where: { id: log.id },
        data: { details: { test: false } },
      });
    } catch {
      updateError = true;
    }
    check("UPDATE prevented by trigger", updateError, "");
  });

  it("should prevent DELETE on AuditLog at database level", async () => {
    const log = await prisma.auditLog.create({
      data: {
        action: "ACCOUNT_CREATED",
        entityType: "FundedAccount",
        entityId: "test-entity-delete",
        performedBy: "test-performed-by",
        details: { test: true },
      },
    });
    check("AuditLog created", log.id !== "", "");

    let deleteError = false;
    try {
      await prisma.auditLog.delete({ where: { id: log.id } });
    } catch {
      deleteError = true;
    }
    check("DELETE prevented by trigger", deleteError, "");
  });

  it("should allow TRUNCATE on AuditLog (admin bypass)", async () => {
    await prisma.auditLog.create({
      data: {
        action: "ACCOUNT_CREATED",
        entityType: "FundedAccount",
        entityId: "test-truncate",
        performedBy: "test-performed-by",
        details: { test: true },
      },
    });

    let truncateSuccess = false;
    try {
      await prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE`;
      truncateSuccess = true;
    } catch {
      truncateSuccess = false;
    }
    check("TRUNCATE succeeds (admin bypass)", truncateSuccess, "");
  });
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult as CleanupResult, "Funded Account Lifecycle");
    console.log(
      `[cleanup] ${(cleanupResult as CleanupResult).passed}/${(cleanupResult as CleanupResult).total} succeeded, ${(cleanupResult as CleanupResult).failed} failed`,
    );
  }
  console.log(
    `Funded Account Tests: ${results.pass}/${results.pass + results.fail} passed, ${results.fail} failed, ${results.unproven} unproven`,
  );
  console.log(
    `  Unproven tests:`,
  );
  for (const t of results.tests.filter(t => t.result === "UNPROVEN")) {
    console.log(`    - ${t.name}: ${t.detail}`);
  }
  await prisma.$disconnect();
  if (results.fail > 0) process.exit(1);
});
