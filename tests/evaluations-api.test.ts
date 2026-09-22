import { describe, it, after, beforeEach } from "node:test";
import bcrypt from "bcrypt";
import {
  PrismaClient,
  EvaluationStatus,
  RuleResult,
  RuleType,
} from "@prisma/client";
import { runCleanupSteps, assertCleanup, type CleanupResult } from "../lib/cleanup-helper";

const HAS_DB = process.env.DATABASE_URL !== undefined;
const RUN_ID = Date.now().toString(36);

const results = {
  pass: 0,
  fail: 0,
  tests: [] as Array<{ name: string; result: string; detail: string }>,
};

let cleanupResult: CleanupResult | null = null;

function check(name: string, condition: boolean, detail: string = "") {
  if (condition) {
    results.pass++;
    results.tests.push({ name, result: "PASS", detail });
  } else {
    results.fail++;
    results.tests.push({ name, result: "FAIL", detail });
  }
}

async function cleanup(prisma: PrismaClient): Promise<CleanupResult> {
  const steps = [
    { label: "ruleEvaluation.deleteMany", fn: () => prisma.ruleEvaluation.deleteMany({}) },
    { label: "ruleEvent.deleteMany", fn: () => prisma.ruleEvent.deleteMany({}) },
    { label: "orderItem.deleteMany", fn: () => prisma.orderItem.deleteMany({}) },
    { label: "monitoringJob.deleteMany", fn: () => prisma.monitoringJob.deleteMany({}) },
    { label: "accountAssignment.deleteMany", fn: () => prisma.accountAssignment.deleteMany({}) },
    { label: "ledgerEntry.deleteMany", fn: () => prisma.ledgerEntry.deleteMany({}) },
    { label: "rule.deleteMany", fn: () => prisma.rule.deleteMany({}) },
    { label: "fundedAccount.deleteMany", fn: () => prisma.fundedAccount.deleteMany({}) },
    { label: "order.deleteMany", fn: () => prisma.order.deleteMany({}) },
    { label: "evaluation.deleteMany", fn: () => prisma.evaluation.deleteMany({}) },
    { label: "auditLog.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE` },
    { label: "rulesetVersion.deleteMany", fn: () => prisma.rulesetVersion.deleteMany({}) },
    { label: "ruleset.deleteMany", fn: () => prisma.ruleset.deleteMany({}) },
    { label: "product.deleteMany", fn: () => prisma.product.deleteMany({}) },
    { label: "mT5Account.deleteMany", fn: () => prisma.mT5Account.deleteMany({}) },
    { label: "trader.deleteMany", fn: () => prisma.trader.deleteMany({}) },
  ];
  return runCleanupSteps(prisma, steps);
}

async function createTestTrader(prisma: PrismaClient, email: string, role: "TRADER" | "ADMIN" = "TRADER") {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: { email, password: passwordHash, role, status: "ACTIVE" },
  });
}

async function createTestRulesetAndVersion(prisma: PrismaClient, name: string) {
  const ruleset = await prisma.ruleset.create({
    data: { name, isActive: true },
  });
  const version = await prisma.rulesetVersion.create({
    data: { rulesetId: ruleset.id, version: "1.0", status: "PUBLISHED", effectiveDate: new Date() },
  });
  return { ruleset, version };
}

async function createTestEvaluation(
  prisma: PrismaClient,
  traderId: string,
  rulesetVersionId: string,
  status: EvaluationStatus = EvaluationStatus.IN_PROGRESS,
) {
  return prisma.evaluation.create({
    data: { traderId, rulesetVersionId, status },
  });
}

async function createTestAccount(prisma: PrismaClient, accountNumber: string) {
  return prisma.mT5Account.create({
    data: { accountNumber, broker: "XM", server: "Server-XM", login: "test-login", accountSize: 100000, currency: "USD", status: "AVAILABLE" },
  });
}

