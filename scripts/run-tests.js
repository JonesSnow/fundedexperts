(async () => {
  const { default: path } = await import('node:path');
  const { default: fs } = await import('node:fs');
  const projectRoot = path.resolve(__dirname, '..');
  process.chdir(projectRoot);

  const { register } = await import('tsx/esm/api');
  register();
  const { TEST_DATABASE_CLEANUP_CONFIRMATION_VALUE } = await import('../lib/test-cleanup-guard.ts');
  const { TEST_DATABASE_URL } = await import('../tests/support/test-env.ts');
  const { default: childProcess } = await import('node:child_process');
  const { createRequire } = await import('node:module');

  const target = process.argv[2];
  const args = process.argv.slice(3);
  if (!target) {
    console.error('Usage: node scripts/run-tests.js npx tsx tests/<file>.test.ts');
    console.error('A dedicated TEST_DATABASE_URL or PHASE33_DATABASE_URL is required.');
    process.exit(1);
  }

  const testsRoot = path.resolve(projectRoot, 'tests');
  const requestedFile = args[1];
  const testFile = requestedFile ? path.resolve(projectRoot, requestedFile) : '';
  const relativeTestFile = testFile ? path.relative(testsRoot, testFile) : '';
  const isWithinTests = relativeTestFile !== '' &&
    relativeTestFile !== '..' &&
    !relativeTestFile.startsWith('..' + path.sep) &&
    !path.isAbsolute(relativeTestFile);
  const isSupportedTestFile = isWithinTests &&
    (/\.test\.ts$/i.test(relativeTestFile) ||
      ['phase33-e2e.ts', path.join('monitoring', 'persistence.ts')].includes(relativeTestFile));
  let realTestFile = '';
  let realTestRelativePath = '';
  try {
    realTestFile = fs.realpathSync(testFile);
    realTestRelativePath = path.relative(fs.realpathSync(testsRoot), realTestFile);
  } catch {
    // The validation below reports a missing or unresolvable test file.
  }
  const realPathStaysUnderTests = realTestRelativePath !== '..' &&
    !realTestRelativePath.startsWith('..' + path.sep) &&
    !path.isAbsolute(realTestRelativePath);

  if (target !== 'npx' || args.length !== 2 || args[0] !== 'tsx' || !isSupportedTestFile ||
      !realPathStaysUnderTests || !fs.existsSync(testFile) || !fs.statSync(testFile).isFile()) {
    console.error('Only a single tsx test file under tests/ can be run through this guarded runner.');
    process.exit(1);
  }

  const testSource = fs.readFileSync(realTestFile, 'utf8');
  const hasGlobalCleanup = /\.deleteMany\s*\(\s*\{\s*\}\s*\)/.test(testSource)
    || /\bTRUNCATE\b[\s\S]{0,160}\bCASCADE\b/i.test(testSource);
  if (hasGlobalCleanup && process.env.TEST_DATABASE_CLEANUP_CONFIRMATION !== TEST_DATABASE_CLEANUP_CONFIRMATION_VALUE) {
    throw new Error('Database test refused before launch: this suite uses global cleanup and requires TEST_DATABASE_CLEANUP_CONFIRMATION.');
  }

  const childEnv = { ...process.env, TEST_DATABASE_URL };
  delete childEnv.DATABASE_URL;
  delete childEnv.DIRECT_URL;
  delete childEnv.PHASE33_ALLOW_PRODUCTION_DB;

  try {
    const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
    const tsxCli = projectRequire.resolve('tsx/cli');
    childProcess.execFileSync(process.execPath, [tsxCli, realTestFile], {
      stdio: 'inherit',
      env: childEnv,
    });
  } catch {
    process.exitCode = 1;
  }
})().catch(() => {
  process.exitCode = 1;
});
