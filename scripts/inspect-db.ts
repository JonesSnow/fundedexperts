import "../tests/support/test-env";
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient, JobStatus } from "@prisma/client";

const prisma = new PrismaClient();
const runId = randomUUID();
const accountOneId = `test-acc-${runId}-1`;
const accountTwoId = `test-acc-${runId}-2`;

async function main() {
  console.log("=== INDEXES ===");
  const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'MonitoringJob' ORDER BY indexname;
  `;
  for (const idx of indexes) {
    console.log(`${idx.indexname}: ${idx.indexdef}`);
  }

  console.log("\n=== CONSTRAINTS ===");
  const constraints = await prisma.$queryRaw<{ conname: string; definition: string }[]>`
    SELECT conname, pg_get_constraintdef(oid) as definition FROM pg_constraint WHERE conrelid = '"MonitoringJob"'::regclass ORDER BY conname;
  `;
  for (const c of constraints) {
    console.log(`${c.conname}: ${c.definition}`);
  }

  console.log("\n=== DUPLICATE CONSTRAINT TEST ===");
  await prisma.mT5Account.create({
    data: {
      id: accountOneId,
      accountNumber: `verify-${runId}-1`,
      broker: "XM",
      server: "Server-XM",
      login: "12345678",
      status: "AVAILABLE",
    },
  });
  console.log("Created test account");

  // Test 1: First PENDING job should succeed
  try {
    const j1 = await prisma.monitoringJob.create({
      data: {
        jobId: `${runId}-dup-1`,
        accountId: accountOneId,
        workerId: "w1",
      },
    });
    void j1;
    console.log("PASS: Created first PENDING job");
  } catch (e: unknown) {
    const err = e as { code?: string; message: string };
    console.log(`FAIL: First PENDING job: ${err.code} - ${err.message}`);
  }

  // Test 2: Second PENDING job should be blocked by unique index
  try {
    await prisma.monitoringJob.create({
      data: {
        jobId: `${runId}-dup-2`,
        accountId: accountOneId,
        workerId: "w2",
      },
    });
    console.log("FAIL: Second PENDING job succeeded (should be blocked)");
  } catch (e: unknown) {
    const err = e as { code?: string; message: string };
    if (err.code === "P2002") {
      console.log("PASS: Second PENDING job blocked by unique constraint");
    } else {
      console.log(`UNEXPECTED: ${err.code} - ${err.message}`);
    }
  }

  // Test 3: RUNNING job should also be blocked
  try {
    await prisma.monitoringJob.create({
      data: {
        jobId: `${runId}-dup-3`,
        accountId: accountOneId,
        workerId: "w3",
        status: "RUNNING" as JobStatus,
      },
    });
    console.log("FAIL: RUNNING job succeeded (should be blocked)");
  } catch (e: unknown) {
    const err = e as { code?: string; message: string };
    if (err.code === "P2002") {
      console.log("PASS: RUNNING job blocked by unique constraint");
    } else {
      console.log(`UNEXPECTED: ${err.code} - ${err.message}`);
    }
  }

  // Test 4: COMPLETED job should succeed (not in index)
  try {
    await prisma.monitoringJob.create({
      data: {
        jobId: `${runId}-dup-4`,
        accountId: accountOneId,
        workerId: "w4",
        status: "COMPLETED" as JobStatus,
      },
    });
    console.log("PASS: COMPLETED job created (not constrained)");
  } catch (e: unknown) {
    const err = e as { code?: string; message: string };
    console.log(`FAIL: COMPLETED job: ${err.code} - ${err.message}`);
  }

  // Test 5: Different account should succeed
  await prisma.mT5Account.create({
    data: {
      id: accountTwoId,
      accountNumber: `verify-${runId}-2`,
      broker: "XM",
      server: "Server-XM",
      login: "12345679",
      status: "AVAILABLE",
    },
  });
  try {
    await prisma.monitoringJob.create({
      data: {
        jobId: `${runId}-dup-5`,
        accountId: accountTwoId,
        workerId: "w5",
      },
    });
    console.log("PASS: Different account job created");
  } catch (e: unknown) {
    const err = e as { code?: string; message: string };
    console.log(`FAIL: Different account: ${err.code} - ${err.message}`);
  }

  // Cleanup
  await prisma.monitoringJob.deleteMany({ where: { accountId: { in: [accountOneId, accountTwoId] } } });
  await prisma.mT5Account.deleteMany({ where: { id: { in: [accountOneId, accountTwoId] } } });

  console.log("\n=== DONE ===");
  await prisma.$disconnect();
}

main().catch(async (e: unknown) => {
  const err = e as Error;
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
