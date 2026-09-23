const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envPath = path.join(__dirname, '..', '.env.local');
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

const required = ['DATABASE_URL', 'JWT_SECRET', 'MT5_ENCRYPTION_KEY'];
for (const varName of required) {
  if (!process.env[varName]) {
    console.error(`ERROR: Required environment variable ${varName} is not set and .env.local could not be loaded.`);
    process.exit(1);
  }
}

const testsDir = path.join(__dirname, '..', 'tests');
const testFiles = fs.readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => path.join('tests', f));

const resetScript = path.join(__dirname, 'test-reset.cjs');

console.log(`Found ${testFiles.length} test files:\n`);
for (const f of testFiles) {
  console.log(`  - ${f}`);
}
console.log('');

let totalPassed = 0;
let totalFailed = 0;
const results = [];

for (const testFile of testFiles) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`DB RESET before: ${testFile}`);
  console.log('='.repeat(60));
  try {
    execSync(`node ${resetScript}`, { stdio: 'inherit', env: process.env, shell: true });
  } catch {
    console.log(`Reset failed, continuing anyway`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${testFile}`);
  console.log('='.repeat(60));
  try {
    execSync(`npx tsx ${testFile}`, { stdio: 'inherit', env: process.env, shell: true });
    results.push({ file: testFile, status: 'PASS' });
    console.log(`\u2713 ${testFile} PASSED`);
  } catch {
    results.push({ file: testFile, status: 'FAIL' });
    console.log(`\u2717 ${testFile} FAILED`);
    totalFailed++;
    continue;
  }
  totalPassed++;
}

console.log(`\n\n${'='.repeat(60)}`);
console.log('SUMMARY');
console.log('='.repeat(60));
for (const r of results) {
  const icon = r.status === 'PASS' ? '\u2713' : '\u2717';
  console.log(`  ${icon} ${r.file} — ${r.status}`);
}
console.log(`\nTotal: ${totalPassed}/${results.length} passed, ${totalFailed}/${results.length} failed`);

if (totalFailed > 0) {
  process.exit(1);
}
