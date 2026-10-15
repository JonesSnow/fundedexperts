/**
 * Phase 33 test database isolation guard.
 *
 * The Phase 33 E2E suite performs writes and deletes against a real PostgreSQL
 * database. It must never be able to run against the shared/production Neon
 * branch that the application uses.
 *
 * Resolution order (no fallback to DATABASE_URL):
 *   1. PHASE33_DATABASE_URL  — local override
 *   2. TEST_DATABASE_URL     — canonical CI/test variable
 *
 * This mirrors the project rule in docs/database-reliability-plan.md §4.2:
 * "DATABASE_URL and TEST_DATABASE_URL must never be the same connection string."
 */

export interface DatabaseEnvironment {
  PHASE33_DATABASE_URL?: string | undefined;
  TEST_DATABASE_URL?: string | undefined;
  TEST_DATABASE_DISPOSABLE?: string | undefined;
  TEST_DATABASE_DISPOSABLE_CONFIRMATION?: string | undefined;
  DATABASE_URL?: string | undefined;
  DIRECT_URL?: string | undefined;
  NODE_ENV?: string | undefined;
}

export interface SafetyCheckOptions {
  /** Production URL references are compared for identity but are never selected as test targets. */
  productionDatabaseUrls?: readonly string[] | undefined;
}

export interface ResolvedTestDatabase {
  url: string;
  source: "PHASE33_DATABASE_URL" | "TEST_DATABASE_URL";
}

export class ProductionDatabaseGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionDatabaseGuardError";
  }
}

const DISPOSABLE_CONFIRMATION = "I_HAVE_VERIFIED_THIS_IS_A_DISPOSABLE_TEST_DATABASE";

export function resolveTestDatabaseUrl(env: DatabaseEnvironment): ResolvedTestDatabase {
  const override = env.PHASE33_DATABASE_URL?.trim();
  const canonical = env.TEST_DATABASE_URL?.trim();

  if (override && canonical) {
    const overrideIdentity = databaseIdentity(override);
    const canonicalIdentity = databaseIdentity(canonical);
    if (!overrideIdentity || !canonicalIdentity || overrideIdentity !== canonicalIdentity) {
      throw new ProductionDatabaseGuardError(
        "Conflicting dedicated test database targets are configured. Set PHASE33_DATABASE_URL and " +
          "TEST_DATABASE_URL to the same local database, or remove the legacy override."
      );
    }
  }

  if (override) {
    return { url: override, source: "PHASE33_DATABASE_URL" };
  }

  if (canonical) {
    return { url: canonical, source: "TEST_DATABASE_URL" };
  }

  throw new ProductionDatabaseGuardError(
    "No dedicated test database configured. Set TEST_DATABASE_URL (canonical, used by CI) " +
      "or PHASE33_DATABASE_URL (local override). Database-backed tests never fall back to " +
      "DATABASE_URL or DIRECT_URL."
  );
}

function databaseIdentity(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return undefined;
    const hostname = parsed.hostname.toLowerCase().replace(/-pooler(?=\.)/, "").replace(/\.$/, "");
    const port = parsed.port || "5432";
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "")
      .normalize("NFKC")
      .toLowerCase();
    if (!hostname) return undefined;
    return `${hostname}:${port}/${databaseName}`;
  } catch {
    return undefined;
  }
}

function parseDatabaseName(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, "");
    return decodeURIComponent(path.split("/")[0] ?? "");
  } catch {
    return "";
  }
}

