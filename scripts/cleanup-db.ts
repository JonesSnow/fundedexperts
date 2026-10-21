import { TEST_DATABASE_CLEANUP_CONFIRMATION_VALUE } from "../lib/test-cleanup-guard";

async function main() {
  if (process.env.TEST_DATABASE_CLEANUP_CONFIRMATION !== TEST_DATABASE_CLEANUP_CONFIRMATION_VALUE) {
    throw new Error(
      "Database cleanup is disabled. Independently verify the disposable test target, then set TEST_DATABASE_CLEANUP_CONFIRMATION."
    );
  }

  await import("../tests/support/test-env");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let currentStep = "connect";

  try {
    await prisma.$connect();
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
      { label: "trader.deleteMany", fn: () => prisma.trader.deleteMany({}) },
    ];
    for (const step of steps) {
      currentStep = step.label;
      const count = await step.fn();
      console.log(`${step.label}: ${count.count ?? count} deleted`);
    }
    console.log("Test database cleanup complete.");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string"
        ? ` (Prisma ${error.code})`
        : "";
    throw new Error(`Database cleanup failed during ${currentStep}${code}; error details redacted.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database cleanup failed; error details redacted.");
  process.exitCode = 1;
});
