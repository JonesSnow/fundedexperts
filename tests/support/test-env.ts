/**
 * Test environment bootstrap.
 *
 * MUST be the first import in any test file that loads application modules,
 * because `lib/auth/session.ts` reads JWT_SECRET and `lib/db.ts` resolves
 * DATABASE_URL at module-evaluation time.
 *
 * Loads .env.test.local (never .env.local, which points at production), then
 * repoints DATABASE_URL at the verified test database so module-scope Prisma
 * clients in application code cannot reach production.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { resolveAndVerifyTestDatabase } from "./test-db-guard";

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

const root = process.cwd();

// .env.test.local holds the dedicated test database and its allowlist marker.
const fileEnv = loadEnvFile(join(root, ".env.test.local"));

// .env.local is read only for non-database secrets (JWT_SECRET is needed to mint
// real session cookies). DATABASE_URL is deliberately excluded so the production
// connection string is never placed into the environment at all.
const localEnv = loadEnvFile(join(root, ".env.local"));
for (const key of Object.keys(localEnv)) {
  if (key === "DATABASE_URL" || key === "DIRECT_URL") continue;
  fileEnv[key] = localEnv[key];
}

for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

// NODE_ENV is typed read-only on ProcessEnv; assign through a mutable view.
const mutableEnv = process.env as unknown as Record<string, string | undefined>;
mutableEnv.NODE_ENV = "test";
mutableEnv.EMAIL_MODE = "console";

// Reuse the production-isolation guard rather than trusting the file we just read.
const { resolved } = resolveAndVerifyTestDatabase(
  process.env as NodeJS.ProcessEnv,
  { allowedHosts: process.env.PHASE33_TEST_DB_HOST_ALLOWLIST }
);

mutableEnv.DATABASE_URL = resolved.url;

export const TEST_DATABASE_URL = resolved.url;