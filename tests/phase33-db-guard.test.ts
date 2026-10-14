import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTestDatabaseUrl,
  assertSafeTestDatabase,
  resolveAndVerifyTestDatabase,
  ProductionDatabaseGuardError,
  withVerifiedTestDatabase,
  mergeTestEnvironmentFileValues,
} from "./support/test-db-guard";

const PRODUCTION_URL = "postgresql://user:pw@ep-prod-xyz-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
const TEST_URL = "postgresql://user:pw@ep-test-abc-pooler.us-east-2.aws.neon.tech/fundedexperts_test?sslmode=require";

describe("Phase 33 database isolation guard", () => {
  describe("URL resolution", () => {
    it("1. Never falls back to DATABASE_URL", () => {
      assert.throws(
        () => resolveTestDatabaseUrl({ DATABASE_URL: PRODUCTION_URL }),
        ProductionDatabaseGuardError
      );
    });

    it("2. Uses TEST_DATABASE_URL when only it is set", () => {
      const resolved = resolveTestDatabaseUrl({ TEST_DATABASE_URL: TEST_URL });
      assert.strictEqual(resolved.url, TEST_URL);
      assert.strictEqual(resolved.source, "TEST_DATABASE_URL");
    });

    it("3. PHASE33_DATABASE_URL overrides TEST_DATABASE_URL", () => {
      const other = "postgresql://user:pw@localhost:5432/other_test";
      const resolved = resolveTestDatabaseUrl({
        PHASE33_DATABASE_URL: other,
        TEST_DATABASE_URL: TEST_URL,
      });
      assert.strictEqual(resolved.url, other);
      assert.strictEqual(resolved.source, "PHASE33_DATABASE_URL");
    });

    it("4. Ignores blank values", () => {
      assert.throws(
        () => resolveTestDatabaseUrl({ TEST_DATABASE_URL: "   ", DATABASE_URL: PRODUCTION_URL }),
        ProductionDatabaseGuardError
      );
    });
  });

  describe("Production safety guard", () => {
    it("5. Rejects a URL identical to DATABASE_URL", () => {
      const resolved = { url: PRODUCTION_URL, source: "TEST_DATABASE_URL" as const };
      assert.throws(
        () => assertSafeTestDatabase(resolved, { DATABASE_URL: PRODUCTION_URL }),
        /same host and database name/
      );
    });

    it("6. Rejects trailing-slash variants of the production URL", () => {
      const resolved = { url: `${PRODUCTION_URL}/`, source: "TEST_DATABASE_URL" as const };
      assert.throws(
        () => assertSafeTestDatabase(resolved, { DATABASE_URL: PRODUCTION_URL }),
        ProductionDatabaseGuardError
      );
    });

    it("7. Rejects an unmarked database by default", () => {
      const unmarked = "postgresql://user:pw@ep-something-pooler.us-east-2.aws.neon.tech/neondb";
      const resolved = { url: unmarked, source: "TEST_DATABASE_URL" as const };
      assert.throws(() => assertSafeTestDatabase(resolved, {}), /no test marker/);
    });

    it("8. Rejects when NODE_ENV is production", () => {
      const resolved = { url: TEST_URL, source: "TEST_DATABASE_URL" as const };
      assert.throws(
        () => assertSafeTestDatabase(resolved, { NODE_ENV: "production" }),
        /NODE_ENV=production/
      );
    });

    it("9. Accepts a marked test database", () => {
      const resolved = { url: TEST_URL, source: "TEST_DATABASE_URL" as const };
      const report = assertSafeTestDatabase(resolved, { DATABASE_URL: PRODUCTION_URL });
      assert.strictEqual(report.databaseName, "fundedexperts_test");
      assert.deepStrictEqual(report.warnings, []);
    });

    it("10. Accepts localhost databases", () => {
      const local = "postgresql://postgres:postgres@localhost:5432/fundedexperts_test";
      const resolved = { url: local, source: "TEST_DATABASE_URL" as const };
      assert.doesNotThrow(() => assertSafeTestDatabase(resolved, {}));
    });

    it("11. Allows the explicit override but emits a warning", () => {
      const unmarked = "postgresql://user:pw@ep-disposable-pooler.aws.neon.tech/neondb";
      const resolved = { url: unmarked, source: "TEST_DATABASE_URL" as const };
      const report = assertSafeTestDatabase(resolved, {}, { allowProductionDb: true });
      assert.strictEqual(report.warnings.length, 1);
      assert.strictEqual(report.trustedVia, "override");
    });

    it("11b. Accepts an operator-allowlisted host without a marker", () => {
      const unmarked = "postgresql://user:pw@ep-damp-smoke-b4gj12v6-pooler.c-6.us-east-2.aws.neon.tech/neondb";
      const resolved = { url: unmarked, source: "TEST_DATABASE_URL" as const };
      const report = assertSafeTestDatabase(resolved, {}, {
        allowedHosts: "ep-damp-smoke-b4gj12v6-pooler.c-6.us-east-2.aws.neon.tech",
      });
      assert.strictEqual(report.trustedVia, "allowlist");
      assert.strictEqual(report.warnings.length, 1);
    });

    it("11c. Rejects suffix allowlist entries even when the target is a subdomain", () => {
      const unmarked = "postgresql://user:pw@ep-damp-smoke-b4gj12v6-pooler.c-6.aws.neon.tech/neondb";
      const resolved = { url: unmarked, source: "TEST_DATABASE_URL" as const };
      assert.throws(
        () => assertSafeTestDatabase(resolved, {}, { allowedHosts: "aws.neon.tech" }),
        ProductionDatabaseGuardError
      );
    });

    it("11d. The allowlist does NOT defeat the DATABASE_URL equality check", () => {
      const resolved = { url: PRODUCTION_URL, source: "TEST_DATABASE_URL" as const };
      assert.throws(
        () =>
          assertSafeTestDatabase(
            resolved,
            { DATABASE_URL: PRODUCTION_URL },
            { allowedHosts: "ep-prod-xyz-pooler.us-east-2.aws.neon.tech" }
          ),
        ProductionDatabaseGuardError
      );
    });

    it("11e. The allowlist does NOT defeat the NODE_ENV=production check", () => {
      const resolved = { url: TEST_URL, source: "TEST_DATABASE_URL" as const };
      assert.throws(
        () => assertSafeTestDatabase(resolved, { NODE_ENV: "production" }, { allowedHosts: "ep-test-abc-pooler.us-east-2.aws.neon.tech" }),
        /NODE_ENV=production/
      );
    });

    it("11f. A database name is not an allowlist hostname", () => {
      const unmarked = "postgresql://user:pw@ep-shared-pooler.us-east-2.aws.neon.tech/neondb";
      const resolved = { url: unmarked, source: "TEST_DATABASE_URL" as const };
      assert.throws(
        () => assertSafeTestDatabase(resolved, {}, { allowedHosts: "neondb" }),
        ProductionDatabaseGuardError
      );
    });

    it("11g. Marker substrings in host and database names are not sufficient", () => {
      const misleading = "postgresql://user:pw@ep-contest-pooler.us-east-2.aws.neon.tech/latest";
      const resolved = { url: misleading, source: "TEST_DATABASE_URL" as const };
      assert.throws(() => assertSafeTestDatabase(resolved, {}), ProductionDatabaseGuardError);
    });

    it("11h. Rejects the same database despite different credentials, query, encoding, and scheme", () => {
      const resolved = {
        url: "postgres://other:other@EP-test-abc-pooler.us-east-2.aws.neon.tech:5432/fundedexperts%5Ftest?sslmode=prefer",
        source: "TEST_DATABASE_URL" as const,
      };
      const production = "postgresql://user:pw@ep-test-abc-pooler.us-east-2.aws.neon.tech/fundedexperts_test?sslmode=require";
      assert.throws(
        () => assertSafeTestDatabase(resolved, { DATABASE_URL: production }),
        /same host and database name/
      );
    });

    it("11i. Rejects a target equal to DIRECT_URL when DATABASE_URL is absent", () => {
      const resolved = { url: TEST_URL, source: "TEST_DATABASE_URL" as const };
      assert.throws(
        () => assertSafeTestDatabase(resolved, { DIRECT_URL: TEST_URL }),
        /same host and database name as DIRECT_URL/
      );
    });

    it("11j. Rejects a target matching a filtered .env.local production reference", () => {
      const resolved = { url: TEST_URL, source: "TEST_DATABASE_URL" as const };
      assert.throws(
        () => assertSafeTestDatabase(resolved, {}, { productionDatabaseUrls: [TEST_URL] }),
        /same host and database name as production configuration reference/
      );
    });

    it("11k. Rejects non-PostgreSQL URLs", () => {
      const resolved = { url: "https://test.example/db", source: "TEST_DATABASE_URL" as const };
      assert.throws(() => assertSafeTestDatabase(resolved, {}), ProductionDatabaseGuardError);
    });

    it("12. The override still cannot defeat the DATABASE_URL equality check", () => {
      const resolved = { url: PRODUCTION_URL, source: "TEST_DATABASE_URL" as const };
      assert.throws(
        () => assertSafeTestDatabase(resolved, { DATABASE_URL: PRODUCTION_URL }, { allowProductionDb: true }),
        ProductionDatabaseGuardError
      );
    });

    it("13. resolveAndVerifyTestDatabase reports the resolved source", () => {
      const { resolved, report } = resolveAndVerifyTestDatabase(
        { TEST_DATABASE_URL: TEST_URL, DATABASE_URL: PRODUCTION_URL },
        {}
      );
      assert.strictEqual(resolved.source, "TEST_DATABASE_URL");
      assert.strictEqual(report.host, "ep-test-abc-pooler.us-east-2.aws.neon.tech");
    });
  });
});

