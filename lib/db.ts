import { PrismaClient } from "@prisma/client";
import {
  canonicalDatabaseIdentity,
  createDatabaseClientAfterValidation,
} from "./development-database-guard";

/**
 * Shared Prisma client for the whole application.
 *
 * Before this module every API route, the middleware and the email service each
 * constructed their own `new PrismaClient()` at module scope. That produced one
 * connection pool per module (44 call sites in app code alone), so a single
 * request that touched several bundles could open several pools to the database.
 *
 * The real client is created lazily on first property access rather than at
 * module evaluation time. That matters for correctness, not just tidiness:
 * Prisma resolves `env("DATABASE_URL")` when a client is constructed, so
 * constructing during module import would capture the environment before a test
 * harness had a chance to repoint it at a dedicated test database. Deferring
 * construction to the first actual query guarantees the URL in effect at query
 * time is the one used.
 *
 * The instance is cached on globalThis so development hot reloads and repeated
 * module evaluations reuse one client instead of leaking a new pool each time.
 */

const globalForPrisma = globalThis as unknown as {
  __fundedExpertsPrisma?: PrismaClient;
  __fundedExpertsPrismaDevelopmentIdentity?: string;
};

function resolveClient(): PrismaClient {
  return createDatabaseClientAfterValidation(process.env, (developmentUrl) => {
    const developmentIdentity = developmentUrl
      ? canonicalDatabaseIdentity(developmentUrl) ?? undefined
      : undefined;
    const existing = globalForPrisma.__fundedExpertsPrisma;
    if (existing) {
      if (
        process.env.NODE_ENV === "development" &&
        globalForPrisma.__fundedExpertsPrismaDevelopmentIdentity !== developmentIdentity
      ) {
        throw new Error(
          "Local database access is blocked: the cached Prisma client was not created for the verified development database.",
        );
      }
      return existing;
    }

    const created = developmentUrl
      ? new PrismaClient({ datasources: { db: { url: developmentUrl } } })
      : new PrismaClient();
    globalForPrisma.__fundedExpertsPrisma = created;
    globalForPrisma.__fundedExpertsPrismaDevelopmentIdentity = developmentIdentity;
    return created;
  });
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = resolveClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return Reflect.has(resolveClient(), property);
  },
});

export default prisma;
