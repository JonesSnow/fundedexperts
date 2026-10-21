import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { runCleanupSteps } from "../lib/cleanup-helper";
import {
  assertSafeTestDatabase,
  assertTestDatabaseCleanupAuthorized,
  mergeTestEnvironmentFileValues,
  ProductionDatabaseGuardError,
  resolveTestDatabaseUrl,
  withVerifiedTestDatabase,
} from "./support/test-db-guard";

const APP_DATABASE_URL = "postgresql://localhost:5432/fundedexperts_dev";
const TEST_DATABASE_URL = "postgresql://localhost:5432/fundedexperts_test";
const CONFIRMED_TEST_ENV = {
  TEST_DATABASE_DISPOSABLE: "true",
  TEST_DATABASE_DISPOSABLE_CONFIRMATION: "I_HAVE_VERIFIED_THIS_IS_A_DISPOSABLE_TEST_DATABASE",
};

describe("database test safety guard", () => {
  it("never falls back to DATABASE_URL when the dedicated target is missing", () => {
    assert.throws(
      () => resolveTestDatabaseUrl({ DATABASE_URL: APP_DATABASE_URL }),
      ProductionDatabaseGuardError,
    );
  });

  it("rejects conflicting legacy and canonical test targets", () => {
    assert.throws(
      () => resolveTestDatabaseUrl({
        PHASE33_DATABASE_URL: TEST_DATABASE_URL,
        TEST_DATABASE_URL: APP_DATABASE_URL,
      }),
      /Conflicting dedicated test database targets/,
    );
  });

  it("requires explicit operator confirmation before database work", () => {
    let databaseClientCreated = false;
    assert.throws(
      () => withVerifiedTestDatabase(
        { TEST_DATABASE_URL, DATABASE_URL: APP_DATABASE_URL },
        () => {
          databaseClientCreated = true;
        },
      ),
      /explicitly verify/,
    );
    assert.equal(databaseClientCreated, false);
  });

  it("rejects remote targets regardless of a test-looking database name", () => {
    assert.throws(
      () => assertSafeTestDatabase(
        { url: "postgresql://test.example.invalid:5432/fundedexperts_test", source: "TEST_DATABASE_URL" },
        CONFIRMED_TEST_ENV,
      ),
      /only an explicitly verified local/,
    );
  });

  it("rejects a target identical to the configured application database", () => {
    assert.throws(
      () => assertSafeTestDatabase(
        { url: APP_DATABASE_URL, source: "TEST_DATABASE_URL" },
        { ...CONFIRMED_TEST_ENV, DATABASE_URL: APP_DATABASE_URL },
      ),
      /same host and database name/,
    );
  });

  it("accepts a local target only after explicit confirmation", () => {
    const checked = withVerifiedTestDatabase(
      { ...CONFIRMED_TEST_ENV, TEST_DATABASE_URL, DATABASE_URL: APP_DATABASE_URL },
      ({ resolved, report }) => ({ resolved, report }),
    );
    assert.equal(checked.resolved.url, TEST_DATABASE_URL);
    assert.equal(checked.report.trustedVia, "operator-confirmation");
  });

  it("does not inherit a database target or confirmation from .env.local", () => {
    const merged = mergeTestEnvironmentFileValues(
      {
        TEST_DATABASE_URL,
        TEST_DATABASE_DISPOSABLE: "true",
        TEST_DATABASE_CLEANUP_CONFIRMATION: "I_UNDERSTAND_THIS_DELETES_ALL_DATA_IN_THE_TEST_DATABASE",
      },
      {
        DATABASE_URL: APP_DATABASE_URL,
        DIRECT_URL: APP_DATABASE_URL,
        TEST_DATABASE_URL: APP_DATABASE_URL,
        TEST_DATABASE_DISPOSABLE: "true",
        TEST_DATABASE_DISPOSABLE_CONFIRMATION: "I_HAVE_VERIFIED_THIS_IS_A_DISPOSABLE_TEST_DATABASE",
        TEST_DATABASE_CLEANUP_CONFIRMATION: "I_UNDERSTAND_THIS_DELETES_ALL_DATA_IN_THE_TEST_DATABASE",
        JWT_SECRET: "test-only-placeholder",
      },
    );
    assert.deepEqual(merged, {
      TEST_DATABASE_URL,
      TEST_DATABASE_DISPOSABLE: "true",
      JWT_SECRET: "test-only-placeholder",
    });
  });

  it("requires a separate process-level confirmation before global cleanup", () => {
    assert.throws(
      () => assertTestDatabaseCleanupAuthorized({}),
      /Refusing destructive test cleanup/,
    );
    assert.throws(
      () => assertTestDatabaseCleanupAuthorized({
        TEST_DATABASE_CLEANUP_CONFIRMATION: "incorrect",
      }),
      /Refusing destructive test cleanup/,
    );
    assert.doesNotThrow(() => assertTestDatabaseCleanupAuthorized({
      TEST_DATABASE_CLEANUP_CONFIRMATION: "I_UNDERSTAND_THIS_DELETES_ALL_DATA_IN_THE_TEST_DATABASE",
    }));
  });

  it("does not invoke cleanup callbacks without the cleanup confirmation", async () => {
    const previous = process.env.TEST_DATABASE_CLEANUP_CONFIRMATION;
    delete process.env.TEST_DATABASE_CLEANUP_CONFIRMATION;
    let cleanupInvoked = false;
    try {
      await assert.rejects(
        runCleanupSteps({} as unknown as PrismaClient, [
          { label: "test.deleteMany", fn: async () => { cleanupInvoked = true; } },
        ]),
        /Refusing destructive test cleanup/,
      );
      assert.equal(cleanupInvoked, false);
    } finally {
      if (previous === undefined) delete process.env.TEST_DATABASE_CLEANUP_CONFIRMATION;
      else process.env.TEST_DATABASE_CLEANUP_CONFIRMATION = previous;
    }
  });
});
