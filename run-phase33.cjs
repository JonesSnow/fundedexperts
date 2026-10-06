const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Loads .env.local values into the child environment without overwriting
// variables that are already present in the parent environment, so an explicit
// TEST_DATABASE_URL from the shell or CI always wins.
function loadEnvFile(filePath, base) {
  const env = { ...base };
  if (!fs.existsSync(filePath)) return env;

  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    if (!name || env[name]) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[name] = value;
  }
  return env;
}

// Load order (first writer wins, so later files only fill remaining gaps):
//   1. process.env            — explicit exports, always highest priority
//   2. .env.test.local        — dedicated test database + host allowlist
//   3. .env.local             — shared secrets (JWT, MT5 encryption key)
const env = loadEnvFile(
  path.resolve(process.cwd(), '.env.local'),
  loadEnvFile(path.resolve(process.cwd(), '.env.test.local'), { ...process.env })
);

// The Phase M MT5 password is a secret and is never stored in the repository.
// Supply it via the environment (or .env.local) before running the E2E test.
env.PHASE33_MT5_PASSWORD = env.PHASE33_MT5_PASSWORD || '';

// .env.local carries NODE_ENV=production for the application runtime. This
// process is a test harness, so run it as a test. The suite's safety guard
// refuses to execute under NODE_ENV=production, which is the desired
// behaviour: a test run must never be mistaken for a production run.
env.NODE_ENV = 'test';

console.log('Phase 33 E2E runner');
console.log('  TEST_DATABASE_URL:', env.TEST_DATABASE_URL ? 'set' : 'MISSING (required)');
console.log('  PHASE33_TEST_DB_HOST_ALLOWLIST:', env.PHASE33_TEST_DB_HOST_ALLOWLIST ? 'set' : 'not set');
console.log('  PHASE33_DATABASE_URL:', env.PHASE33_DATABASE_URL ? 'set (overrides TEST_DATABASE_URL)' : 'not set');
console.log('  MT5_ENCRYPTION_KEY:', env.MT5_ENCRYPTION_KEY ? 'set (len=' + env.MT5_ENCRYPTION_KEY.length + ')' : 'MISSING');
console.log('  PHASE33_MT5_PASSWORD:', env.PHASE33_MT5_PASSWORD ? 'set for run' : 'MISSING — Phase M will be skipped');
console.log('');

// The suite itself performs the production safety guard and aborts with exit
// code 2 if the target database is not a dedicated test database.
const result = spawnSync('npx', ['tsx', 'tests/phase33-e2e.ts'], {
  stdio: 'inherit',
  env,
  shell: true,
});

process.exit(result.status ?? 0);