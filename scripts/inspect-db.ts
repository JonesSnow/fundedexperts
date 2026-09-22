import "dotenv/config";
import { PrismaClient, MonitoringJob, JobStatus } from "@prisma/client";

const prisma = new PrismaClient();

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
  const account = await prisma.mT5Account.create({
    data: {
      id: "test-acc-001",
      accountNumber: "80012345",
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
        jobId: "test-dup-1",
        accountId: "test-acc-001",
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
        jobId: "test-dup-2",
        accountId: "test-acc-001",
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
        jobId: "test-dup-3",
        accountId: "test-acc-001",
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
        jobId: "test-dup-4",
        accountId: "test-acc-001",
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
  const account2 = await prisma.mT5Account.create({
    data: {
      id: "test-acc-002",
      accountNumber: "80012346",
      broker: "XM",
      server: "Server-XM",
      login: "12345679",
      status: "AVAILABLE",
    },
  });
  try {
    await prisma.monitoringJob.create({
      data: {
        jobId: "test-dup-5",
        accountId: "test-acc-002",
        workerId: "w5",
      },
    });
    console.log("PASS: Different account job created");
  } catch (e: unknown) {
    const err = e as { code?: string; message: string };
    console.log(`FAIL: Different account: ${err.code} - ${err.message}`);
  }

  // Cleanup
  await prisma.monitoringJob.deleteMany({ where: { accountId: { in: ["test-acc-001", "test-acc-002"] } } });
  await prisma.mT5Account.deleteMany({ where: { id: { in: ["test-acc-001", "test-acc-002"] } } });

  console.log("\n=== DONE ===");
  await prisma.$disconnect();
}

main().catch(async (e: unknown) => {
  const err = e as Error;
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
