export interface ConnectedPostgresIdentity {
  databaseName: string;
  schemaName: string;
  port: number | null;
}

export interface DevelopmentMigrationDatabaseState {
  migrationLedgerExists: boolean;
  appliedMigrationCount: number;
  incompleteMigrationCount: number;
  applicationTableCount: number;
}

/** Reject a connection or schema-history state that cannot safely accept migrate deploy. */
export function assertDevelopmentMigrationPreflight(
  developmentDatabaseUrl: string,
  connectedIdentity: ConnectedPostgresIdentity,
  state: DevelopmentMigrationDatabaseState,
): void {
  let expectedDatabase: string;
  let expectedPort: number;
  try {
    const parsed = new URL(developmentDatabaseUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
    expectedDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
    expectedPort = Number(parsed.port || "5432");
  } catch {
    throw new Error("Development migration stopped: the configured database identity could not be verified.");
  }

  if (
    connectedIdentity.databaseName !== expectedDatabase
    || connectedIdentity.schemaName !== "public"
    || connectedIdentity.port !== expectedPort
  ) {
    throw new Error("Development migration stopped: the connected database identity does not match the guarded target.");
  }

  if (
    !Number.isInteger(state.applicationTableCount)
    || state.applicationTableCount < 0
    || !Number.isInteger(state.appliedMigrationCount)
    || state.appliedMigrationCount < 0
    || !Number.isInteger(state.incompleteMigrationCount)
    || state.incompleteMigrationCount < 0
  ) {
    throw new Error("Development migration stopped: the database migration state could not be verified.");
  }

  if (!state.migrationLedgerExists && (state.appliedMigrationCount > 0 || state.incompleteMigrationCount > 0)) {
    throw new Error("Development migration stopped: the migration ledger state is inconsistent.");
  }

  if (state.incompleteMigrationCount > 0) {
    throw new Error("Development migration stopped: an incomplete Prisma migration requires manual review.");
  }

  if (
    state.applicationTableCount > 0
    && (!state.migrationLedgerExists || state.appliedMigrationCount === 0)
  ) {
    throw new Error(
      "Development migration stopped: application tables exist without successful Prisma migration history. A reviewed baseline is required.",
    );
  }
}
