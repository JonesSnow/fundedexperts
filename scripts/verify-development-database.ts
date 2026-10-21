import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canonicalDatabaseIdentity,
  resolveDevelopmentDatabaseUrl,
} from "../lib/development-database-guard";

const DATABASE_KEYS = new Set([
  "DEVELOPMENT_DATABASE_URL",
  "DEVELOPMENT_DATABASE_CONFIRMATION",
  "PRODUCTION_DATABASE_URL",
  "DATABASE_URL",
  "DIRECT_URL",
]);

function readDatabaseEnvironment(): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
  } catch {
    return {};
  }
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^export\s+/, "");
    if (!trimmed || trimmed.startsWith("#")) continue;
    const split = trimmed.indexOf("=");
    if (split < 1) continue;
    const key = trimmed.slice(0, split).trim();
    if (!DATABASE_KEYS.has(key)) continue;
    let value = trimmed.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") {
    throw new Error("Development database verification is disabled outside development mode.");
  }
  const file = readDatabaseEnvironment();
  const env = {
    NODE_ENV: "development",
    DEVELOPMENT_DATABASE_URL: process.env.DEVELOPMENT_DATABASE_URL ?? file.DEVELOPMENT_DATABASE_URL,
    DEVELOPMENT_DATABASE_CONFIRMATION: process.env.DEVELOPMENT_DATABASE_CONFIRMATION ?? file.DEVELOPMENT_DATABASE_CONFIRMATION,
    PRODUCTION_DATABASE_URL: process.env.PRODUCTION_DATABASE_URL ?? file.PRODUCTION_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL ?? file.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL ?? file.DIRECT_URL,
  };

  // The URL and separation checks must pass before the Prisma module/client is loaded.
  const databaseUrl = resolveDevelopmentDatabaseUrl(env);
  const configuredIdentity = canonicalDatabaseIdentity(databaseUrl);
  if (!configuredIdentity) throw new Error("Development database identity is invalid.");
  const expected = new URL(databaseUrl);
  const expectedDatabase = decodeURIComponent(expected.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  const expectedRole = decodeURIComponent(expected.username);
  const expectedPort = Number(expected.port || "5432");

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    let rows: Array<{
      database_name: string;
      schema_name: string;
      role_name: string;
      server_address: string | null;
      server_port: number | null;
      server_version: string;
    }>;
    try {
      rows = await prisma.$queryRaw<Array<{
        database_name: string;
        schema_name: string;
        role_name: string;
        server_address: string | null;
        server_port: number | null;
        server_version: string;
      }>>`
        SELECT current_database() AS database_name,
               current_schema() AS schema_name,
               current_user AS role_name,
               inet_server_addr()::text AS server_address,
               inet_server_port() AS server_port,
               current_setting('server_version') AS server_version
      `;
    } catch {
      throw new Error("Unable to reach the guarded development database; connection details were suppressed.");
    }
    const identity = rows[0];
    if (!identity
      || identity.database_name !== expectedDatabase
      || identity.schema_name !== "public"
      || identity.role_name !== expectedRole
      || identity.server_port !== expectedPort
      || !/^\d+(?:\.\d+)?/.test(identity.server_version)) {
      throw new Error("Connected development database identity did not match the guarded configuration.");
    }
    console.log("Read-only development database identity verified.");
    console.log(`Configured target: ${configuredIdentity}`);
    console.log(`Connected database: ${identity.database_name}; role: verified; schema: public; port: ${identity.server_port}; PostgreSQL: ${identity.server_version.split(" ")[0]}`);
    console.log("No migration, seed, write, reset, or cleanup was run.");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Development database identity verification failed.";
  console.error(message);
  process.exitCode = 1;
});
