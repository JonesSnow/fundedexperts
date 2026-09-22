const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log("Connected\n");
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
      { label: "auditLog.deleteMany", fn: () => prisma.auditLog.deleteMany({}) },
    ];
    for (const step of steps) {
      const count = await step.fn();
      console.log(`${step.label}: ${count.count ?? count} deleted`);
    }
    console.log("\nDB cleanup complete");
  } catch (e) {
    console.error("FAILED:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error("FATAL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
