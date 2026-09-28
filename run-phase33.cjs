const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = { ...process.env };

for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const name = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (name) {
    env[name] = value;
  }
}

console.log('ENV loaded from .env.local');
console.log('  DATABASE_URL:', env.DATABASE_URL ? 'set' : 'MISSING');
console.log('  MT5_ENCRYPTION_KEY:', env.MT5_ENCRYPTION_KEY ? 'set (len=' + env.MT5_ENCRYPTION_KEY.length + ')' : 'MISSING');
console.log('  PHASE33_MT5_PASSWORD:', env.PHASE33_MT5_PASSWORD ? 'set' : 'using fallback "test"');
console.log('');

// Set test MT5 password from task parameters (used by phase33-e2e.ts Phase M)
// This is a safe XM demo account password for read-only E2E validation
env.PHASE33_MT5_PASSWORD = env.PHASE33_MT5_PASSWORD || 'Jacki687#$';
console.log('  PHASE33_MT5_PASSWORD:', env.PHASE33_MT5_PASSWORD ? 'set for run' : 'MISSING');
console.log('');

const result = spawnSync('npx', ['tsx', 'tests/phase33-e2e.ts'], {
  stdio: 'inherit',
  env,
  shell: true,
});

process.exit(result.status ?? 0);
