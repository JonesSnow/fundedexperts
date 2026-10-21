(async () => {
  const { default: fs } = await import('node:fs');
  const { default: path } = await import('node:path');
  const { createRequire } = await import('node:module');
  const projectRoot = path.resolve(__dirname, '..');
  process.chdir(projectRoot);

  const { register } = await import('tsx/esm/api');
  register();
  const { TEST_DATABASE_CLEANUP_CONFIRMATION_VALUE } = await import('../lib/test-cleanup-guard.ts');
  const { TEST_DATABASE_URL } = await import('../tests/support/test-env.ts');
  const { default: childProcess } = await import('node:child_process');
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  const tsxCli = projectRequire.resolve('tsx/cli');

  const testsDir = path.join(projectRoot, 'tests');
  const hasGuardedTestBootstrap = (source) =>
    /^\s*import\s+(?:[^'"]+\s+from\s+)?["'][^"']*support\/test-env["']/m.test(source);
  const collectTests = (directory) => fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectTests(absolutePath);
      if (!entry.isFile() || !entry.name.endsWith('.test.ts')) return [];
      return hasGuardedTestBootstrap(fs.readFileSync(absolutePath, 'utf8')) ? [absolutePath] : [];
    });
  const explicitDatabaseSuites = [
    path.join(testsDir, 'phase33-e2e.ts'),
    path.join(testsDir, 'monitoring', 'persistence.ts'),
  ].filter((file) => fs.existsSync(file) && hasGuardedTestBootstrap(fs.readFileSync(file, 'utf8')));
  const testFiles = [...new Set([...collectTests(testsDir), ...explicitDatabaseSuites])]
    .sort()
    .map((file) => path.relative(projectRoot, file));

  const hasGlobalCleanup = testFiles.some((file) => {
    const source = fs.readFileSync(path.resolve(projectRoot, file), 'utf8');
    return /\.deleteMany\s*\(\s*\{\s*\}\s*\)/.test(source)
      || /\bTRUNCATE\b[\s\S]{0,160}\bCASCADE\b/i.test(source);
  });
  if (hasGlobalCleanup && process.env.TEST_DATABASE_CLEANUP_CONFIRMATION !== TEST_DATABASE_CLEANUP_CONFIRMATION_VALUE) {
    throw new Error('Database test run refused before launching suites: a selected suite uses global cleanup and requires TEST_DATABASE_CLEANUP_CONFIRMATION.');
  }

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
  console.error('Database test runner failed before completing its suite; details are redacted.');
  process.exitCode = 1;
});
