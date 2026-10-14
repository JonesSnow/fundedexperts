/**
 * Test environment bootstrap.
 *
 * Import this before application modules or Prisma clients in every
 * database-capable test and database utility. It validates a dedicated test
 * URL before setting DATABASE_URL, then redirects Prisma to that verified URL.
 * .env.local may supply non-database secrets; its database URLs are kept only
 * as comparison references and never become the test connection target.
 */
import { readFileSync } from "fs";
import { join, resolve } from "path";
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
    allowedHosts: process.env.PHASE33_TEST_DB_HOST_ALLOWLIST,
    productionDatabaseUrls: [localFileEnv.DATABASE_URL, localFileEnv.DIRECT_URL]
      .filter((value): value is string => Boolean(value?.trim())),
  }
);

// No Prisma client or query is created before the guard above succeeds.
mutableEnv.DATABASE_URL = verification.resolved.url;
mutableEnv.DIRECT_URL = verification.resolved.url;
mutableEnv.NODE_ENV = "test";
mutableEnv.EMAIL_MODE = "console";

export const TEST_DATABASE_URL = verification.resolved.url;
export const TEST_DATABASE_SAFETY_REPORT = verification.report;
