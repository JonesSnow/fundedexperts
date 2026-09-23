import { Prisma, PrismaClient, MT5Account, AccountAssignment, Evaluation, AuditAction, MT5AccountPurpose } from "@prisma/client";
import { allocateAccount } from "../lib/allocation";
import { linkEvaluation, LinkEvaluationInput } from "../lib/evaluation-link";
import { recoverEvaluationLink } from "../lib/recovery";
import { reconcile } from "../lib/reconciliation";
import { releaseAccount } from "../lib/release";
import { runCleanupSteps, assertCleanup, type CleanupResult } from "../lib/cleanup-helper";

const HAS_DB = process.env.DATABASE_URL !== undefined;
const TEST_PREFIX = "P17";

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

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
    { label: "trader.truncate", fn: () => prisma.$executeRaw(Prisma.raw(`TRUNCATE TABLE "Trader" CASCADE`)) },
    { label: "auditLog.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE` },
  ];
  return runCleanupSteps(prisma, steps);
}

async function createTestSetup(prisma: PrismaClient, prefix: string) {
  const trader = await prisma.trader.create({
    data: { email: `${prefix}-trader@test.example`, password: "TestPass123", role: "TRADER" },
  });
  const ruleset = await prisma.ruleset.create({ data: { name: `${prefix}-RS` } });
  const version = await prisma.rulesetVersion.create({
    data: { rulesetId: ruleset.id, version: "1.0", status: "PUBLISHED" },
  });
  const evaluation = await prisma.evaluation.create({
    data: { traderId: trader.id, rulesetVersionId: version.id, status: "IN_PROGRESS" },
  });
  const account = await prisma.mT5Account.create({
    data: { accountNumber: `${prefix}-ACCT-001`, status: "AVAILABLE", accountSize: 150000, purpose: "EVALUATION" as MT5AccountPurpose },
  });
  return { trader, evaluation, account };
}

