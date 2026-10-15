(async () => {
  const { default: path } = await import('node:path');
  process.chdir(path.resolve(__dirname, '..'));

  const { register } = await import('tsx/esm/api');
  register();
  const { TEST_DATABASE_URL } = await import('../tests/support/test-env.ts');
  const { default: childProcess } = await import('node:child_process');

  const migrationEnv = {
    ...process.env,
    TEST_DATABASE_URL,
    DATABASE_URL: TEST_DATABASE_URL,
    DIRECT_URL: TEST_DATABASE_URL,
  };
  delete migrationEnv.PHASE33_ALLOW_PRODUCTION_DB;
  delete migrationEnv.TEST_DATABASE_CLEANUP_CONFIRMATION;

  try {
    childProcess.execSync('pnpm exec prisma migrate deploy', {
      stdio: 'inherit',
      env: migrationEnv,
      shell: true,
    });
  } catch {
    process.exitCode = 1;
  }
})().catch(() => {
  console.error('Migration stopped before completion. Check the dedicated test database configuration and migration status.');
  process.exitCode = 1;
});