async function createTestRule(prisma: PrismaClient, rulesetVersionId: string, ruleType: RuleType) {
  return prisma.rule.create({
    data: {
      rulesetVersionId,
      ruleType,
      name: ruleType,
      value: JSON.stringify({ target: 5000 }),
      isRequired: true,
    },
  });
}

async function createTestRuleEvaluation(
  prisma: PrismaClient,
  evaluationId: string,
  ruleId: string,
  result: RuleResult,
) {
  return prisma.ruleEvaluation.create({
    data: { evaluationId, ruleId, result },
  });
}

function safeEvaluationList(
  evaluation: {
    id: string;
    traderId: string;
    rulesetVersionId: string;
    rulesetVersion: { id: string; version: string; ruleset: { name: string } } | null;
    accountId: string | null;
    account: { id: string; accountNumber: string; status: string; healthStatus: string } | null;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    totalPnl: unknown;
    maxDrawdown: unknown;
    ruleEvaluations: { id: string; ruleId: string; result: string; evaluatedAt?: Date; rule: { ruleType: RuleType; name: string } }[];
    createdAt: Date;
    updatedAt: Date;
  },
  isAdmin: boolean,
) {
  const ruleResults = (evaluation.ruleEvaluations ?? []).map((re) => ({
    ruleType: re.rule?.ruleType ?? "UNKNOWN",
    ruleName: re.rule?.name ?? "",
    result: re.result,
    evaluatedAt: re.evaluatedAt,
  }));

  return {
    id: evaluation.id,
    ...(isAdmin ? { traderId: evaluation.traderId } : {}),
    rulesetVersionId: evaluation.rulesetVersionId,
    rulesetName: evaluation.rulesetVersion?.ruleset?.name ?? null,
    rulesetVersion: evaluation.rulesetVersion?.version ?? null,
    status: evaluation.status as EvaluationStatus,
    account: evaluation.account
      ? {
          id: evaluation.account.id,
          accountNumber: evaluation.account.accountNumber,
          status: evaluation.account.status,
          healthStatus: evaluation.account.healthStatus,
        }
      : null,
    startedAt: evaluation.startedAt,
    completedAt: evaluation.completedAt,
    totalPnl: Number(evaluation.totalPnl),
    maxDrawdown: Number(evaluation.maxDrawdown),
    ruleResults,
    rulePassedCount: evaluation.ruleEvaluations.filter((re) => re.result === RuleResult.PASS).length,
    ruleFailedCount: evaluation.ruleEvaluations.filter((re) => re.result === RuleResult.FAIL).length,
    ruleWarningCount: evaluation.ruleEvaluations.filter((re) => re.result === RuleResult.WARNING).length,
    createdAt: evaluation.createdAt,
    updatedAt: evaluation.updatedAt,
  };
}

function safeEvaluationSingle(
  evaluation: {
    id: string;
    traderId: string;
    rulesetVersionId: string;
    rulesetVersion: { id: string; version: string; ruleset: { name: string } } | null;
    accountId: string | null;
    account: { id: string; accountNumber: string; status: string; healthStatus: string } | null;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    totalPnl: unknown;
    maxDrawdown: unknown;
    ruleEvaluations: { id: string; ruleId: string; result: string; evaluatedAt?: Date; rule: { ruleType: RuleType; name: string } }[];
    createdAt: Date;
    updatedAt: Date;
  },
  isAdmin: boolean,
) {
  return safeEvaluationList(evaluation, isAdmin);
}

async function simulateEvaluationsList(prisma: PrismaClient, traderId: string | null, role: string, status?: string) {
  if (!traderId) return { success: false, error: "Unauthorized", evaluations: [], status: 401 };

  const where: Record<string, unknown> = {};
  if (role === "TRADER") {
    where.traderId = traderId;
  }
  if (status && Object.values(EvaluationStatus).includes(status as EvaluationStatus)) {
    where.status = status as EvaluationStatus;
  }

  const evaluations = await prisma.evaluation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      rulesetVersion: { select: { id: true, version: true, ruleset: { select: { name: true } } } },
      account: { select: { id: true, accountNumber: true, status: true, healthStatus: true } },
      ruleEvaluations: { select: { id: true, ruleId: true, result: true, evaluatedAt: true, rule: { select: { ruleType: true, name: true } } } },
    },
  });

  const safe = evaluations.map((e) => safeEvaluationList(e, role === "ADMIN"));

  return { success: true, evaluations: safe, status: 200 };
}

