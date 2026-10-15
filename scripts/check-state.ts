import "../tests/support/test-env";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('Connected\n');

    const account = await prisma.mT5Account.findUnique({ where: { id: 'acc-monitoring-PERSISTENT-VERIFY' } });
    console.log('Persistent account exists:', !!account);

    const jobs = await prisma.monitoringJob.findMany({
      where: { accountId: 'acc-monitoring-PERSISTENT-VERIFY' },
    });
    console.log('Jobs for persistent account:', jobs.length);

    const allAccounts = await prisma.mT5Account.findMany();
    console.log('\nAll MT5 accounts:', allAccounts.length);
    for (const a of allAccounts) {
      console.log(`  ${a.id.substring(0, 30)}: ${a.accountNumber} (${a.status})`);
    }

    const allJobs = await prisma.monitoringJob.findMany({ take: 10 });
    console.log('\nAll monitoring jobs:', allJobs.length);
    for (const j of allJobs) {
      console.log(`  ${j.jobId}: account=${j.accountId.substring(0, 30)}, status=${j.status}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