function parseHost(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return "";
    return parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function parseBranchId(url: string): string {
  try {
    return new URL(url).searchParams.get("branch_id") ?? "";
  } catch {
    return "";
  }
}

export interface SafetyReport {
  source: ResolvedTestDatabase["source"];
  host: string;
  databaseName: string;
  branchId: string;
  trustedVia: "operator-confirmation";
  warnings: string[];
}

export function assertSafeTestDatabase(
  resolved: ResolvedTestDatabase,
  env: DatabaseEnvironment,
  options: SafetyCheckOptions = {}
): SafetyReport {
  const url = resolved.url;
  const host = parseHost(url);
  const databaseName = parseDatabaseName(url);

  if (env.NODE_ENV === "production") {
    throw new ProductionDatabaseGuardError(
      "Refusing to run the Phase 33 suite with NODE_ENV=production."
    );
  }
  if (
    env.TEST_DATABASE_DISPOSABLE !== "true" ||
    env.TEST_DATABASE_DISPOSABLE_CONFIRMATION !== DISPOSABLE_CONFIRMATION
  ) {
    throw new ProductionDatabaseGuardError(
      "Refusing database-backed tests: explicitly verify the local test database is isolated and disposable, " +
        "then set TEST_DATABASE_DISPOSABLE=true and its confirmation value."
    );
  }

  const productionTargets: Array<[string, string | undefined]> = [
    ["DATABASE_URL", env.DATABASE_URL],
    ["DIRECT_URL", env.DIRECT_URL],
    ...(options.productionDatabaseUrls ?? []).map(
      (reference, index): [string, string | undefined] => [`production configuration reference ${index + 1}`, reference]
    ),
  ];
  for (const [variableName, configuredUrl] of productionTargets) {
    const productionUrl = configuredUrl?.trim();
    if (!productionUrl) continue;
    const testIdentity = databaseIdentity(url);
    const productionIdentity = databaseIdentity(productionUrl);
    if (!testIdentity || !productionIdentity) {
      throw new ProductionDatabaseGuardError(
        `Refusing to run the Phase 33 suite: database identity could not be compared safely with ${variableName}.`
      );
    }
    if (testIdentity === productionIdentity) {
      throw new ProductionDatabaseGuardError(
        `Refusing to run the Phase 33 suite: the resolved test database has the same host and database name as ${variableName}. ` +
          "Set a dedicated TEST_DATABASE_URL for a separate database."
      );
    }
  }

  if (!host) {
    throw new ProductionDatabaseGuardError(
      "Refusing to run the Phase 33 suite: the resolved database URL could not be parsed."
    );
  }

  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new ProductionDatabaseGuardError(
      "Refusing database-backed tests: only an explicitly verified local PostgreSQL target is permitted."
    );
  }
  if (!databaseName) {
    throw new ProductionDatabaseGuardError(
      "Refusing database-backed tests: the local test database name is missing."
    );
  }

  return {
    source: resolved.source,
    host,
    databaseName,
    branchId: parseBranchId(url),
    trustedVia: "operator-confirmation",
    warnings: [],
  };
}

export function resolveAndVerifyTestDatabase(
  env: DatabaseEnvironment,
  options: SafetyCheckOptions = {}
): { resolved: ResolvedTestDatabase; report: SafetyReport } {
  const resolved = resolveTestDatabaseUrl(env);
  const report = assertSafeTestDatabase(resolved, env, options);
  return { resolved, report };
}
/**
 * Run work that can create a database client only after the test URL has passed
 * the shared safety checks. Rejected configurations never invoke the callback.
 */
export function withVerifiedTestDatabase<T>(
  env: DatabaseEnvironment,
  afterValidation: (verification: ReturnType<typeof resolveAndVerifyTestDatabase>) => T,
  options: SafetyCheckOptions = {}
): T {
  const verification = resolveAndVerifyTestDatabase(env, options);
  return afterValidation(verification);
}

const DATABASE_CONFIGURATION_KEYS = new Set([
  "DATABASE_URL",
  "DIRECT_URL",
  "TEST_DATABASE_URL",
  "PHASE33_DATABASE_URL",
  "TEST_DATABASE_DISPOSABLE",
  "TEST_DATABASE_DISPOSABLE_CONFIRMATION",
  "TEST_DATABASE_CLEANUP_CONFIRMATION",
  "PHASE33_ALLOW_PRODUCTION_DB",
  "PHASE33_TEST_DB_HOST_ALLOWLIST",
  "NODE_ENV",
]);

/**
 * Use test settings only from .env.test.local. .env.local contributes
 * non-database application secrets, never a database target or confirmation.
 */
export function mergeTestEnvironmentFileValues(
  testFileEnv: Record<string, string>,
  localFileEnv: Record<string, string>
): Record<string, string> {
  const merged = Object.fromEntries(
    Object.entries(testFileEnv).filter(([key]) =>
      ![
        "DATABASE_URL",
        "DIRECT_URL",
        "TEST_DATABASE_CLEANUP_CONFIRMATION",
        "PHASE33_ALLOW_PRODUCTION_DB",
        "PHASE33_TEST_DB_HOST_ALLOWLIST",
      ].includes(key)
    )
  );
  for (const [key, value] of Object.entries(localFileEnv)) {
    if (!DATABASE_CONFIGURATION_KEYS.has(key)) merged[key] = value;
  }
  return merged;
}
