import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTestDatabaseUrl,
  assertSafeTestDatabase,
  resolveAndVerifyTestDatabase,
  ProductionDatabaseGuardError,
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
        /identical to DATABASE_URL/
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

    it("11c. Allowlist supports suffix entries and whitespace", () => {
      const unmarked = "postgresql://user:pw@ep-damp-smoke-b4gj12v6-pooler.c-6.aws.neon.tech/neondb";
      const resolved = { url: unmarked, source: "TEST_DATABASE_URL" as const };
      const report = assertSafeTestDatabase(resolved, {}, {
        allowedHosts: " other.host , aws.neon.tech ",
      });
      assert.strictEqual(report.trustedVia, "allowlist");
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