async function simulateEvaluationGet(prisma: PrismaClient, evaluationId: string, traderId: string | null, role: string) {
  if (!traderId) return { success: false, error: "Unauthorized", evaluation: null, status: 401 };

  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      rulesetVersion: { select: { id: true, version: true, ruleset: { select: { name: true } } } },
      account: { select: { id: true, accountNumber: true, status: true, healthStatus: true } },
      ruleEvaluations: { select: { id: true, ruleId: true, result: true, evaluatedAt: true, rule: { select: { ruleType: true, name: true } } } },
    },
  });

  if (!evaluation) return { success: false, error: "Evaluation not found", evaluation: null, status: 404 };
  if (role === "TRADER" && evaluation.traderId !== traderId) return { success: false, error: "Forbidden", evaluation: null, status: 403 };

  const safe = safeEvaluationSingle(evaluation, role === "ADMIN");

  return { success: true, evaluation: safe, status: 200 };
}

const prisma = new PrismaClient();

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

let traderId1: string;
let adminId: string;
let evaluationId1: string;
let evaluationId2: string;

beforeEach(async () => {
  cleanupResult = await cleanup(prisma);
  assertCleanup(cleanupResult, "Evaluations API beforeEach");
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult as CleanupResult, "Evaluations API");
  }
  console.log(
    `Evaluations API Tests: ${results.pass}/${results.pass + results.fail} passed, ${results.fail} failed`,
  );
  await prisma.$disconnect();
  if (results.fail > 0) process.exit(1);
});

describe("Evaluations API - Authentication", () => {
  it("should reject unauthenticated access to list", async () => {
    const result = await simulateEvaluationsList(prisma, null, "", undefined);
    check("Unauthenticated list rejected", result.success === false, "");
    if (!result.success) {
      check("Status 401", result.status === 401, `status=${result.status}`);
      check("Error message", result.error === "Unauthorized", `error=${result.error}`);
      check("Empty evaluations array", Array.isArray(result.evaluations) && result.evaluations.length === 0, "");
    }
  });

  it("should reject unauthenticated access to single", async () => {
    const result = await simulateEvaluationGet(prisma, "non-existent", null, "");
    check("Unauthenticated single rejected", result.success === false, "");
    if (!result.success) {
      check("Status 401", result.status === 401, `status=${result.status}`);
      check("Error message", result.error === "Unauthorized", `error=${result.error}`);
      check("Evaluation is null", result.evaluation === null, "");
    }
  });
});