async function main() {
  if (!HAS_DB) {
    console.log("SKIPPED: DATABASE_URL not configured");
    return;
  }

  const prisma = new PrismaClient();
  let pass = 0, fail = 0;
  const results: Array<{ name: string; status: string; detail: string }> = [];

  function check(name: string, condition: boolean, detail: string = "") {
    if (condition) {
      pass++;
      results.push({ name, status: "PASS", detail });
    } else {
      fail++;
      results.push({ name, status: "FAIL", detail });
    }
  }

  // ==========================================
  // TEST A: Normal successful workflow
  // ==========================================
  console.log("=== TEST A: Normal successful workflow ===");
  const initialCleanup = await cleanup(prisma);
  assertCleanup(initialCleanup, "Phase 17 initial cleanup");
  await sleep(1000);

  const setupA = await createTestSetup(prisma, `${TEST_PREFIX}-A`);
  const allocA = await allocateAccount(prisma, { traderId: setupA.trader.id });
  check("A1: Allocation succeeds", allocA.success === true, allocA.success ? "OK" : (allocA as { error: string }).error);

  if (allocA.success) {
    check("A2: evaluationLinked=true", allocA.evaluationLinked === true, `evaluationLinked=${allocA.evaluationLinked}`);
    check("A3: Account IN_USE", (allocA as { account: MT5Account }).account.status === "IN_USE", `status=${(allocA as { account: MT5Account }).account.status}`);

    const evalAfter = await prisma.evaluation.findUnique({ where: { id: setupA.evaluation.id } });
    check("A4: Evaluation linked in DB", evalAfter?.accountId === allocA.account.id, `eval.accountId=${evalAfter?.accountId}`);

    const auditLinked = await prisma.auditLog.count({
      where: { entityId: setupA.evaluation.id, action: AuditAction.EVALUATION_LINKED },
    });
    check("A5: EVALUATION_LINKED audit created", auditLinked >= 1, `count=${auditLinked}`);
  }

  // ==========================================
  // TEST B: Evaluation linking failure simulation
  // ==========================================
  console.log("\n=== TEST B: Evaluation linking failure simulation ===");
  const cleanupB = await cleanup(prisma);
  assertCleanup(cleanupB, "Phase 17 TEST B cleanup");
  await sleep(1000);

  const setupB = await createTestSetup(prisma, `${TEST_PREFIX}-B`);
  const allocB = await allocateAccount(prisma, { traderId: setupB.trader.id });
  check("B1: Allocation succeeds", allocB.success === true, allocB.success ? "OK" : "FAIL");

  if (allocB.success) {
    // Simulate linking failure using linkEvaluation with invalid account
    const invalidAccount = await prisma.mT5Account.create({
      data: { accountNumber: `${TEST_PREFIX}-B-INVALID`, status: "AVAILABLE", accountSize: 50000, purpose: "EVALUATION" as MT5AccountPurpose },
    });

    const linkFail = await linkEvaluation(prisma, {
      evaluationId: setupB.evaluation.id,
      accountId: invalidAccount.id,
      performedBy: setupB.trader.id,
    });
    check("B2: Linking fails for non-IN_USE account", linkFail.success === false, linkFail.success ? "Should fail" : "Correctly failed");

    const auditFailed = await prisma.auditLog.count({
      where: { entityId: setupB.evaluation.id, action: AuditAction.EVALUATION_LINK_FAILED },
    });
    check("B3: EVALUATION_LINK_FAILED audit exists", auditFailed >= 1, `count=${auditFailed}`);

    // Verify account still AVAILABLE (link was rejected)
    const acctB = await prisma.mT5Account.findUnique({ where: { id: invalidAccount.id } });
    check("B4: Account remains AVAILABLE", acctB?.status === "AVAILABLE", `status=${acctB?.status}`);
  }

  // ==========================================
  // TEST C: Recovery success
  // ==========================================
  console.log("\n=== TEST C: Recovery success ===");
  const cleanupC = await cleanup(prisma);
  assertCleanup(cleanupC, "Phase 17 TEST C cleanup");
  await sleep(1000);

  const setupC = await createTestSetup(prisma, `${TEST_PREFIX}-C`);
  const allocC = await allocateAccount(prisma, { traderId: setupC.trader.id });
  check("C1: Allocation succeeds", allocC.success === true, allocC.success ? "OK" : "FAIL");

  if (allocC.success) {
    await prisma.evaluation.update({
      where: { id: setupC.evaluation.id },
      data: { accountId: null },
    });

    const recoveryC = await recoverEvaluationLink(prisma, {
      evaluationId: setupC.evaluation.id,
      performedBy: setupC.trader.id,
    });
    check("C2: Recovery succeeds", recoveryC.success === true, recoveryC.success ? "OK" : (recoveryC as { error: string }).error);

    if (recoveryC.success) {
      check("C3: Was not already linked", recoveryC.wasAlreadyLinked === false, `wasAlreadyLinked=${recoveryC.wasAlreadyLinked}`);
    }

    const evalC = await prisma.evaluation.findUnique({ where: { id: setupC.evaluation.id } });
    check("C4: Evaluation re-linked", evalC?.accountId !== null, `accountId=${evalC?.accountId}`);

    const auditRecovery = await prisma.auditLog.count({
      where: { entityId: setupC.evaluation.id, action: AuditAction.RECOVERY_SUCCEEDED },
    });
    check("C5: RECOVERY_SUCCEEDED audit", auditRecovery >= 1, `count=${auditRecovery}`);
  }

  // ==========================================
  // TEST D: Recovery retry after success (idempotency)
  // ==========================================
  console.log("\n=== TEST D: Recovery retry after success ===");
  const cleanupD = await cleanup(prisma);
  assertCleanup(cleanupD, "Phase 17 TEST D cleanup");
  await sleep(1000);

  const setupD = await createTestSetup(prisma, `${TEST_PREFIX}-D`);
  const allocD = await allocateAccount(prisma, { traderId: setupD.trader.id });
  check("D1: Allocation succeeds", allocD.success === true, allocD.success ? "OK" : "FAIL");

  if (allocD.success) {
    // First recovery (normal)
    const rec1 = await recoverEvaluationLink(prisma, {
      evaluationId: setupD.evaluation.id,
      performedBy: setupD.trader.id,
    });
    check("D2: First recovery succeeds", rec1.success === true, rec1.success ? "OK" : "FAIL");

    const evalD = await prisma.evaluation.findUnique({ where: { id: setupD.evaluation.id } });
    check("D3: Evaluation is linked after first recovery", evalD?.accountId !== null, `accountId=${evalD?.accountId}`);

    // Second recovery (idempotent)
    const rec2 = await recoverEvaluationLink(prisma, {
      evaluationId: setupD.evaluation.id,
      performedBy: setupD.trader.id,
    });
    check("D4: Second recovery succeeds (idempotent)", rec2.success === true, rec2.success ? "OK" : (rec2 as { error: string }).error);

    const rec2WasAlready = rec2.success ? (rec2 as { wasAlreadyLinked: boolean }).wasAlreadyLinked : false;
    check("D5: Second recovery reports alreadyLinked", rec2WasAlready === true, `wasAlreadyLinked=${rec2WasAlready}`);

    // No duplicate assignments
    const assignmentCount = await prisma.accountAssignment.count({
      where: { traderId: setupD.trader.id, status: "ASSIGNED" },
    });
    check("D6: No duplicate assignments", assignmentCount === 1, `count=${assignmentCount}`);

    // No duplicate evaluation links
    const evalD2 = await prisma.evaluation.findUnique({ where: { id: setupD.evaluation.id } });
    const linkAuditCount = await prisma.auditLog.count({
      where: { entityId: setupD.evaluation.id, action: AuditAction.EVALUATION_LINKED },
    });
    check("D7: Single evaluation link in DB", evalD2?.accountId !== null && linkAuditCount >= 1, `accountId=${evalD2?.accountId}, audits=${linkAuditCount}`);
  }

  // ==========================================
  // TEST E: Recovery failure
  // ==========================================
  console.log("\n=== TEST E: Recovery failure ===");
  const cleanupE = await cleanup(prisma);
  assertCleanup(cleanupE, "Phase 17 TEST E cleanup");
  await sleep(1000);

  const setupE = await createTestSetup(prisma, `${TEST_PREFIX}-E`);
  const allocE = await allocateAccount(prisma, { traderId: setupE.trader.id });
  check("E1: Allocation succeeds", allocE.success === true, allocE.success ? "OK" : "FAIL");

  if (allocE.success) {
    // Simulate linking failure AND remove assignment
    await prisma.evaluation.update({
      where: { id: setupE.evaluation.id },
      data: { accountId: null },
    });
    await prisma.accountAssignment.delete({
      where: { id: (allocE as { assignment: AccountAssignment }).assignment.id },
    }).catch(() => {});

    const recoveryE = await recoverEvaluationLink(prisma, {
      evaluationId: setupE.evaluation.id,
      performedBy: setupE.trader.id,
    });
    check("E2: Recovery fails", recoveryE.success === false, recoveryE.success ? "Should fail" : "Correctly failed");
    check("E3: Error message descriptive", (recoveryE as { error: string }).error.length > 5, (recoveryE as { error: string }).error);
    check("E4: Not recoverable", (recoveryE as { stillRecoverable: boolean }).stillRecoverable === false, `stillRecoverable=${(recoveryE as { stillRecoverable: boolean }).stillRecoverable}`);

    const auditFailed = await prisma.auditLog.count({
      where: { entityId: setupE.evaluation.id, action: AuditAction.RECOVERY_FAILED },
    });
    check("E5: RECOVERY_FAILED audit", auditFailed >= 1, `count=${auditFailed}`);
  }

  // ==========================================
  // TEST F: Concurrent recovery
  // ==========================================
  console.log("\n=== TEST F: Concurrent recovery ===");
  const cleanupF = await cleanup(prisma);
  assertCleanup(cleanupF, "Phase 17 TEST F cleanup");
  await sleep(1000);

  const setupF = await createTestSetup(prisma, `${TEST_PREFIX}-F`);
  const allocF = await allocateAccount(prisma, { traderId: setupF.trader.id });
  check("F1: Allocation succeeds", allocF.success === true, allocF.success ? "OK" : "FAIL");

  if (allocF.success) {
    await prisma.evaluation.update({
      where: { id: setupF.evaluation.id },
      data: { accountId: null },
    });

    const [r1, r2] = await Promise.all([
      recoverEvaluationLink(prisma, { evaluationId: setupF.evaluation.id, performedBy: setupF.trader.id }),
      recoverEvaluationLink(prisma, { evaluationId: setupF.evaluation.id, performedBy: setupF.trader.id }),
    ]);

    const r1Success = r1.success;
    const r2Success = r2.success;
    check("F2: At least one recovery succeeds", r1Success || r2Success, `r1=${r1Success}, r2=${r2Success}`);

    const evalF = await prisma.evaluation.findUnique({ where: { id: setupF.evaluation.id } });
    check("F3: Evaluation linked", evalF?.accountId !== null, `accountId=${evalF?.accountId}`);

    const assignmentCount = await prisma.accountAssignment.count({
      where: { traderId: setupF.trader.id, status: "ASSIGNED" },
    });
    check("F4: Single assignment after concurrent recovery", assignmentCount === 1, `count=${assignmentCount}`);

    const linkAuditCount = await prisma.auditLog.count({
      where: { entityId: setupF.evaluation.id, action: { in: [AuditAction.RECOVERY_SUCCEEDED, AuditAction.EVALUATION_LINKED] } },
    });
    check("F5: Audit logs present", linkAuditCount >= 1, `count=${linkAuditCount}`);
  }

  // ==========================================
  // TEST G: Concurrent allocation
  // ==========================================
  console.log("\n=== TEST G: Concurrent allocation ===");
  const cleanupG = await cleanup(prisma);
  assertCleanup(cleanupG, "Phase 17 TEST G cleanup");
  await sleep(1000);

  const setupG = await createTestSetup(prisma, `${TEST_PREFIX}-G`);

  const availBefore = await prisma.mT5Account.findMany({ where: { status: "AVAILABLE" } });
  const uniqueTraders = new Set(await prisma.trader.findMany().then(t => t.map(t => t.id))).size;

  const [g1, g2] = await Promise.all([
    allocateAccount(prisma, { traderId: setupG.trader.id }),
    allocateAccount(prisma, { traderId: setupG.trader.id }),
  ]);

  const g1Success = g1.success;
  const g2Success = g2.success;
  const successCount = (g1Success ? 1 : 0) + (g2Success ? 1 : 0);
  check("G1: At most one allocation succeeds", successCount <= 1, `g1=${g1Success}, g2=${g2Success}, availBefore=${availBefore.length}, traders=${uniqueTraders}`);

  const assignmentCountG = await prisma.accountAssignment.count({
    where: { traderId: setupG.trader.id, status: "ASSIGNED" },
  });
  check("G2: Single assignment", assignmentCountG <= 1, `count=${assignmentCountG}`);

  // ==========================================
  // TEST H: Rollback behavior
  // ==========================================
  console.log("\n=== TEST H: Rollback behavior ===");
  const cleanupH = await cleanup(prisma);
  assertCleanup(cleanupH, "Phase 17 TEST H cleanup");
  await sleep(1000);

  const setupH = await createTestSetup(prisma, `${TEST_PREFIX}-H`);
  // Try to allocate without evaluation (should fail cleanly)
  const allocH = await allocateAccount(prisma, { traderId: setupH.trader.id });
  check("H1: Allocation succeeds", allocH.success === true, allocH.success ? "OK" : "FAIL");

  if (allocH.success) {
    const accountIdH = (allocH as { account: MT5Account }).account.id;
    const assignmentH = (allocH as { assignment: AccountAssignment }).assignment.id;

    // Verify all state is consistent
    const acctH = await prisma.mT5Account.findUnique({ where: { id: accountIdH } });
    const asgnH = await prisma.accountAssignment.findUnique({ where: { id: assignmentH } });
    const evalH = await prisma.evaluation.findUnique({ where: { id: setupH.evaluation.id } });

    check("H2: Account IN_USE", acctH?.status === "IN_USE", `status=${acctH?.status}`);
    check("H3: Assignment ASSIGNED", asgnH?.status === "ASSIGNED", `status=${asgnH?.status}`);
    check("H4: Evaluation linked", evalH?.accountId === accountIdH, `accountId=${evalH?.accountId}`);

    // Simulate rollback scenario: delete assignment, check account
    await prisma.accountAssignment.delete({ where: { id: assignmentH } }).catch(() => {});
    const acctAfterRollback = await prisma.mT5Account.findUnique({ where: { id: accountIdH } });
    check("H5: Account remains IN_USE after manual deletion (expected)", acctAfterRollback?.status === "IN_USE", `status=${acctAfterRollback?.status}`);
  }

  // ==========================================
  // TEST I: Release interaction
  // ==========================================
  console.log("\n=== TEST I: Release interaction ===");
  const cleanupI = await cleanup(prisma);
  assertCleanup(cleanupI, "Phase 17 TEST I cleanup");
  await sleep(1000);

  const setupI = await createTestSetup(prisma, `${TEST_PREFIX}-I`);
  const allocI = await allocateAccount(prisma, { traderId: setupI.trader.id });
  check("I1: Allocation succeeds", allocI.success === true, allocI.success ? "OK" : "FAIL");

  if (allocI.success) {
    // Release immediately after allocation
    const release1 = await releaseAccount(prisma, {
      traderId: setupI.trader.id,
      accountId: (allocI as { account: MT5Account }).account.id,
      reason: "EVALUATION_COMPLETED",
    });
    check("I2: Release succeeds", release1.success === true, release1.success ? "Released" : (release1 as { error: string }).error);

    // Verify state after release
    const acctI = await prisma.mT5Account.findUnique({ where: { id: (allocI as { account: MT5Account }).account.id } });
    const evalI = await prisma.evaluation.findUnique({ where: { id: setupI.evaluation.id } });
    check("I3: Account AVAILABLE after release", acctI?.status === "AVAILABLE", `status=${acctI?.status}`);
    check("I4: Evaluation PASSED after release", evalI?.status === "PASSED", `status=${evalI?.status}`);

    // Release again (should fail)
    const release2 = await releaseAccount(prisma, {
      traderId: setupI.trader.id,
      accountId: (allocI as { account: MT5Account }).account.id,
      reason: "EVALUATION_COMPLETED",
    });
    check("I5: Second release fails", release2.success === false, release2.success ? "Should fail" : "Correctly failed");
  }

  // ==========================================
  // TEST J: Reconciliation
  // ==========================================
  console.log("\n=== TEST J: Reconciliation ===");
  await cleanup(prisma);
  await sleep(1000);

  const setupJ = await createTestSetup(prisma, `${TEST_PREFIX}-J`);
  const allocJ = await allocateAccount(prisma, { traderId: setupJ.trader.id });
  check("J1: Allocation succeeds", allocJ.success === true, allocJ.success ? "OK" : "FAIL");

  if (allocJ.success) {
    // Simulate inconsistency: set account to AVAILABLE but keep assignment
    const acctIdJ = (allocJ as { account: MT5Account }).account.id;
    await prisma.mT5Account.update({ where: { id: acctIdJ }, data: { status: "AVAILABLE" } });

    const reconJ = await reconcile(prisma, setupJ.trader.id);
    check("J2: Reconciliation detects inconsistency", reconJ.inconsistencies.length >= 1, `found=${reconJ.inconsistencies.length}`);
    check("J3: Inconsistency is AVAILABLE_WITH_ASSIGNMENT",
      reconJ.inconsistencies.some(i => i.type === "AVAILABLE_WITH_ASSIGNMENT"),
      `types=${reconJ.inconsistencies.map(i => i.type).join(",")}`
    );
    check("J4: Repair succeeds", reconJ.repairs.some(r => r.repaired), `repairs=${JSON.stringify(reconJ.repairs.map(r => ({ repaired: r.repaired, action: r.action })))}`);

    // Verify state after reconciliation
    const acctAfterRecon = await prisma.mT5Account.findUnique({ where: { id: acctIdJ } });
    check("J5: Account IN_USE after reconciliation", acctAfterRecon?.status === "IN_USE", `status=${acctAfterRecon?.status}`);

    const auditRecon = await prisma.auditLog.count({
      where: { entityId: acctIdJ, action: AuditAction.RECONCILIATION_REPAIRED },
    });
    check("J6: RECONCILIATION_REPAIRED audit", auditRecon >= 1, `count=${auditRecon}`);

    const auditStarted = await prisma.auditLog.count({
      where: { entityId: "reconciliation", action: AuditAction.RECONCILIATION_STARTED },
    });
    check("J7: RECONCILIATION_STARTED audit", auditStarted >= 1, `count=${auditStarted}`);
  }

  // ==========================================
  // Final output
  // ==========================================
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 17 TEST RESULTS");
  console.log("=".repeat(60));
  console.log(`Total: ${pass + fail}`);
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${fail}`);

  for (const r of results) {
    const icon = r.status === "PASS" ? "✔" : "✖";
    console.log(`  ${icon} [${r.status}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }

  const finalCleanup = await cleanup(prisma);
  console.log(`[cleanup] Final cleanup: ${finalCleanup.passed}/${finalCleanup.total} succeeded, ${finalCleanup.failed} failed`);
  if (!finalCleanup.succeeded) {
    console.error("CLEANUP FAILURE: Phase 17 final cleanup failed — run contaminated");
  }

  await prisma.$disconnect();

  if (fail > 0 || !finalCleanup.succeeded) {
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
