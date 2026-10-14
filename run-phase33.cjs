(async () => {
  const { default: path } = await import('node:path');
  process.chdir(path.resolve(__dirname));

  const { register } = await import('tsx/esm/api');
  register();
  const { TEST_DATABASE_URL } = await import('./tests/support/test-env.ts');
  const { default: childProcess } = await import('node:child_process');
  const { createRequire } = await import('node:module');
  const projectRequire = createRequire(path.join(__dirname, 'package.json'));
  const tsxCli = projectRequire.resolve('tsx/cli');

  const env = { ...process.env, TEST_DATABASE_URL };
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  delete env.PHASE33_ALLOW_PRODUCTION_DB;
  env.PHASE33_MT5_PASSWORD = env.PHASE33_MT5_PASSWORD || '';

  console.log('Phase 33 E2E runner');
  console.log('  Dedicated test database: validated');
  console.log('  MT5_ENCRYPTION_KEY: ' + (env.MT5_ENCRYPTION_KEY ? 'set' : 'missing'));
  console.log('  PHASE33_MT5_PASSWORD: ' + (env.PHASE33_MT5_PASSWORD ? 'set for run' : 'missing — Phase M will be skipped'));
  console.log('');

  childProcess.execFileSync(process.execPath, [tsxCli, path.join(__dirname, 'tests/phase33-e2e.ts')], {
    stdio: 'inherit',
    env,
  });
})().catch(() => {
  console.error('Phase 33 stopped: dedicated test database validation failed.');
  process.exitCode = 1;
});
