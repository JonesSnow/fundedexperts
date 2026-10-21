import type { ConnectedPostgresIdentity } from "./development-migration-preflight";

export const DEVELOPMENT_CATALOG_FIXTURE = {
  product: {
    code: "DEV-E2E-NONPUBLIC",
    name: "DEVELOPMENT-ONLY E2E FIXTURE",
    description: "Non-public development fixture. Contains no commercial terms.",
    status: "DRAFT",
    isActive: false,
    category: null,
    evaluationStructure: null,
    accountSize: null,
    price: null,
    denominationCurrency: null,
    displayOrder: 999999,
  },
  ruleset: {
    name: "E2E-DEV-UNPUBLISHED",
    description: "Non-public development fixture; never a customer ruleset.",
    isActive: false,
  },
  version: {
    version: "dev-fixture-v1",
    status: "DRAFT",
    isActive: false,
  },
  stage: {
    stageKey: "dev-fixture",
    displayName: "Development-only fixture stage",
    stageOrder: 1,
  },
} as const;

export interface DevelopmentSeedMigration {
  migrationName: string;
  finished: boolean;
  rolledBack: boolean;
}

export interface DevelopmentSeedDatabaseState {
  migrationLedgerExists: boolean;
  migrations: readonly DevelopmentSeedMigration[];
  applicationTableCount: number;
}

export interface ExistingDevelopmentCatalogFixture {
  product: {
    code: string | null;
    status: string;
    isActive: boolean;
    category: string | null;
    evaluationStructure: string | null;
    accountSize: { toString(): string } | null;
    price: { toString(): string } | null;
    denominationCurrency: string | null;
  };
  ruleset: { name: string; isActive: boolean };
  version: { version: string; status: string; isActive: boolean };
  stage: { stageKey: string; displayName: string; stageOrder: number; productId: string; rulesetVersionId: string };
  productId: string;
  rulesetVersionId: string;
}

/** Require the connected database to match the configured target before a seed transaction can start. */
export function assertDevelopmentSeedPreflight(
  developmentDatabaseUrl: string,
  connectedIdentity: ConnectedPostgresIdentity,
  expectedMigrationNames: readonly string[],
  state: DevelopmentSeedDatabaseState,
): void {
  let expectedDatabase: string;
  let expectedPort: number;
  try {
    const parsed = new URL(developmentDatabaseUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error("protocol");
    expectedDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
    expectedPort = Number(parsed.port || "5432");
  } catch {
    throw new Error("Development catalog seed stopped: the configured target identity could not be verified.");
  }

  if (
    connectedIdentity.databaseName !== expectedDatabase
    || connectedIdentity.schemaName !== "public"
    || connectedIdentity.port !== expectedPort
  ) {
    throw new Error("Development catalog seed stopped: the connected database identity does not match the guarded target.");
  }

  if (!Number.isInteger(state.applicationTableCount) || state.applicationTableCount <= 0) {
    throw new Error("Development catalog seed stopped: the expected application schema is not present.");
  }
  if (!state.migrationLedgerExists) {
    throw new Error("Development catalog seed stopped: the Prisma migration ledger is missing.");
  }

  const expected = [...expectedMigrationNames].sort();
  const actualRows = [...state.migrations];
  if (
    expected.length === 0
    || new Set(expected).size !== expected.length
    || actualRows.length !== expected.length
    || actualRows.some((migration) => !migration.finished || migration.rolledBack)
  ) {
    throw new Error("Development catalog seed stopped: migration history is incomplete or differs from the checked-in chain.");
  }

  const actual = actualRows.map((migration) => migration.migrationName).sort();
  if (actual.some((name, index) => name !== expected[index])) {
    throw new Error("Development catalog seed stopped: migration history does not match the checked-in chain.");
  }
}

/** Refuse to adopt a stable fixture identifier if someone made it active or added commercial terms. */
export function assertNonPublicDevelopmentCatalogFixture(
  existing: ExistingDevelopmentCatalogFixture,
): void {
  const { product, ruleset, version, stage } = existing;
  if (
    product.code !== DEVELOPMENT_CATALOG_FIXTURE.product.code
    || product.status !== "DRAFT"
    || product.isActive
    || product.category !== null
    || product.evaluationStructure !== null
    || product.accountSize !== null
    || product.price !== null
    || product.denominationCurrency !== null
    || ruleset.name !== DEVELOPMENT_CATALOG_FIXTURE.ruleset.name
    || ruleset.isActive
    || version.version !== DEVELOPMENT_CATALOG_FIXTURE.version.version
    || version.status !== "DRAFT"
    || version.isActive
    || stage.stageKey !== DEVELOPMENT_CATALOG_FIXTURE.stage.stageKey
    || stage.displayName !== DEVELOPMENT_CATALOG_FIXTURE.stage.displayName
    || stage.stageOrder !== DEVELOPMENT_CATALOG_FIXTURE.stage.stageOrder
    || stage.productId !== existing.productId
    || stage.rulesetVersionId !== existing.rulesetVersionId
  ) {
    throw new Error("Development catalog seed stopped: the existing fixture is not a safe, unpublished development record.");
  }
}
