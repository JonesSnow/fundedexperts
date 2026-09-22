import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TEST_ACCOUNT_ID = "persistent-acc-verify";
const TEST_RUN_ID = "persistent-index-verify";

async function cleanupData(): Promise<void> {
  await prisma.monitoringJob.deleteMany({ where: { accountId: TEST_ACCOUNT_ID } });
  await prisma.mT5Account.deleteMany({ where: { id: TEST_ACCOUNT_ID } });
}

async function createTestAccount(): Promise<void> {
  await prisma.mT5Account.upsert({
    where: { id: TEST_ACCOUNT_ID },
    update: {},
    create: {
      id: TEST_ACCOUNT_ID,
      accountNumber: "90012345",
      broker: "XM",
      server: "Server-XM",
      login: "12345678",
      status: "IN_USE",
      credentials: "encrypted-test-credentials",
    },
  });
}

interface ScenarioResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function runScenarios(): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];

  const check = (name: string, condition: boolean, detail: string): void => {
    results.push({ name, passed: condition, detail });
    const icon = condition ? "PASS" : "FAIL";
    console.log(`  ${icon}: ${name} — ${detail}`);
  };

  console.log("\n=== Scenario 1: First PENDING job succeeds ===");
  await cleanupData();
  await createTestAccount();
  try {
    const job = await prisma.monitoringJob.create({
      data: {
        jobId: `${TEST_RUN_ID}-s1`,
        accountId: TEST_ACCOUNT_ID,
        workerId: "w1",
        status: "PENDING",
      },
    });
    check("First PENDING job succeeds", true, `jobId=${job.id}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check("First PENDING job succeeds", false, msg);
  }

  console.log("\n=== Scenario 2: Second PENDING job fails (unique violation) ===");
  try {
    await prisma.monitoringJob.create({
      data: {
        jobId: `${TEST_RUN_ID}-s2`,
        accountId: TEST_ACCOUNT_ID,
        workerId: "w2",
        status: "PENDING",
      },
    });
    check("Second PENDING job rejected", false, "Job created unexpectedly");
  } catch (e) {
    const err = e as { code?: string };
    check("Second PENDING job rejected", err.code === "P2002", `code=${err.code}`);
  }

  console.log("\n=== Scenario 3: RUNNING job for same account fails ===");
  try {
    await prisma.monitoringJob.create({
      data: {
        jobId: `${TEST_RUN_ID}-s3`,
        accountId: TEST_ACCOUNT_ID,
        workerId: "w3",
        status: "RUNNING",
      },
    });
    check("RUNNING job rejected", false, "Job created unexpectedly");
  } catch (e) {
    const err = e as { code?: string };
    check("RUNNING job rejected", err.code === "P2002", `code=${err.code}`);
  }

  console.log("\n=== Scenario 4: COMPLETED job permits new active job ===");
  try {
    await prisma.monitoringJob.create({
      data: {
        jobId: `${TEST_RUN_ID}-s4`,
        accountId: TEST_ACCOUNT_ID,
        workerId: "w4",
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
    check("COMPLETED job created", true, "COMPLETED not in index predicate");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check("COMPLETED job created", false, msg);
  }
  try {
    const job = await prisma.monitoringJob.create({
      data: {
        jobId: `${TEST_RUN_ID}-s4b`,
        accountId: TEST_ACCOUNT_ID,
        workerId: "w4b",
        status: "PENDING",
      },
    });
    check("New PENDING after COMPLETED succeeds", true, `jobId=${job.id}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check("New PENDING after COMPLETED succeeds", false, msg);
  }

  console.log("\n=== Scenario 5: FAILED job permits new active job ===");
  await cleanupData();
  await createTestAccount();
  try {
    const job = await prisma.monitoringJob.create({
      data: {
        jobId: `${TEST_RUN_ID}-s5`,
        accountId: TEST_ACCOUNT_ID,
        workerId: "w5",
        status: "FAILED",
        completedAt: new Date(),
      },
    });
    void job;
    check("FAILED job created", true, "FAILED not in index predicate");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check("FAILED job created", false, msg);
  }
  try {
    const job = await prisma.monitoringJob.create({
      data: {
        jobId: `${TEST_RUN_ID}-s5b`,
        accountId: TEST_ACCOUNT_ID,
        workerId: "w5b",
        status: "PENDING",
      },
    });
    check("New PENDING after FAILED succeeds", true, `jobId=${job.id}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check("New PENDING after FAILED succeeds", false, msg);
  }

  console.log("\n=== Scenario 6: Concurrent creation (no duplicates) ===");
  await cleanupData();
  await createTestAccount();
  const results6 = await Promise.allSettled([
    prisma.monitoringJob.create({
      data: {
        jobId: `${TEST_RUN_ID}-s6a`,
        accountId: TEST_ACCOUNT_ID,
        workerId: "w6a",
        status: "PENDING",
      },
    }),
    prisma.monitoringJob.create({
      data: {
        jobId: `${TEST_RUN_ID}-s6b`,
        accountId: TEST_ACCOUNT_ID,
        workerId: "w6b",
        status: "PENDING",
      },
    }),
  ]);
  const successes6 = results6.filter((r) => r.status === "fulfilled").length;
  check("At most one concurrent PENDING succeeds", successes6 === 1, `${successes6}/2 succeeded`);

  console.log("\n=== Scenario 7: Index predicate is PENDING/RUNNING only ===");
  const indexes = await prisma.$queryRaw<{ indexname: string, indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'MonitoringJob' AND indexname = 'MonitoringJob_active_job_per_account';
  `;
  const idxFound = indexes.length > 0;
  const idxDef = idxFound ? indexes[0].indexdef : "";
  const hasPending = idxDef.includes("PENDING");
  const hasRunning = idxDef.includes("RUNNING");
  const hasCompleted = idxDef.includes("COMPLETED");
  const hasFailed = idxDef.includes("FAILED");
  check("Index exists", idxFound, `name=${idxDef.split(" ")[0]}`);
  check("Predicate includes PENDING", hasPending, "");
  check("Predicate includes RUNNING", hasRunning, "");
  check("Predicate excludes COMPLETED", !hasCompleted, "");
  check("Predicate excludes FAILED", !hasFailed, "");

  await cleanupData();
  await prisma.$disconnect();

  return results;
}

async function main(): Promise<void> {
  console.log("=== MonitoringJob Partial Unique Index Verification ===");
  console.log("Index: MonitoringJob_active_job_per_account");
  console.log("Predicate: status IN ('PENDING', 'RUNNING')");
  console.log("Scope: one active job per accountId\n");

  const results = await runScenarios();

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log("\n" + "=".repeat(60));
  console.log("INDEX VERIFICATION RESULTS");
  console.log("=".repeat(60));
  console.log(`Total: ${total}, Passed: ${passed}, Failed: ${total - passed}`);
  console.log("");

  if (total - passed > 0) {
    console.log("*** INDEX VERIFICATION FAILED ***");
    process.exit(1);
  } else {
    console.log("*** ALL INDEX VERIFICATION SCENARIOS PASSED ***");
  }
}

main().catch(async (e: unknown) => {
  const err = e as Error;
  console.error("FATAL:", err.message);
  await prisma.$disconnect();
  process.exit(1);
});
