/**
 * Test environment bootstrap.
 *
 * Import this before application modules or Prisma clients in every
 * database-capable test and database utility. It validates a dedicated test
 * URL before setting DATABASE_URL, then redirects Prisma to that verified URL.
 * The operator must explicitly attest that the target is a disposable local
 * test database. .env.local is only used as a comparison reference and source
 * for non-database settings.
 */
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mergeTestEnvironmentFileValues, withVerifiedTestDatabase } from "./test-db-guard";

function loadEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (!name) continue;
    let value = trimmed.slice(eq + 1).trim();
    const dq = value.startsWith('"') && value.endsWith('"');
    const sq = value.startsWith("'") && value.endsWith("'");
    if (dq || sq) value = value.slice(1, -1);
    out[name] = value;
  }
  return out;
}

const root = resolve(__dirname, "../..");
// .env.test.local is the only file allowed to supply a test database URL.
const testFileEnv = loadEnvFile(join(root, ".env.test.local"));
const localFileEnv = loadEnvFile(join(root, ".env.local"));
const fileEnv = mergeTestEnvironmentFileValues(testFileEnv, localFileEnv);

for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const mutableEnv = process.env as unknown as Record<string, string | undefined>;
const verification = withVerifiedTestDatabase(
  process.env as NodeJS.ProcessEnv,
  ({ resolved, report }) => ({ resolved, report }),
  {
    productionDatabaseUrls: [localFileEnv.DATABASE_URL, localFileEnv.DIRECT_URL]
      .filter((value): value is string => Boolean(value?.trim())),
  }
);

// The URL and operator attestation are only the first safety layer. Before
// allowing a caller to construct its own client or run a migration, launch a
// separate guarded process that reads the actual server-reported identity.
// This keeps the bootstrap synchronous for the project's CommonJS test mode.
const projectRequire = createRequire(join(root, "package.json"));
const identityCheckEnv: NodeJS.ProcessEnv = {
  ...process.env,
  TEST_DATABASE_URL: verification.resolved.url,
};
if (localFileEnv.DATABASE_URL?.trim()) identityCheckEnv.DATABASE_URL = localFileEnv.DATABASE_URL;
if (localFileEnv.DIRECT_URL?.trim()) identityCheckEnv.DIRECT_URL = localFileEnv.DIRECT_URL;
const identityCheck = spawnSync(
  process.execPath,
  [
    projectRequire.resolve("tsx/cli"),
    join(root, "scripts", "verify-test-database-identity.ts"),
  ],
  {
    cwd: root,
    env: identityCheckEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000,
  },
);
if (identityCheck.error || identityCheck.status !== 0) {
  throw new Error("Refusing database-backed work because the connected test database identity could not be verified.");
}

// No Prisma client or query is created before the guard above succeeds.
mutableEnv.DATABASE_URL = verification.resolved.url;
mutableEnv.DIRECT_URL = verification.resolved.url;
mutableEnv.NODE_ENV = "test";
mutableEnv.EMAIL_MODE = "console";

export const TEST_DATABASE_URL = verification.resolved.url;
export const TEST_DATABASE_SAFETY_REPORT = verification.report;
