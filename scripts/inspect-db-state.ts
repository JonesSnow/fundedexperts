const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const envPath = '.env.local';
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value;
    }
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('Connected to database\n');

    const tables = [
      { name: 'Trader', key: 'trader' },
      { name: 'Product', key: 'product' },
      { name: 'Ruleset', key: 'ruleset' },
      { name: 'RulesetVersion', key: 'rulesetVersion' },
      { name: 'Rule', key: 'rule' },
      { name: 'MT5Account', key: 'mT5Account' },
      { name: 'MonitoringJob', key: 'monitoringJob' },
      { name: 'Evaluation', key: 'evaluation' },
      { name: 'FundedAccount', key: 'fundedAccount' },
      { name: 'AccountAssignment', key: 'accountAssignment' },
      { name: 'RuleEvaluation', key: 'ruleEvaluation' },
      { name: 'RuleEvent', key: 'ruleEvent' },
      { name: 'AuditLog', key: 'auditLog' },
    ];

    for (const { name, key } of tables) {
      const model = prisma[key];
      if (!model) { console.log(`${name}: MODEL NOT FOUND`); continue; }
      try {
        const count = await model.count();
        console.log(`${name}: ${count} records`);
      } catch (e) {
        console.log(`${name}: ERROR - ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.log('\n--- Detailed check ---');
    try {
      const rulesetCount = await prisma.ruleset.count();
      const versionCount = await prisma.rulesetVersion.count();
      const ruleCount = await prisma.rule.count();
      const mt5Count = await prisma.mT5Account.count();
      const mjCount = await prisma.monitoringJob.count();
      const evalCount = await prisma.evaluation.count();
      const faCount = await prisma.fundedAccount.count();
      const aaCount = await prisma.accountAssignment.count();
      const reCount = await prisma.ruleEvaluation.count();
      const re2Count = await prisma.ruleEvent.count();
      const alCount = await prisma.auditLog.count();
      const tCount = await prisma.trader.count();
      const pCount = await prisma.product.count();
      console.log(`Summary: traders=${tCount}, products=${pCount}, rulesets=${rulesetCount}, versions=${versionCount}, rules=${ruleCount}, mt5=${mt5Count}, jobs=${mjCount}, evals=${evalCount}, funded=${faCount}, assignments=${aaCount}, ruleEvals=${reCount}, ruleEvents=${re2Count}, audit=${alCount}`);
    } catch (e) {
      console.log(`Summary error: ${e instanceof Error ? e.message : String(e)}`);
    }

    console.log('\n--- Checking FK integrity ---');

    try {
      const evals = await prisma.evaluation.findMany({ take: 10 });
      console.log(`\nEvaluations found: ${evals.length}`);
      for (const ev of evals) {
        const trader = await prisma.trader.findUnique({ where: { id: ev.traderId } });
        const version = await prisma.rulesetVersion.findUnique({ where: { id: ev.rulesetVersionId } });
        console.log(`  Eval ${ev.id.substring(0, 12)}: trader=${trader ? 'EXISTS' : 'MISSING'}, version=${version ? 'EXISTS' : 'MISSING'}`);
      }
    } catch (e) {
      console.log(`Eval check: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const accts = await prisma.mT5Account.findMany({ take: 10 });
      console.log(`\nMT5Accounts found: ${accts.length}`);
      for (const a of accts) {
        const jobs = await prisma.monitoringJob.count({ where: { accountId: a.id } });
        const assignments = await prisma.accountAssignment.count({ where: { accountId: a.id } });
        const evals = await prisma.evaluation.count({ where: { accountId: a.id } });
        console.log(`  Acct ${a.id.substring(0, 12)} (${a.status}): jobs=${jobs}, assign=${assignments}, evals=${evals}`);
      }
    } catch (e) {
      console.log(`Account check: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const mjs = await prisma.monitoringJob.findMany({ take: 10 });
      console.log(`\nMonitoringJobs found: ${mjs.length}`);
      for (const j of mjs) {
        const acct = await prisma.mT5Account.findUnique({ where: { id: j.accountId } });
        console.log(`  Job ${j.jobId}: account=${acct ? 'EXISTS' : 'MISSING'}`);
      }
    } catch (e) {
      console.log(`Job check: ${e instanceof Error ? e.message : String(e)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
