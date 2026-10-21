import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createDevelopmentMigrationPlan } from "../lib/development-migration-plan";
import { runAfterVerifiedDevelopmentTarget } from "../lib/development-migration-execution";
import {
  assertDevelopmentSeedPreflight,
  assertNonPublicDevelopmentCatalogFixture,
  DEVELOPMENT_CATALOG_FIXTURE,
  type DevelopmentSeedMigration,
} from "../lib/development-catalog-seed";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function configuredValue(key: keyof NodeJS.ProcessEnv, fileValues: Record<string, string>): string | undefined {
  return process.env[key] ?? fileValues[key];
}

function readExpectedMigrationNames(projectRoot: string): string[] {
  const root = join(projectRoot, "prisma", "migrations");
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (
    names.length === 0
    || names.some((name) => !/^\d{14}_[a-z0-9_]+$/.test(name) || !existsSync(join(root, name, "migration.sql")))
  ) {
    throw new Error("Development catalog seed stopped: the checked-in migration chain is incomplete.");
  }
  for (const name of names) readFileSync(join(root, name, "migration.sql"), "utf8");
  return names;
}

async function verifySeedTarget(prisma: import("@prisma/client").PrismaClient, databaseUrl: string, expectedMigrationNames: string[]): Promise<void> {
  try {
    const identityRows = await prisma.$queryRaw<Array<{ database_name: string; schema_name: string; port: number | null }>>`
      SELECT current_database() AS database_name,
             current_schema() AS schema_name,
             inet_server_port() AS port
    `;
    const tableRows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
    `;
    const ledgerRows = await prisma.$queryRaw<Array<{ ledger_exists: boolean }>>`
      SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS ledger_exists
    `;
    let migrationRows: DevelopmentSeedMigration[] = [];
    if (ledgerRows[0]?.ledger_exists) {
      migrationRows = await prisma.$queryRaw<DevelopmentSeedMigration[]>`
        SELECT migration_name AS "migrationName",
               finished_at IS NOT NULL AS finished,
               rolled_back_at IS NOT NULL AS "rolledBack"
        FROM public."_prisma_migrations"
        ORDER BY migration_name
      `;
    }

    if (!identityRows[0] || !tableRows[0] || !ledgerRows[0]) {
      throw new Error("incomplete preflight result");
    }
    assertDevelopmentSeedPreflight(
      databaseUrl,
      identityRows[0],
      expectedMigrationNames,
      {
        migrationLedgerExists: ledgerRows[0].ledger_exists,
        migrations: migrationRows,
        applicationTableCount: tableRows[0].count,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Development catalog seed stopped:")) throw error;
    throw new Error("Development catalog seed stopped: the connected target could not be safely inspected.");
  }
}

async function seedFixture(prisma: import("@prisma/client").PrismaClient): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.upsert({
        where: { code: DEVELOPMENT_CATALOG_FIXTURE.product.code },
        create: DEVELOPMENT_CATALOG_FIXTURE.product,
        update: {},
        select: {
          id: true,
          code: true,
          status: true,
          isActive: true,
          category: true,
          evaluationStructure: true,
          accountSize: true,
          price: true,
          denominationCurrency: true,
        },
      });
      const ruleset = await tx.ruleset.upsert({
        where: { name: DEVELOPMENT_CATALOG_FIXTURE.ruleset.name },
        create: DEVELOPMENT_CATALOG_FIXTURE.ruleset,
        update: {},
        select: { id: true, name: true, isActive: true },
      });
      const version = await tx.rulesetVersion.upsert({
        where: {
          rulesetId_version: {
            rulesetId: ruleset.id,
            version: DEVELOPMENT_CATALOG_FIXTURE.version.version,
          },
        },
        create: { ...DEVELOPMENT_CATALOG_FIXTURE.version, rulesetId: ruleset.id },
        update: {},
        select: { id: true, version: true, status: true, isActive: true },
      });
      const stage = await tx.productStage.upsert({
        where: {
          productId_stageKey: {
            productId: product.id,
            stageKey: DEVELOPMENT_CATALOG_FIXTURE.stage.stageKey,
          },
        },
        create: {
          ...DEVELOPMENT_CATALOG_FIXTURE.stage,
          productId: product.id,
          rulesetVersionId: version.id,
        },
        update: {},
        select: {
          stageKey: true,
          displayName: true,
          stageOrder: true,
          productId: true,
          rulesetVersionId: true,
        },
      });

      assertNonPublicDevelopmentCatalogFixture({
        product,
        ruleset,
        version,
        stage,
        productId: product.id,
        rulesetVersionId: version.id,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Development catalog seed stopped:")) throw error;
    throw new Error("Development catalog seed stopped: the fixture transaction failed; details are redacted.");
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") {
    throw new Error("Development catalog seeding is disabled outside the development environment.");
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
    console.log("Development seed configuration validated.");
    console.log("No database connection or seed was made. Pass --apply only after the guarded migration chain is complete.");
    return;
  }

  const projectRoot = resolve(__dirname, "..");
  const expectedMigrationNames = readExpectedMigrationNames(projectRoot);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: plan.databaseUrl } } });
  try {
    await prisma.$connect();
    await runAfterVerifiedDevelopmentTarget(
      () => verifySeedTarget(prisma, plan.databaseUrl, expectedMigrationNames),
      () => seedFixture(prisma),
    );
    console.log("The non-public development catalog fixture was created or verified.");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Development catalog seed stopped.";
  const knownSafeMessage = /^(?:Development migrations are disabled|Development catalog seeding is disabled|Development target|Local database access is blocked|Unsupported development migration option|Development catalog seed stopped:)/.test(message);
  console.error(knownSafeMessage ? message : "Development catalog seed stopped; connection and database details are redacted.");
  process.exitCode = 1;
});