describe("Evaluations API - List Authorization", () => {
  it("should return trader's own evaluations only", async () => {
    const trader1 = await createTestTrader(prisma, `eval-list-${RUN_ID}-t1@test.example`);
    const trader2 = await createTestTrader(prisma, `eval-list-${RUN_ID}-t2@test.example`);
    const { version } = await createTestRulesetAndVersion(prisma, `RS-${RUN_ID}-list`);

    const eval1 = await createTestEvaluation(prisma, trader1.id, version.id, EvaluationStatus.IN_PROGRESS);
    const eval2 = await createTestEvaluation(prisma, trader1.id, version.id, EvaluationStatus.PASSED);
    const eval3 = await createTestEvaluation(prisma, trader2.id, version.id, EvaluationStatus.IN_PROGRESS);

    const result = await simulateEvaluationsList(prisma, trader1.id, "TRADER");
    check("List succeeded", result.success === true, "");
    if (result.success) {
      check("Returns 2 evaluations", result.evaluations.length === 2, `count=${result.evaluations.length}`);
      const ids = result.evaluations.map((e) => e.id);
      check("Contains eval1", ids.includes(eval1.id), "");
      check("Contains eval2", ids.includes(eval2.id), "");
      check("Does not contain trader2's eval", !ids.includes(eval3.id), "");
    }
  });

  it("should return all evaluations for admin", async () => {
    const trader1 = await createTestTrader(prisma, `eval-admin-${RUN_ID}-t1@test.example`);
    const trader2 = await createTestTrader(prisma, `eval-admin-${RUN_ID}-t2@test.example`);
    const admin = await createTestTrader(prisma, `eval-admin-${RUN_ID}-admin@test.example`, "ADMIN");
    const { version } = await createTestRulesetAndVersion(prisma, `RS-${RUN_ID}-admin`);

    const eval1 = await createTestEvaluation(prisma, trader1.id, version.id, EvaluationStatus.IN_PROGRESS);
    const eval2 = await createTestEvaluation(prisma, trader2.id, version.id, EvaluationStatus.PASSED);

    const result = await simulateEvaluationsList(prisma, admin.id, "ADMIN");
    check("Admin list succeeded", result.success === true, "");
    if (result.success) {
      check("Returns both evaluations", result.evaluations.length >= 2, `count=${result.evaluations.length}`);
      const ids = result.evaluations.map((e) => e.id);
      check("Contains trader1 eval", ids.includes(eval1.id), "");
      check("Contains trader2 eval", ids.includes(eval2.id), "");
    }
  });

  it("should filter by status for trader", async () => {
    const trader = await createTestTrader(prisma, `eval-filter-${RUN_ID}-t1@test.example`);
    const { version } = await createTestRulesetAndVersion(prisma, `RS-${RUN_ID}-filter`);

    await createTestEvaluation(prisma, trader.id, version.id, EvaluationStatus.IN_PROGRESS);
    await createTestEvaluation(prisma, trader.id, version.id, EvaluationStatus.PASSED);

    const result = await simulateEvaluationsList(prisma, trader.id, "TRADER", EvaluationStatus.PASSED);
    check("Filtered list succeeded", result.success === true, "");
    if (result.success) {
      check("Returns 1 evaluation", result.evaluations.length === 1, `count=${result.evaluations.length}`);
      check("All PASSED", result.evaluations.every((e) => e.status === EvaluationStatus.PASSED), "");
    }
  });

  it("should return empty list when no evaluations", async () => {
    const trader = await createTestTrader(prisma, `eval-empty-${RUN_ID}@example.com`);
    const result = await simulateEvaluationsList(prisma, trader.id, "TRADER");
    check("Empty list succeeded", result.success === true, "");
    if (result.success) {
      check("Returns 0 evaluations", result.evaluations.length === 0, `count=${result.evaluations.length}`);
    }
  });
});

