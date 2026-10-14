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
  DATABASE_URL?: string | undefined;
  DIRECT_URL?: string | undefined;
  NODE_ENV?: string | undefined;
}

export interface SafetyCheckOptions {
  /** Explicit escape hatch. Intentionally awkward to set. */
  allowProductionDb?: boolean | undefined;
  /**
   * Comma-separated list of exact hostnames that the operator has explicitly
   * declared safe for test runs. Suffix and wildcard entries are not accepted.
   * This NEVER overrides the DATABASE_URL/DIRECT_URL identity checks or NODE_ENV=production.
   */
  allowedHosts?: string | undefined;
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

const TEST_HOST_MARKERS = [
  "test",
  "ci",
  "dev",
  "staging",
  "sandbox",
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
];

export function resolveTestDatabaseUrl(env: DatabaseEnvironment): ResolvedTestDatabase {
  const override = env.PHASE33_DATABASE_URL?.trim();
  if (override) {
    return { url: override, source: "PHASE33_DATABASE_URL" };
  }

  const canonical = env.TEST_DATABASE_URL?.trim();
  if (canonical) {
    return { url: canonical, source: "TEST_DATABASE_URL" };
  }

  throw new ProductionDatabaseGuardError(
    "No dedicated test database configured. Set TEST_DATABASE_URL (canonical, used by CI) " +
      "or PHASE33_DATABASE_URL (local override). The Phase 33 suite deliberately does NOT " +
      "fall back to DATABASE_URL, because that points at the shared/production Neon branch."
  );
}

function databaseIdentity(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return undefined;
    const hostname = parsed.hostname.toLowerCase().replace(/-pooler(?=\.)/, "").replace(/\.$/, "");
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "")
      .normalize("NFKC")
      .toLowerCase();
    if (!hostname) return undefined;
    return `${hostname}/${databaseName}`;
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

function hasTestMarker(host: string, databaseName: string, branchId: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return true;
  }
  const tokens = [host, databaseName, branchId]
    .flatMap((part) => part.toLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length > 0);
  return TEST_HOST_MARKERS.filter((marker) => !["localhost", "127.0.0.1", "[::1]", "::1"].includes(marker))
    .some((marker) => tokens.includes(marker));
}

export interface SafetyReport {
  source: ResolvedTestDatabase["source"];
  host: string;
  databaseName: string;
  branchId: string;
  trustedVia: "marker" | "allowlist" | "override";
  warnings: string[];
}

function matchesAllowlist(host: string, allowedHosts: string | undefined): boolean {
  if (!allowedHosts) return false;
  const entries = allowedHosts
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return entries.some((entry) => host === entry);
}

export function assertSafeTestDatabase(
  resolved: ResolvedTestDatabase,
  env: DatabaseEnvironment,
  options: SafetyCheckOptions = {}
): SafetyReport {
  const url = resolved.url;
  const host = parseHost(url);
  const databaseName = parseDatabaseName(url);
  const branchId = parseBranchId(url);

  if (env.NODE_ENV === "production") {
    throw new ProductionDatabaseGuardError(
      "Refusing to run the Phase 33 suite with NODE_ENV=production."
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

  const hasTestMarkerValue = hasTestMarker(host, databaseName, branchId);
  const isAllowlisted = matchesAllowlist(host, options.allowedHosts);

  if (!hasTestMarkerValue && !isAllowlisted && !options.allowProductionDb) {
    throw new ProductionDatabaseGuardError(
      `Refusing to run the Phase 33 suite: the resolved database "${databaseName || "(default)"}" ` +
        `on host "${host}" carries no test marker (expected one of: ${TEST_HOST_MARKERS.join(", ")}) ` +
        `and is not in the exact-host operator allowlist. Point TEST_DATABASE_URL at a dedicated test/dev branch ` +
        `named with one of those markers, or list this host in PHASE33_TEST_DB_HOST_ALLOWLIST. ` +
        "If you are certain this is a disposable database, set PHASE33_ALLOW_PRODUCTION_DB=true to override."
    );
  }

  const trustedVia: SafetyReport["trustedVia"] = hasTestMarkerValue
    ? "marker"
    : isAllowlisted
      ? "allowlist"
      : "override";

  const warnings: string[] = [];
  if (trustedVia === "allowlist") {
    warnings.push(
      `Database "${databaseName || "(default)"}" on host "${host}" was trusted via ` +
        "PHASE33_TEST_DB_HOST_ALLOWLIST rather than a name marker."
    );
  }
  if (trustedVia === "override") {
    warnings.push(
      "PHASE33_ALLOW_PRODUCTION_DB=true was used to bypass the database safety guard. " +
        "Only do this against a disposable database."
    );
  }

  return { source: resolved.source, host, databaseName, branchId, trustedVia, warnings };
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

const TEST_FILE_ONLY_DATABASE_KEYS = new Set(["DATABASE_URL", "DIRECT_URL", "PHASE33_ALLOW_PRODUCTION_DB"]);
const LOCAL_FILE_DATABASE_KEYS = new Set([
  ...TEST_FILE_ONLY_DATABASE_KEYS,
  "TEST_DATABASE_URL",
  "PHASE33_DATABASE_URL",
  "PHASE33_TEST_DB_HOST_ALLOWLIST",
  "NODE_ENV",
]);

/**
 * Merge test configuration with non-database local secrets. Test URLs may come
 * from .env.test.local; shared application URLs and database overrides in
 * .env.local are never eligible to configure a test run.
 */
export function mergeTestEnvironmentFileValues(
  testFileEnv: Record<string, string>,
  localFileEnv: Record<string, string>
): Record<string, string> {
  const merged = { ...testFileEnv };
  for (const key of TEST_FILE_ONLY_DATABASE_KEYS) delete merged[key];
  for (const [key, value] of Object.entries(localFileEnv)) {
    if (!LOCAL_FILE_DATABASE_KEYS.has(key)) merged[key] = value;
  }
  return merged;
}
