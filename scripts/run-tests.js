const fs = require('fs');
const path = require('path');

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

const target = process.argv[2];
const args = process.argv.slice(3);
const { execSync } = require('child_process');

if (!target) {
  console.error('Usage: node run-tests.js <command> [args...]');
  console.error('Example: node run-tests.js npx tsx tests/auth.test.ts');
  process.exit(1);
}

try {
  execSync(`${target} ${args.join(' ')}`, { stdio: 'inherit', env: process.env, shell: true });
} catch {
  process.exit(1);
}