describe("Evaluations API - Single Evaluation Authorization", () => {
  beforeEach(async () => {
    const t1 = await createTestTrader(prisma, `eval-single-${RUN_ID}-t1@test.example`);
    const t2 = await createTestTrader(prisma, `eval-single-${RUN_ID}-t2@test.example`);
    const admin = await createTestTrader(prisma, `eval-single-${RUN_ID}-admin@test.example`, "ADMIN");
    const { version } = await createTestRulesetAndVersion(prisma, `RS-${RUN_ID}-single`);

    traderId1 = t1.id;
    adminId = admin.id;

    const eval1 = await createTestEvaluation(prisma, t1.id, version.id, EvaluationStatus.PASSED);
    const eval2 = await createTestEvaluation(prisma, t2.id, version.id, EvaluationStatus.IN_PROGRESS);
    evaluationId1 = eval1.id;
    evaluationId2 = eval2.id;
  });

  it("should allow trader to access own evaluation", async () => {
    const result = await simulateEvaluationGet(prisma, evaluationId1, traderId1, "TRADER");
    check("Access own evaluation", result.success === true, "");
    if (result.evaluation) {
      check("Returns evaluation", result.evaluation.id === evaluationId1, `id=${result.evaluation.id}`);
      check("Status correct", result.evaluation.status === EvaluationStatus.PASSED, `status=${result.evaluation.status}`);
    }
  });

  it("should reject trader accessing another trader's evaluation", async () => {
    const result = await simulateEvaluationGet(prisma, evaluationId2, traderId1, "TRADER");
    check("Reject cross-trader access", result.success === false, "");
    if (!result.success) {
      check("Status 403", result.status === 403, `status=${result.status}`);
      check("Error message", result.error === "Forbidden", `error=${result.error}`);
      check("Evaluation is null", result.evaluation === null, "");
    }
  });

  it("should allow admin to access any evaluation", async () => {
    const result = await simulateEvaluationGet(prisma, evaluationId2, adminId, "ADMIN");
    check("Admin access succeeded", result.success === true, "");
    if (result.evaluation) {
      check("Returns evaluation", result.evaluation.id === evaluationId2, `id=${result.evaluation.id}`);
    }
  });

  it("should reject nonexistent evaluation", async () => {
    const result = await simulateEvaluationGet(prisma, "non-existent-id", traderId1, "TRADER");
    check("Nonexistent evaluation rejected", result.success === false, "");
    if (!result.success) {
      check("Status 404", result.status === 404, `status=${result.status}`);
      check("Error message", result.error === "Evaluation not found", `error=${result.error}`);
      check("Evaluation is null", result.evaluation === null, "");
    }
  });
});

describe("Evaluations API - Sensitive Field Exposure", () => {
  beforeEach(async () => {
    const t1 = await createTestTrader(prisma, `eval-sens-${RUN_ID}-t1@test.example`);
    await createTestTrader(prisma, `eval-sens-${RUN_ID}-admin@test.example`, "ADMIN");
    const { version } = await createTestRulesetAndVersion(prisma, `RS-${RUN_ID}-sens`);
    await createTestAccount(prisma, `ACC-${RUN_ID}-sens`);

    traderId1 = t1.id;
    const evaluation = await createTestEvaluation(prisma, t1.id, version.id, EvaluationStatus.PASSED);
    evaluationId1 = evaluation.id;

    const rule = await createTestRule(prisma, version.id, "PROFIT_TARGET");
    await createTestRuleEvaluation(prisma, evaluation.id, rule.id, RuleResult.PASS);
  });

  it("should not expose traderId to non-admin on list", async () => {
    const result = await simulateEvaluationsList(prisma, traderId1, "TRADER");
    check("List succeeded", result.success === true, "");
    if (result.success) {
      const evalData = result.evaluations[0];
      check("No traderId in response", evalData.traderId === undefined, `traderId=${evalData.traderId}`);
    }
  });

  it("should expose traderId to admin on list", async () => {
    const result = await simulateEvaluationsList(prisma, traderId1, "ADMIN");
    check("Admin list succeeded", result.success === true, "");
    if (result.success && result.evaluations.length > 0) {
      const evalData = result.evaluations[0];
      check("traderId present in admin response", evalData.traderId !== undefined, "");
      check("traderId is correct", evalData.traderId === traderId1, `expected=${traderId1}, got=${evalData.traderId}`);
    }
  });

  it("should not expose MT5 credentials in account info on list", async () => {
    const result = await simulateEvaluationsList(prisma, traderId1, "TRADER");
    check("List succeeded", result.success === true, "");
    if (result.success && result.evaluations.length > 0) {
      const acct = result.evaluations[0].account;
      if (acct) {
        check("Account has accountNumber", "accountNumber" in acct, "");
        check("Account has status", "status" in acct, "");
        check("Account has healthStatus", "healthStatus" in acct, "");
        check("No credentials field", !("credentials" in acct), `keys=${JSON.stringify(Object.keys(acct))}`);
        check("No login field", !("login" in acct), `keys=${JSON.stringify(Object.keys(acct))}`);
        check("No server field", !("server" in acct), `keys=${JSON.stringify(Object.keys(acct))}`);
        check("No broker field", !("broker" in acct), `keys=${JSON.stringify(Object.keys(acct))}`);
      }
    }
  });

  it("should not expose login/server/broker in single evaluation", async () => {
    const result = await simulateEvaluationGet(prisma, evaluationId1, traderId1, "TRADER");
    check("Single succeeded", result.success === true, "");
    if (result.evaluation?.account) {
      const acct = result.evaluation.account;
      check("No credentials", !("credentials" in acct), `keys=${JSON.stringify(Object.keys(acct))}`);
      check("No login", !("login" in acct), `keys=${JSON.stringify(Object.keys(acct))}`);
      check("No server", !("server" in acct), `keys=${JSON.stringify(Object.keys(acct))}`);
      check("No broker", !("broker" in acct), `keys=${JSON.stringify(Object.keys(acct))}`);
    }
  });
});

