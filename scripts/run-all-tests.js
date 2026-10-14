(async () => {
  const { default: fs } = await import('node:fs');
  const { default: path } = await import('node:path');
  const { createRequire } = await import('node:module');
  const projectRoot = path.resolve(__dirname, '..');
  process.chdir(projectRoot);

  const { register } = await import('tsx/esm/api');
  register();
  const { TEST_DATABASE_URL } = await import('../tests/support/test-env.ts');
  const { default: childProcess } = await import('node:child_process');
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  const tsxCli = projectRequire.resolve('tsx/cli');

  const testsDir = path.join(projectRoot, 'tests');
  const testFiles = fs.readdirSync(testsDir)
    .filter((file) => file.endsWith('.test.ts'))
    .sort()
    .map((file) => path.join('tests', file));

  const childEnv = { ...process.env, TEST_DATABASE_URL };
  delete childEnv.DATABASE_URL;
  delete childEnv.DIRECT_URL;
  delete childEnv.PHASE33_ALLOW_PRODUCTION_DB;

  console.log('Found ' + testFiles.length + ' test files.\n');
  let totalPassed = 0;
  let totalFailed = 0;
  const results = [];

  for (const testFile of testFiles) {
    console.log('\n============================================================');
    console.log('Running: ' + testFile);
    console.log('============================================================');
    try {
      childProcess.execFileSync(process.execPath, [tsxCli, path.resolve(projectRoot, testFile)], {
        stdio: 'inherit',
        env: childEnv,
      });
      results.push({ file: testFile, status: 'PASS' });
      totalPassed += 1;
      console.log('✓ ' + testFile + ' PASSED');
    } catch {
      results.push({ file: testFile, status: 'FAIL' });
      totalFailed += 1;
      console.log('✗ ' + testFile + ' FAILED');
    }
  }

  console.log('\n============================================================');
  console.log('SUMMARY');
  console.log('============================================================');
  for (const result of results) {
    console.log('  ' + (result.status === 'PASS' ? '✓' : '✗') + ' ' + result.file + ' — ' + result.status);
  }
  console.log('\nTotal: ' + totalPassed + '/' + results.length + ' passed, ' + totalFailed + '/' + results.length + ' failed');
  if (totalFailed > 0) process.exitCode = 1;
})().catch(() => {
  process.exitCode = 1;
});
