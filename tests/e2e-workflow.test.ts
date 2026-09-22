import { PrismaClient, MT5Account, AccountAssignment, Evaluation } from "@prisma/client";
import { allocateAccount } from "../lib/allocation";
import { releaseAccount } from "../lib/release";
import { runCleanupSteps, assertCleanup, type CleanupResult } from "../lib/cleanup-helper";

const HAS_DB = process.env.DATABASE_URL !== undefined;
const TEST_PREFIX = "E2E";
const RUN_ID = Date.now().toString(36);

const results = { pass: 0, fail: 0, tests: [] as Array<{ name: string; result: string; detail: string }> };

function check(name: string, condition: boolean, detail: string = "") {
  if (condition) {
    results.pass++;
    results.tests.push({ name, result: "PASS", detail });
  } else {
    results.fail++;
    results.tests.push({ name, result: "FAIL", detail });
  }
}

let cleanupResult: CleanupResult | null = null;

async function cleanup(prisma: PrismaClient): Promise<CleanupResult> {
  const steps = [
    { label: "ruleEvaluation.deleteMany", fn: () => prisma.ruleEvaluation.deleteMany({}) },
    { label: "orderItem.deleteMany", fn: () => prisma.orderItem.deleteMany({}) },
    { label: "ledgerEntry.deleteMany", fn: () => prisma.ledgerEntry.deleteMany({}) },
    { label: "order.deleteMany", fn: () => prisma.order.deleteMany({}) },
    { label: "monitoringJob.deleteMany", fn: () => prisma.monitoringJob.deleteMany({}) },
    { label: "accountAssignment.deleteMany", fn: () => prisma.accountAssignment.deleteMany({}) },
    { label: "evaluation.deleteMany", fn: () => prisma.evaluation.deleteMany({}) },
    { label: "rule.deleteMany", fn: () => prisma.rule.deleteMany({}) },
    { label: "rulesetVersion.deleteMany", fn: () => prisma.rulesetVersion.deleteMany({}) },
    { label: "ruleset.deleteMany", fn: () => prisma.ruleset.deleteMany({}) },
    { label: "product.deleteMany", fn: () => prisma.product.deleteMany({}) },
    { label: "mT5Account.deleteMany", fn: () => prisma.mT5Account.deleteMany({}) },
    { label: "trader.deleteMany", fn: () => prisma.trader.deleteMany({}) },
    { label: "auditLog.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE` },
  ];
  return runCleanupSteps(prisma, steps);
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  if (!HAS_DB) {
    console.log("SKIPPED: DATABASE_URL not configured");
    return;
  }

  const prisma = new PrismaClient();
  const initialCleanup = await cleanup(prisma);
  assertCleanup(initialCleanup, "E2E initial cleanup");
  await delay(3000);

  const emailPrefix = `${TEST_PREFIX}-${RUN_ID}`;

  // ========== TEST DATA CREATION ==========
  console.log("--- Creating test data ---");

  const trader = await prisma.trader.create({
    data: { email: `${emailPrefix}-trader@test.example`, password: "TestPass123", role: "TRADER" },
  });
  const admin = await prisma.trader.create({
    data: { email: `${emailPrefix}-admin@test.example`, password: "TestPass123", role: "ADMIN" },
  });
  const otherTrader = await prisma.trader.create({
    data: { email: `${emailPrefix}-other@test.example`, password: "TestPass123", role: "TRADER" },
  });

  await prisma.product.create({
    data: { name: `${emailPrefix}-Product`, accountSize: 100000, price: 0, currency: "USD" },
  });

  const ruleset = await prisma.ruleset.create({
    data: { name: `${emailPrefix}-Ruleset`, description: "Test ruleset" },
  });

  const rulesetVersion = await prisma.rulesetVersion.create({
    data: { rulesetId: ruleset.id, version: "1.0", status: "PUBLISHED", effectiveDate: new Date() },
  });

  const evaluation = await prisma.evaluation.create({
    data: {
      traderId: trader.id,
      rulesetVersionId: rulesetVersion.id,
      status: "IN_PROGRESS",
      notes: "E2E evaluation",
    },
  });

  const mt5Account = await prisma.mT5Account.create({
    data: {
      accountNumber: `${emailPrefix}-ACCT-001`,
      status: "AVAILABLE",
      accountSize: 150000,
      purpose: "EVALUATION",
      broker: "XM",
      server: "Server-XM",
    },
  });

  console.log("--- Test data created ---");
  await delay(3000);

  // ========== STEP 3: ALLOCATION WORKFLOW ==========
  console.log("\n=== STEP 3: Allocation Workflow ===");

  const allocStart = Date.now();
  const allocResult = await allocateAccount(prisma, { traderId: trader.id });
  const allocElapsed = Date.now() - allocStart;
  check("Allocation succeeds", allocResult.success === true,
    allocResult.success ? `Account allocated in ${allocElapsed}ms` : (allocResult as { error: string }).error);

  let allocatedAccountId: string | undefined;
  if (allocResult.success) {
    const assignment = allocResult.assignment;
    const allocatedAccount = allocResult.account;
    allocatedAccountId = allocatedAccount.id;
    await delay(2000);

    const evalLinked = await prisma.evaluation.findUnique({ where: { id: evaluation.id } });
    check("Evaluation linked to account", evalLinked?.accountId === allocatedAccountId,
      `eval.accountId=${evalLinked?.accountId}, account.id=${allocatedAccountId}`);

    check("Assignment linked to trader", assignment.traderId === trader.id,
      `assignment.traderId=${assignment.traderId}`);

    const dbAccount = await prisma.mT5Account.findUnique({ where: { id: allocatedAccountId } });
    check("Account status IN_USE", dbAccount?.status === "IN_USE", `status=${dbAccount?.status}`);

    const activeAssignments = await prisma.accountAssignment.count({
      where: { accountId: allocatedAccountId, status: "ASSIGNED" },
    });
    check("Only one active assignment", activeAssignments === 1, `count=${activeAssignments}`);

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId: allocatedAccountId, action: "ACCOUNT_ASSIGNED" },
    });
    check("ACCOUNT_ASSIGNED audit created", auditLogs.length >= 1, `count=${auditLogs.length}`);

    let noCreds = true;
    for (const log of auditLogs) {
      const d = log.details as Record<string, unknown>;
      if (d.credentials !== undefined || d.password !== undefined) noCreds = false;
    }
    check("No credentials in audit", noCreds, noCreds ? "Clean" : "Found");

    check("evaluationLinked flag", allocResult.evaluationLinked === true,
      `evaluationLinked=${allocResult.evaluationLinked}`);
  }

  // ========== STEP 4: INVALID WORKFLOWS ==========
  console.log("\n=== STEP 4: Invalid Workflows ===");
  await delay(2000);

  const newTrader = await prisma.trader.create({
    data: { email: `${emailPrefix}-new@test.example`, password: "TestPass123", role: "TRADER" },
  });
  await delay(2000);

  const allocNoEval = await allocateAccount(prisma, { traderId: newTrader.id });
  check("Allocation fails without active eval", allocNoEval.success === false,
    (allocNoEval as { error: string }).error);

  const allocNoAccount = await allocateAccount(prisma, { traderId: newTrader.id });
  check("Allocation fails with no eligible account", allocNoAccount.success === false,
    (allocNoAccount as { error: string }).error);

  const releaseUnauth = await releaseAccount(prisma, {
    traderId: otherTrader.id,
    accountId: allocatedAccountId!,
    reason: "EVALUATION_COMPLETED",
  });
  check("Release fails for other trader", releaseUnauth.success === false,
    (releaseUnauth as { error: string }).error);

  // ========== STEP 5: RELEASE ==========
  console.log("\n=== STEP 5: Release Workflow ===");
  await delay(2000);

  const validRelease = await releaseAccount(prisma, {
    traderId: trader.id,
    accountId: allocatedAccountId!,
    reason: "EVALUATION_COMPLETED",
  });
  check("Release succeeds", validRelease.success === true,
    validRelease.success ? "Released" : (validRelease as { error: string }).error);

  if (validRelease.success) {
    const allAssign = await prisma.accountAssignment.findMany({
      where: { accountId: allocatedAccountId! },
      orderBy: { createdAt: "asc" },
    });
    check("History preserved", allAssign.length === 1 && allAssign[0].status === "RETURNED",
      `count=${allAssign.length}, status=${allAssign[0]?.status}`);

    const retAssign = await prisma.accountAssignment.findFirst({
      where: { accountId: allocatedAccountId!, status: "RETURNED" },
    });
    check("returnedAt set", retAssign?.returnedAt !== null, `returnedAt=${retAssign?.returnedAt}`);

    const relAccount = await prisma.mT5Account.findUnique({ where: { id: allocatedAccountId! } });
    check("Account AVAILABLE after release", relAccount?.status === "AVAILABLE",
      `status=${relAccount?.status}`);

    const evalAfter = await prisma.evaluation.findUnique({ where: { id: evaluation.id } });
    check("Eval PASSED after release", evalAfter?.status === "PASSED",
      `status=${evalAfter?.status}`);

    const relAudit = await prisma.auditLog.findMany({
      where: { entityId: allocatedAccountId!, action: "ACCOUNT_RETURNED" },
    });
    check("ACCOUNT_RETURNED audit created", relAudit.length >= 1, `count=${relAudit.length}`);
  }

  const secondRelease = await releaseAccount(prisma, {
    traderId: trader.id,
    accountId: allocatedAccountId!,
    reason: "EVALUATION_COMPLETED",
  });
  check("Second release fails (no active)", secondRelease.success === false,
    (secondRelease as { error: string }).error);

  // ========== STEP 6: CONCURRENCY ==========
  console.log("\n=== STEP 6: Concurrency Regression ===");
  await delay(3000);

  // Block other AVAILABLE accounts by making them IN_USE
  const otherAvail = await prisma.mT5Account.findFirst({
    where: { id: mt5Account.id, status: "AVAILABLE" },
  });
  if (otherAvail) {
    await prisma.mT5Account.update({ where: { id: mt5Account.id }, data: { status: "IN_USE" } });
    await prisma.accountAssignment.create({
      data: { traderId: otherTrader.id, accountId: mt5Account.id, status: "ASSIGNED" },
    });
  }

  const concAccount = await prisma.mT5Account.create({
    data: {
      accountNumber: `${emailPrefix}-CONC-001`,
      status: "AVAILABLE",
      accountSize: 200000,
      purpose: "EVALUATION",
    },
  });
  await delay(3000);

  // Sequential rapid allocations for the same account
  const seqResults = [];
  for (let i = 0; i < 5; i++) {
    const r = await allocateAccount(prisma, {
      traderId: i % 2 === 0 ? trader.id : otherTrader.id,
    });
    seqResults.push(r);
    await delay(500);
  }

  const seqSuccess = seqResults.filter(r => r.success).length;
  const seqFail = seqResults.filter(r => !r.success).length;
  check("At most one allocation succeeds for same account", seqSuccess <= 1,
    `success=${seqSuccess}, fail=${seqFail}`);

  const activeConc = await prisma.accountAssignment.count({
    where: { accountId: concAccount.id, status: "ASSIGNED" },
  });
  check("No duplicate active assignment", activeConc <= 1, `count=${activeConc}`);

  const concDb = await prisma.mT5Account.findUnique({ where: { id: concAccount.id } });
  const hasActive = activeConc === 1;
  check("Status consistent", (concDb?.status === "IN_USE") === hasActive,
    `status=${concDb?.status}, hasActive=${hasActive}`);

  const totalConc = await prisma.accountAssignment.count({ where: { accountId: concAccount.id } });
  check("No partial records", totalConc <= 1, `count=${totalConc}`);

  // ========== STEP 7: AUDIT ==========
  console.log("\n=== STEP 7: Audit Integrity ===");
  await delay(2000);

  const allAudit = await prisma.auditLog.findMany({
    where: { entityType: "MT5Account" },
    take: 10000,
  });
  let auditClean = true;
  for (const log of allAudit) {
    const d = JSON.stringify(log.details || {}).toLowerCase();
    if (d.includes("password") || d.includes("credential") || d.includes("secret") || d.includes("postgresql://")) {
      auditClean = false;
    }
  }
  check("Audit logs contain no sensitive data", auditClean, auditClean ? "Clean" : "Found");

  const finalCleanup = await cleanup(prisma);
  console.log(`[cleanup] Final cleanup: ${finalCleanup.passed}/${finalCleanup.total} succeeded, ${finalCleanup.failed} failed`);
  if (!finalCleanup.succeeded) {
    console.error("CLEANUP FAILURE: E2E final cleanup failed — run contaminated");
  }
  cleanupResult = finalCleanup;

  await prisma.$disconnect();

  console.log("\n" + "=".repeat(60));
  console.log("END-TO-END TEST RESULTS");
  console.log("=".repeat(60));
  console.log(`Total tests: ${results.pass + results.fail}`);
  console.log(`Passed: ${results.pass}`);
  console.log(`Failed: ${results.fail}`);
  console.log("");

  for (const t of results.tests) {
    const icon = t.result === "PASS" ? "✔" : "✖";
    console.log(`  ${icon} [${t.result}] ${t.name}${t.detail ? ` — ${t.detail}` : ""}`);
  }

  const hasFailures = results.fail > 0;
  const hasCleanupFailures = cleanupResult ? !cleanupResult.succeeded : false;

  if (hasFailures || hasCleanupFailures) {
    console.log("\n*** FAILURES DETECTED ***");
    process.exit(1);
  } else {
    console.log("\n*** ALL TESTS PASSED ***");
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
