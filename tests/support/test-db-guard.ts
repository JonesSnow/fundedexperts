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
  NODE_ENV?: string | undefined;
}

export interface SafetyCheckOptions {
  /** Explicit escape hatch. Intentionally awkward to set. */
  allowProductionDb?: boolean | undefined;
  /**
   * Comma-separated list of hostnames (or host suffixes) that the operator has
   * explicitly declared safe for test runs. Used when a dedicated test branch
   * does not carry a name marker (for example a Neon branch called
   * "damp-smoke"). This NEVER overrides the DATABASE_URL equality check or the
   * NODE_ENV=production check.
   */
  allowedHosts?: string | undefined;
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

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
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
    return new URL(url).host.toLowerCase();
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
  trustedVia: "marker" | "allowlist" | "override";
  warnings: string[];
}

function matchesAllowlist(host: string, allowedHosts: string | undefined): boolean {
  if (!allowedHosts) return false;
  const entries = allowedHosts
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return entries.some((entry) => host === entry || host.endsWith(`.${entry}`));
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

  const productionUrl = env.DATABASE_URL?.trim();
  if (productionUrl && normalize(url) === normalize(productionUrl)) {
    throw new ProductionDatabaseGuardError(
      "Refusing to run the Phase 33 suite: the resolved test database URL is identical to " +
        "DATABASE_URL. Set a dedicated TEST_DATABASE_URL for a separate Neon branch."
    );
  }

  if (!host) {
    throw new ProductionDatabaseGuardError(
      "Refusing to run the Phase 33 suite: the resolved database URL could not be parsed."
    );
  }

  const fingerprint = `${host}${databaseName}${branchId}`;
  const hasTestMarker = TEST_HOST_MARKERS.some((marker) => fingerprint.includes(marker));
  const isAllowlisted = matchesAllowlist(host, options.allowedHosts);

  if (!hasTestMarker && !isAllowlisted && !options.allowProductionDb) {
    throw new ProductionDatabaseGuardError(
      `Refusing to run the Phase 33 suite: the resolved database "${databaseName || "(default)"}" ` +
        `on host "${host}" carries no test marker (expected one of: ${TEST_HOST_MARKERS.join(", ")}) ` +
        `and is not in the operator allowlist. Point TEST_DATABASE_URL at a dedicated test/dev branch ` +
        `named with one of those markers, or list this host in PHASE33_TEST_DB_HOST_ALLOWLIST. ` +
        "If you are certain this is a disposable database, set PHASE33_ALLOW_PRODUCTION_DB=true to override."
    );
  }

  const trustedVia: SafetyReport["trustedVia"] = hasTestMarker
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