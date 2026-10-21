import {
  canonicalDatabaseIdentity,
  resolveDevelopmentDatabaseUrl,
  type DevelopmentDatabaseEnvironment,
} from "./development-database-guard";

export interface DevelopmentMigrationPlan {
  databaseUrl: string;
  databaseIdentity: string;
  apply: boolean;
}

/** Validate a development target and require an explicit flag before a migration can run. */
export function createDevelopmentMigrationPlan(
  env: DevelopmentDatabaseEnvironment,
  args: readonly string[],
): DevelopmentMigrationPlan {
  if (args.some((arg) => arg !== "--apply")) {
    throw new Error("Unsupported development migration option. Use --apply only to run checked-in migrations.");
  }

  const databaseUrl = resolveDevelopmentDatabaseUrl(env);
  if (!databaseUrl) {
    throw new Error("Development migrations require NODE_ENV=development.");
  }

  const databaseIdentity = canonicalDatabaseIdentity(databaseUrl);
  if (!databaseIdentity) {
    throw new Error("Development migrations require a valid PostgreSQL database identity.");
  }

  return {
    databaseUrl,
    databaseIdentity,
    apply: args.includes("--apply"),
  };
}
