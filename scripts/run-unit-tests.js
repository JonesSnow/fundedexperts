(async () => {
  const { default: path } = await import('node:path');
  const { createRequire } = await import('node:module');
  const { default: childProcess } = await import('node:child_process');
  const { default: fs } = await import('node:fs');
  const projectRoot = path.resolve(__dirname, '..');
  process.chdir(projectRoot);

  const unitTestFiles = [
    'tests/account-status-safety.unit.test.ts',
    'tests/account-inventory-pagination.unit.test.ts',
    'tests/admin-mt5-credential-safety.test.ts',
    'tests/admin-audit-logs-api.test.ts',
    'tests/admin-authorization-policy.unit.test.ts',
    'tests/admin-lifecycle-identity.unit.test.ts',
    'tests/admin-draft-editors.unit.test.ts',
    'tests/order-activation-rate-limit.unit.test.ts',
    'tests/order-idempotency.unit.test.ts',
    'tests/funded-account-link-policy.unit.test.ts',
    'tests/funded-account-approval-safety.unit.test.ts',
    'tests/funded-account-transition-policy.unit.test.ts',
    'tests/funded-account-admin-ui.unit.test.ts',
    'tests/auth-abuse-protection.unit.test.ts',
    'tests/auth-rate-limit-capacity.unit.test.ts',
    'tests/auth-notification-logging.unit.test.ts',
    'tests/dashboard-data-contract.unit.test.ts',
    'tests/auth-login-policy.unit.test.ts',
    'tests/auth-registration-rate-limit.unit.test.ts',
    'tests/registration-enumeration.unit.test.ts',
    'tests/auth-session.unit.test.ts',
    'tests/coupon-redemption.unit.test.ts',
    'tests/auth-otp.unit.test.ts',
    'tests/evaluation-engine.test.ts',
    'tests/evaluation-stage-progression.unit.test.ts',
    'tests/evaluation-account-privacy.unit.test.ts',
    'tests/migration-chain-static.test.ts',
    'tests/mt5-accounts.test.ts',
    'tests/payment-abstraction.test.ts',
    'tests/payment-verification.unit.test.ts',
    'tests/crypto-payment-verification.unit.test.ts',
    'tests/payment-endpoint-safety.test.ts',
    'tests/legacy-activation-disabled.unit.test.ts',
    'tests/phase33-db-guard.test.ts',
    'tests/development-migration-command.unit.test.ts',
    'tests/product-domain.test.ts',
    'tests/product-experience-contract.test.ts',
    'tests/product-experience-display.test.ts',
    'tests/working-plan-preview.unit.test.ts',
    'tests/products-and-rulesets.test.ts',
    'tests/product-approval.unit.test.ts',
    'tests/products-api-contract.test.ts',
    'tests/public-api-error.test.ts',
    'tests/public-read-rate-limit.unit.test.ts',
    'tests/public-catalog.test.ts',
    'tests/rule-capabilities.test.ts',
    'tests/ruleset-visibility.unit.test.ts',
    'tests/ruleset-mutation-safety.unit.test.ts',
    'tests/ledger-integrity.unit.test.ts',
    'tests/test-db-safety.test.ts',
    'tests/development-database-guard.unit.test.ts',
    'tests/monitoring/credential-boundary.test.ts',
    'tests/monitoring/eligibility.test.ts',
    'tests/monitoring/health.test.ts',
    'tests/monitoring/ingestion-policy.test.ts',
    'tests/monitoring/job.test.ts',
    'tests/monitoring/logger.test.ts',
    'tests/monitoring/mock-adapter.test.ts',
    'tests/monitoring/production-adapter-safety.unit.test.ts',
    'tests/monitoring/normalize.test.ts',
    'tests/monitoring/normalization-safety.test.ts',
    'tests/monitoring/runner-normalization-safety.test.ts',
    'tests/monitoring/runner-pipeline-release-failure.unit.test.ts',
    'tests/monitoring/runner-eligibility.test.ts',
    'tests/monitoring/worker-runtime.unit.test.ts',
    'tests/monitoring/retry.test.ts',
    'tests/monitoring/scheduler.test.ts',
    'tests/monitoring/security.test.ts',
    'tests/monitoring/worker.test.ts',
    'tests/order-notification.test.ts',
    'tests/order-cancellation.unit.test.ts',
    'tests/order-history-pagination.unit.test.ts',
    'tests/notification-pagination.unit.test.ts',
    'tests/security-headers.unit.test.ts',
  ];

  for (const file of unitTestFiles) {
    const absolutePath = path.resolve(projectRoot, file);
    if (!fs.existsSync(absolutePath)) throw new Error(`Configured unit test is missing: ${file}`);
    const source = fs.readFileSync(absolutePath, 'utf8');
    if (
      /^\s*import\s+["'][^"']*support\/test-env["']/m.test(source) ||
      /^\s*await\s+import\(["'][^"']*support\/test-env["']\)/m.test(source) ||
      /\bnew\s+PrismaClient\s*\(/.test(source)
    ) {
      throw new Error(`Database-capable test must not be in the database-free unit suite: ${file}`);
    }
  }

  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  const tsxCli = projectRequire.resolve('tsx/cli');
  const childEnv = {
    PATH: process.env.PATH ?? '',
    NODE_ENV: 'test',
    EMAIL_MODE: 'console',
    JWT_SECRET: 'unit-test-only-secret-do-not-use-outside-this-test-process',
  };
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) childEnv[key] = process.env[key];
  }

  let failed = 0;
  for (const file of unitTestFiles) {
    console.log(`\nRunning database-free suite: ${file}`);
    try {
      childProcess.execFileSync(process.execPath, [tsxCli, path.resolve(projectRoot, file)], {
        cwd: projectRoot,
        stdio: 'inherit',
        env: childEnv,
      });
    } catch {
      failed += 1;
      console.error(`FAILED: ${file}`);
    }
  }

  console.log(`\nDatabase-free suites: ${unitTestFiles.length - failed}/${unitTestFiles.length} passed.`);
  if (failed > 0) process.exitCode = 1;
})().catch(() => {
  console.error('Database-free test runner failed before completing; details are redacted.');
  process.exitCode = 1;
});
