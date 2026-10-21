import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
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

function main(): void {
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
    console.log(`Development target validated: ${plan.databaseIdentity}`);
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

  console.log(`Applying checked-in migrations to: ${plan.databaseIdentity}`);
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: projectRoot,
    env: migrationEnv,
    stdio: "inherit",
  });
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Development migration preflight failed.";
  console.error(message);
  process.exitCode = 1;
}
