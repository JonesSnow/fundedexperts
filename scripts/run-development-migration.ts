import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { assertDevelopmentMigrationPreflight } from "../lib/development-migration-preflight";
import { runAfterVerifiedDevelopmentTarget } from "../lib/development-migration-execution";
import { createDevelopmentMigrationPlan } from "../lib/development-migration-plan";

const DATABASE_ENVIRONMENT_KEYS = new Set([
  "DATABASE_URL",
  "DIRECT_URL",
  "PRODUCTION_DATABASE_URL",
  "DEVELOPMENT_DATABASE_URL",
  "DEVELOPMENT_DATABASE_CONFIRMATION",
]);

function readLocalDatabaseEnvironment(): Record<string, string> {
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
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!DATABASE_ENVIRONMENT_KEYS.has(key)) continue;

    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function configuredValue(
  key: keyof NodeJS.ProcessEnv,
  fileValues: Record<string, string>,
): string | undefined {
  return process.env[key] ?? fileValues[key];
}

async function verifyDevelopmentDatabaseBeforeMigration(databaseUrl: string): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    let identityRows: Array<{ database_name: string; schema_name: string; port: number | null }>;
    let tableRows: Array<{ count: number }>;
    let migrationLedgerRows: Array<{ ledger_exists: boolean }>;
    let migrationStateRows: Array<{ applied: number; incomplete: number }> = [{ applied: 0, incomplete: 0 }];

    try {
      identityRows = await prisma.$queryRaw<Array<{ database_name: string; schema_name: string; port: number | null }>>`
        SELECT current_database() AS database_name,
               current_schema() AS schema_name,
               inet_server_port() AS port
      `;
      tableRows = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name <> '_prisma_migrations'
      `;
      migrationLedgerRows = await prisma.$queryRaw<Array<{ ledger_exists: boolean }>>`
        SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS ledger_exists
      `;

      if (migrationLedgerRows[0]?.ledger_exists) {
        migrationStateRows = await prisma.$queryRaw<Array<{ applied: number; incomplete: number }>>`
          SELECT
            COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied,
            COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS incomplete
          FROM public."_prisma_migrations"
        `;
      }
    } catch {
      throw new Error("Development migration stopped: the connected database could not be safely inspected.");
    }

    if (!identityRows[0] || !tableRows[0] || !migrationLedgerRows[0] || !migrationStateRows[0]) {
      throw new Error("Development migration stopped: the connected database returned incomplete identity information.");
    }

    assertDevelopmentMigrationPreflight(
      databaseUrl,
      identityRows[0],
      {
        migrationLedgerExists: migrationLedgerRows[0].ledger_exists,
        appliedMigrationCount: migrationStateRows[0].applied,
        incompleteMigrationCount: migrationStateRows[0].incomplete,
        applicationTableCount: tableRows[0].count,
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") {
    throw new Error("Development migrations are disabled outside the development environment.");
  }

  const fileValues = readLocalDatabaseEnvironment();
  const plan = createDevelopmentMigrationPlan(
    {
      NODE_ENV: "development",
      DEVELOPMENT_DATABASE_URL: configuredValue("DEVELOPMENT_DATABASE_URL", fileValues),
      DEVELOPMENT_DATABASE_CONFIRMATION: configuredValue("DEVELOPMENT_DATABASE_CONFIRMATION", fileValues),
      PRODUCTION_DATABASE_URL: configuredValue("PRODUCTION_DATABASE_URL", fileValues),
      DATABASE_URL: configuredValue("DATABASE_URL", fileValues),
      DIRECT_URL: configuredValue("DIRECT_URL", fileValues),
    },
    process.argv.slice(2),
  );

  if (!plan.apply) {
    console.log("Development target configuration validated.");
    console.log("No database connection or migration was made. Pass --apply only after verifying the isolated target and intended schema changes.");
    return;
  }

  const projectRoot = resolve(__dirname, "..");
  const projectRequire = createRequire(join(projectRoot, "package.json"));
  const prismaCli = projectRequire.resolve("prisma/build/index.js");
  const migrationEnv = {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: plan.databaseUrl,
    DIRECT_URL: plan.databaseUrl,
  };
  delete migrationEnv.PRODUCTION_DATABASE_URL;
  delete migrationEnv.DEVELOPMENT_DATABASE_URL;
  delete migrationEnv.DEVELOPMENT_DATABASE_CONFIRMATION;
  delete migrationEnv.TEST_DATABASE_URL;
  delete migrationEnv.PHASE33_DATABASE_URL;
  delete migrationEnv.TEST_DATABASE_DISPOSABLE;
  delete migrationEnv.TEST_DATABASE_DISPOSABLE_CONFIRMATION;
  delete migrationEnv.TEST_DATABASE_CLEANUP_CONFIRMATION;
  delete migrationEnv.PHASE33_ALLOW_PRODUCTION_DB;

  await runAfterVerifiedDevelopmentTarget(
    () => verifyDevelopmentDatabaseBeforeMigration(plan.databaseUrl),
    () => {
      console.log("Connected development target identity verified.");
      console.log("Applying checked-in migrations.");
      execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
        cwd: projectRoot,
        env: migrationEnv,
        stdio: "inherit",
      });
    },
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Development migration preflight failed.";
  console.error(message);
  process.exitCode = 1;
});