describe("test database gate runs before database work", () => {
  function assertRejectedBeforeDatabaseWork(env: Parameters<typeof withVerifiedTestDatabase>[0]) {
    let databaseOperations = 0;
    assert.throws(
      () => withVerifiedTestDatabase(env, () => {
        databaseOperations += 1;
        return { clientCreated: true };
      }),
      ProductionDatabaseGuardError
    );
    assert.strictEqual(databaseOperations, 0);
  }

  it("rejects missing dedicated test URLs before a mocked client can be created", () => {
    assertRejectedBeforeDatabaseWork({ DATABASE_URL: PRODUCTION_URL });
  });

  it("rejects a production-marked URL even when it differs from DATABASE_URL", () => {
    assertRejectedBeforeDatabaseWork({
      TEST_DATABASE_URL: PRODUCTION_URL,
      DATABASE_URL: "postgresql://user:pw@ep-other-prod-pooler.us-east-2.aws.neon.tech/neondb",
    });
  });

  it("rejects an equal or normalized-equal URL before database work", () => {
    assertRejectedBeforeDatabaseWork({
      TEST_DATABASE_URL: "postgresql://user:pw@ep-test-abc-pooler.us-east-2.aws.neon.tech/fundedexperts_test/",
      DATABASE_URL: "postgresql://user:pw@ep-test-abc-pooler.us-east-2.aws.neon.tech/fundedexperts_test",
    });
  });

  it("rejects an unmarked and non-allowlisted host before database work", () => {
    assertRejectedBeforeDatabaseWork({
      TEST_DATABASE_URL: "postgresql://user:pw@ep-shared-pooler.us-east-2.aws.neon.tech/neondb",
    });
  });

  it("rejects production runtime mode before database work", () => {
    assertRejectedBeforeDatabaseWork({
      TEST_DATABASE_URL: TEST_URL,
      NODE_ENV: "production",
    });
  });

  it("invokes database work only after a dedicated test URL passes", () => {
    let databaseOperations = 0;
    const result = withVerifiedTestDatabase(
      { TEST_DATABASE_URL: TEST_URL, DATABASE_URL: PRODUCTION_URL },
      ({ resolved }) => {
        databaseOperations += 1;
        return { url: resolved.url };
      }
    );
    assert.strictEqual(databaseOperations, 1);
    assert.strictEqual(result.url, TEST_URL);
  });
});



describe("test environment file separation", () => {
  it("uses only .env.test.local for database URLs and allowlists", () => {
    const merged = mergeTestEnvironmentFileValues(
      {
        TEST_DATABASE_URL: TEST_URL,
        DATABASE_URL: "postgresql://user:pw@ep-test-old.neon.tech/fundedexperts_test",
        DIRECT_URL: "postgresql://user:pw@ep-test-old.neon.tech/fundedexperts_test",
      },
      {
        DATABASE_URL: PRODUCTION_URL,
        DIRECT_URL: PRODUCTION_URL,
        TEST_DATABASE_URL: PRODUCTION_URL,
        PHASE33_DATABASE_URL: PRODUCTION_URL,
        PHASE33_TEST_DB_HOST_ALLOWLIST: "prod.example",
        PHASE33_ALLOW_PRODUCTION_DB: "true",
        NODE_ENV: "production",
        JWT_SECRET: "test-only-placeholder",
      }
    );

    assert.deepStrictEqual(merged, {
      TEST_DATABASE_URL: TEST_URL,
      JWT_SECRET: "test-only-placeholder",
    });
  });
});
