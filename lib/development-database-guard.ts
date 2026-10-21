export interface DevelopmentDatabaseEnvironment {
  NODE_ENV?: string | undefined;
  DEVELOPMENT_DATABASE_URL?: string | undefined;
  DEVELOPMENT_DATABASE_CONFIRMATION?: string | undefined;
  PRODUCTION_DATABASE_URL?: string | undefined;
  DATABASE_URL?: string | undefined;
  DIRECT_URL?: string | undefined;
}

interface DatabaseIdentity {
  host: string;
  port: string;
  database: string;
}

export const DEVELOPMENT_DATABASE_CONFIRMATION_VALUE =
  "I_HAVE_VERIFIED_THIS_IS_AN_ISOLATED_DEVELOPMENT_BRANCH";

function parseDatabaseIdentity(value: string): DatabaseIdentity | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;

    let host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    host = host.replace(/-pooler(?=\.)/, "");
    if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) host = "loopback";

    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "")
      .normalize("NFKC")
      .toLowerCase();
    if (!host || !database) return null;

    return { host, port: parsed.port || "5432", database };
  } catch {
    return null;
  }
}

function sameDatabase(left: DatabaseIdentity, right: DatabaseIdentity): boolean {
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

/** A non-secret canonical identity suitable for comparing cached clients. */
export function canonicalDatabaseIdentity(value: string): string | null {
  const identity = parseDatabaseIdentity(value);
  return identity ? `${identity.host}:${identity.port}/${identity.database}` : null;
}

/**
 * Local development must use an explicitly supplied database URL that is
 * distinct from every configured production reference. No DATABASE_URL
 * fallback is allowed. The returned URL is passed directly to Prisma without
 * mutating process.env.
 */
export function resolveDevelopmentDatabaseUrl(
  env: DevelopmentDatabaseEnvironment,
): string | undefined {
  if (env.NODE_ENV !== "development") return undefined;

  const developmentUrl = env.DEVELOPMENT_DATABASE_URL?.trim();
  if (!developmentUrl) {
    throw new Error(
      "Local database access is blocked: configure a separately verified DEVELOPMENT_DATABASE_URL.",
    );
  }

  if (env.DEVELOPMENT_DATABASE_CONFIRMATION !== DEVELOPMENT_DATABASE_CONFIRMATION_VALUE) {
    throw new Error(
      "Local database access is blocked: explicitly confirm that the development branch is isolated from production.",
    );
  }

  const developmentIdentity = parseDatabaseIdentity(developmentUrl);
  if (!developmentIdentity) {
    throw new Error("Local database access is blocked: DEVELOPMENT_DATABASE_URL is not a valid PostgreSQL URL.");
  }

  const productionReferences = [
    env.PRODUCTION_DATABASE_URL,
    env.DATABASE_URL,
    env.DIRECT_URL,
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));

  if (productionReferences.length === 0) {
    throw new Error(
      "Local database access is blocked: a production database reference is required to verify separation.",
    );
  }

  for (const reference of productionReferences) {
    const productionIdentity = parseDatabaseIdentity(reference);
    if (!productionIdentity) {
      throw new Error(
        "Local database access is blocked: a configured database reference could not be compared safely.",
      );
    }
    if (sameDatabase(developmentIdentity, productionIdentity)) {
      throw new Error(
        "Local database access is blocked: DEVELOPMENT_DATABASE_URL matches a configured production database identity.",
      );
    }
  }

  return developmentUrl;
}

/** Testable boundary proving validation completes before a client factory runs. */
export function createDatabaseClientAfterValidation<T>(
  env: DevelopmentDatabaseEnvironment,
  createClient: (developmentUrl: string | undefined) => T,
): T {
  const developmentUrl = resolveDevelopmentDatabaseUrl(env);
  return createClient(developmentUrl);
}
