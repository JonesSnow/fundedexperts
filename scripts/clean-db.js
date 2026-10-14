(async () => {
  const { default: path } = await import('node:path');
  process.chdir(path.resolve(__dirname, '..'));

  const { register } = await import('tsx/esm/api');
  register();
  await import('../tests/support/test-env.ts');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const tables = [
      'CouponUsage', 'Coupon', 'OrderItem', 'Order',
      'Product', 'RulesetVersion', 'Ruleset', 'Trader', 'LedgerEntry',
    ];
    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe('TRUNCATE TABLE "' + table + '" CASCADE');
        console.log('Truncated ' + table);
      } catch {
        console.error('Failed to clean table ' + table);
        process.exitCode = 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch(() => {
  console.error('Cleanup stopped: dedicated test database validation or cleanup failed.');
  process.exitCode = 1;
});