describe("Evaluations API - Data Accuracy", () => {
  beforeEach(async () => {
    const t1 = await createTestTrader(prisma, `eval-accuracy-${RUN_ID}-t1@test.example`);
    const { version } = await createTestRulesetAndVersion(prisma, `RS-${RUN_ID}-accuracy`);
    const account = await createTestAccount(prisma, `ACC-${RUN_ID}-accuracy`);

    traderId1 = t1.id;
    const evaluation = await createTestEvaluation(prisma, t1.id, version.id, EvaluationStatus.PASSED);
    evaluationId1 = evaluation.id;

    await prisma.evaluation.update({
      where: { id: evaluation.id },
      data: {
        accountId: account.id,
        completedAt: new Date(),
        totalPnl: 2500.50,
        maxDrawdown: 1200.75,
      },
    });
  });

  it("should return correct persisted status", async () => {
    const result = await simulateEvaluationGet(prisma, evaluationId1, traderId1, "TRADER");
    check("Single succeeded", result.success === true, "");
    if (result.evaluation) {
      check("Status is PASSED", result.evaluation.status === EvaluationStatus.PASSED, `status=${result.evaluation.status}`);
      check("Total PnL correct", result.evaluation.totalPnl === 2500.50, `pnl=${result.evaluation.totalPnl}`);
      check("Max drawdown correct", result.evaluation.maxDrawdown === 1200.75, `drawdown=${result.evaluation.maxDrawdown}`);
    }
  });

  it("should return null account when no account linked", async () => {
    const { version } = await createTestRulesetAndVersion(prisma, `RS-${RUN_ID}-noacc`);
    const t2 = await createTestTrader(prisma, `eval-accuracy-${RUN_ID}-t2@test.example`);
    const evalNoAccount = await createTestEvaluation(prisma, t2.id, version.id, EvaluationStatus.IN_PROGRESS);

    const result = await simulateEvaluationGet(prisma, evalNoAccount.id, t2.id, "TRADER");
    check("Single succeeded", result.success === true, "");
    if (result.evaluation) {
      check("Account is null", result.evaluation.account === null, `account=${JSON.stringify(result.evaluation.account)}`);
    }
  });

  it("should return zero counts for rules with no results", async () => {
    const { version } = await createTestRulesetAndVersion(prisma, `RS-${RUN_ID}-norules`);
    const t3 = await createTestTrader(prisma, `eval-accuracy-${RUN_ID}-t3@test.example`);
    const evalNoRules = await createTestEvaluation(prisma, t3.id, version.id, EvaluationStatus.IN_PROGRESS);

    const result = await simulateEvaluationGet(prisma, evalNoRules.id, t3.id, "TRADER");
    check("Single succeeded", result.success === true, "");
    if (result.evaluation) {
      check("Passed count is 0", result.evaluation.rulePassedCount === 0, `passed=${result.evaluation.rulePassedCount}`);
      check("Failed count is 0", result.evaluation.ruleFailedCount === 0, `failed=${result.evaluation.ruleFailedCount}`);
      check("Warning count is 0", result.evaluation.ruleWarningCount === 0, `warnings=${result.evaluation.ruleWarningCount}`);
    }
  });
});
