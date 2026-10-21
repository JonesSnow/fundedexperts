import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  assertDevelopmentSeedPreflight,
  assertNonPublicDevelopmentCatalogFixture,
  DEVELOPMENT_CATALOG_FIXTURE,
  type ExistingDevelopmentCatalogFixture,
} from "../lib/development-catalog-seed";

const databaseUrl = "postgresql://unused:unused@dev.example.test:5432/fundedexperts_dev";
const identity = { databaseName: "fundedexperts_dev", schemaName: "public", port: 5432 };
const expectedMigrations = ["20260101000000_init", "20260102000000_catalog"];
const completeState = {
  migrationLedgerExists: true,
  migrations: expectedMigrations.map((migrationName) => ({ migrationName, finished: true, rolledBack: false })),
  applicationTableCount: 28,
};

function existingFixture(): ExistingDevelopmentCatalogFixture {
  return {
    productId: "product-dev-fixture",
    rulesetVersionId: "version-dev-fixture",
    product: {
      code: DEVELOPMENT_CATALOG_FIXTURE.product.code,
      status: "DRAFT",
      isActive: false,
      category: null,
      evaluationStructure: null,
      accountSize: null,
      price: null,
      denominationCurrency: null,
    },
    ruleset: { name: DEVELOPMENT_CATALOG_FIXTURE.ruleset.name, isActive: false },
    version: {
      version: DEVELOPMENT_CATALOG_FIXTURE.version.version,
      status: "DRAFT",
      isActive: false,
    },
    stage: {
      ...DEVELOPMENT_CATALOG_FIXTURE.stage,
      productId: "product-dev-fixture",
      rulesetVersionId: "version-dev-fixture",
    },
  };
}

test("development catalog seed requires the exact database identity and public schema", () => {
  assert.doesNotThrow(() => assertDevelopmentSeedPreflight(databaseUrl, identity, expectedMigrations, completeState));
  assert.throws(
    () => assertDevelopmentSeedPreflight(databaseUrl, { ...identity, databaseName: "other" }, expectedMigrations, completeState),
    /identity does not match/,
  );
  assert.throws(
    () => assertDevelopmentSeedPreflight(databaseUrl, { ...identity, port: 6432 }, expectedMigrations, completeState),
    /identity does not match/,
  );
  assert.throws(
    () => assertDevelopmentSeedPreflight(databaseUrl, { ...identity, schemaName: "private" }, expectedMigrations, completeState),
    /identity does not match/,
  );
});

test("development catalog seed requires the complete, successful checked-in migration chain", () => {
  assert.throws(
    () => assertDevelopmentSeedPreflight(databaseUrl, identity, expectedMigrations, { ...completeState, migrationLedgerExists: false }),
    /migration ledger is missing/,
  );
  assert.throws(
    () => assertDevelopmentSeedPreflight(databaseUrl, identity, expectedMigrations, { ...completeState, migrations: completeState.migrations.slice(0, 1) }),
    /incomplete or differs/,
  );
  assert.throws(
    () => assertDevelopmentSeedPreflight(databaseUrl, identity, expectedMigrations, {
      ...completeState,
      migrations: completeState.migrations.map((migration, index) => index === 0 ? { ...migration, finished: false } : migration),
    }),
    /incomplete or differs/,
  );
  assert.throws(
    () => assertDevelopmentSeedPreflight(databaseUrl, identity, expectedMigrations, {
      ...completeState,
      migrations: completeState.migrations.map((migration, index) => index === 0 ? { ...migration, migrationName: "unexpected_migration" } : migration),
    }),
    /does not match the checked-in chain/,
  );
  assert.throws(
    () => assertDevelopmentSeedPreflight(databaseUrl, identity, expectedMigrations, {
      ...completeState,
      migrations: completeState.migrations.map((migration, index) => index === 0 ? { ...migration, rolledBack: true } : migration),
    }),
    /incomplete or differs/,
  );
  assert.throws(
    () => assertDevelopmentSeedPreflight(databaseUrl, identity, expectedMigrations, { ...completeState, applicationTableCount: 0 }),
    /application schema is not present/,
  );
});

test("seed writes are retry-safe upserts inside the verified transaction boundary", () => {
  const source = readFileSync(resolve(__dirname, "..", "scripts", "seed-development-catalog.ts"), "utf8");
  const upserts = source.match(/\.upsert\(/g) ?? [];
  const emptyUpdates = source.match(/update:\s*\{\s*\}/g) ?? [];

  assert.equal(upserts.length, 4);
  assert.equal(emptyUpdates.length, 4);
  assert.match(source, /await prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(source, /await runAfterVerifiedDevelopmentTarget\([\s\S]*?verifySeedTarget[\s\S]*?seedFixture\(prisma\)/);
});

test("fixture has no public offer terms and cannot be silently adopted if activated", () => {
  assert.equal(DEVELOPMENT_CATALOG_FIXTURE.product.status, "DRAFT");
  assert.equal(DEVELOPMENT_CATALOG_FIXTURE.product.isActive, false);
  assert.equal(DEVELOPMENT_CATALOG_FIXTURE.product.price, null);
  assert.equal(DEVELOPMENT_CATALOG_FIXTURE.product.accountSize, null);
  assert.equal(DEVELOPMENT_CATALOG_FIXTURE.version.status, "DRAFT");
  assert.equal(DEVELOPMENT_CATALOG_FIXTURE.version.isActive, false);
  assert.match(DEVELOPMENT_CATALOG_FIXTURE.ruleset.name, /E2E/i);
  assert.doesNotThrow(() => assertNonPublicDevelopmentCatalogFixture(existingFixture()));
  assert.throws(
    () => assertNonPublicDevelopmentCatalogFixture({
      ...existingFixture(),
      product: { ...existingFixture().product, isActive: true },
    }),
    /not a safe, unpublished development record/,
  );
  assert.throws(
    () => assertNonPublicDevelopmentCatalogFixture({
      ...existingFixture(),
      product: { ...existingFixture().product, price: { toString: () => "1.00" } },
    }),
    /not a safe, unpublished development record/,
  );
});
