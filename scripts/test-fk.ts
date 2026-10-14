import "../tests/support/test-env";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const runId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  let traderId: string | undefined;
  let rulesetId: string | undefined;
  let versionId: string | undefined;
  let evaluationId: string | undefined;
  let accountId: string | undefined;

  try {
    await prisma.$connect();
    console.log("Connected to the verified test database.");

    console.log("Step 1: Create trader");
    const trader = await prisma.trader.create({
      data: { email: "fk-" + runId + "@test.example", password: "TestPass123", role: "TRADER" },
    });
    traderId = trader.id;

    console.log("Step 2: Create ruleset");
    const ruleset = await prisma.ruleset.create({ data: { name: "fk-test-" + runId } });
    rulesetId = ruleset.id;

    console.log("Step 3: Create rulesetVersion");
    const version = await prisma.rulesetVersion.create({
      data: { rulesetId: ruleset.id, version: "1.0", status: "PUBLISHED" },
    });
    versionId = version.id;

    console.log("Step 4: Create evaluation");
    const evaluation = await prisma.evaluation.create({
      data: { traderId: trader.id, rulesetVersionId: version.id, status: "IN_PROGRESS" },
    });
    evaluationId = evaluation.id;

    console.log("Step 5: Create MT5Account");
    const account = await prisma.mT5Account.create({
      data: {
        accountNumber: "FK-" + runId,
        status: "AVAILABLE",
        accountSize: 100000,
        purpose: "EVALUATION",
      },
    });
    accountId = account.id;

    console.log("Foreign-key fixture creation passed.");
  } catch (error) {
    console.error("Foreign-key fixture check failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    try {
      if (evaluationId) await prisma.evaluation.deleteMany({ where: { id: evaluationId } });
      if (accountId) await prisma.mT5Account.deleteMany({ where: { id: accountId } });
      if (versionId) await prisma.rulesetVersion.deleteMany({ where: { id: versionId } });
      if (rulesetId) await prisma.ruleset.deleteMany({ where: { id: rulesetId } });
      if (traderId) await prisma.trader.deleteMany({ where: { id: traderId } });
    } catch (cleanupError) {
      console.error(
        "Scoped test-fixture cleanup failed:",
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      );
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Foreign-key test aborted:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
