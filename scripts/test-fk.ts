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
    console.log('Connected\n');

    console.log('Step 1: Clean all data');
    await prisma.ruleEvaluation.deleteMany({});
    await prisma.monitoringJob.deleteMany({});
    await prisma.accountAssignment.deleteMany({});
    await prisma.evaluation.deleteMany({});
    await prisma.rule.deleteMany({});
    await prisma.rulesetVersion.deleteMany({});
    await prisma.ruleset.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.mT5Account.deleteMany({});
    await prisma.trader.deleteMany({});
    await prisma.auditLog.deleteMany({});
    console.log('Cleaned');

    console.log('\nStep 2: Create trader');
    const trader = await prisma.trader.create({
      data: { email: 'test-fk@test.example', password: 'TestPass123', role: 'TRADER' },
    });
    console.log(`Trader created: ${trader.id}`);

    console.log('\nStep 3: Create ruleset');
    const ruleset = await prisma.ruleset.create({ data: { name: 'fk-test-ruleset' } });
    console.log(`Ruleset created: ${ruleset.id}`);

    console.log('\nStep 4: Create rulesetVersion');
    const version = await prisma.rulesetVersion.create({
      data: { rulesetId: ruleset.id, version: '1.0', status: 'PUBLISHED' },
    });
    console.log(`Version created: ${version.id}`);

    console.log('\nStep 5: Create evaluation');
    const eval_ = await prisma.evaluation.create({
      data: { traderId: trader.id, rulesetVersionId: version.id, status: 'IN_PROGRESS' },
    });
    console.log(`Evaluation created: ${eval_.id}`);

    console.log('\nStep 6: Create MT5Account');
    const acct = await prisma.mT5Account.create({
      data: { accountNumber: 'FK-TEST-001', status: 'AVAILABLE', accountSize: 100000, purpose: 'EVALUATION' },
    });
    console.log(`Account created: ${acct.id}`);

    console.log('\nAll FK tests PASSED');

    console.log('\nStep 7: Check counts');
    console.log(`traders: ${await prisma.trader.count()}`);
    console.log(`rulesets: ${await prisma.ruleset.count()}`);
    console.log(`versions: ${await prisma.rulesetVersion.count()}`);
    console.log(`evals: ${await prisma.evaluation.count()}`);
    console.log(`accounts: ${await prisma.mT5Account.count()}`);
  } catch (e) {
    console.error('\nERROR:', e instanceof Error ? e.message : String(e));
    console.error('Code:', e.code);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
