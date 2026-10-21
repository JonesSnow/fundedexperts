import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  createDevelopmentMigrationPlan,
} from "../lib/development-migration-plan";
import { assertDevelopmentMigrationPreflight } from "../lib/development-migration-preflight";
import { runAfterVerifiedDevelopmentTarget } from "../lib/development-migration-execution";
import { DEVELOPMENT_DATABASE_CONFIRMATION_VALUE } from "../lib/development-database-guard";

const developmentUrl = "postgresql://example:unused@dev.example.test:5432/fundedexperts_dev";
const productionUrl = "postgresql://example:unused@prod.example.test:5432/fundedexperts";
const validEnvironment = {
  NODE_ENV: "development",
  DEVELOPMENT_DATABASE_URL: developmentUrl,
  DEVELOPMENT_DATABASE_CONFIRMATION: DEVELOPMENT_DATABASE_CONFIRMATION_VALUE,
  DATABASE_URL: productionUrl,
};

test("preflight validates a distinct development target but does not authorize migration", () => {
  const plan = createDevelopmentMigrationPlan(validEnvironment, []);

  assert.equal(plan.databaseIdentity, "dev.example.test:5432/fundedexperts_dev");
  assert.equal(plan.apply, false);
});

test("only the explicit --apply option authorizes the migration execution path", () => {
  const plan = createDevelopmentMigrationPlan(validEnvironment, ["--apply"]);

  assert.equal(plan.apply, true);
});

test("a production-equivalent target is rejected before an execution plan is returned", () => {
  assert.throws(
    () => createDevelopmentMigrationPlan(
      { ...validEnvironment, DEVELOPMENT_DATABASE_URL: productionUrl },
      ["--apply"],
    ),
    /matches a configured production database identity/,
  );
});

test("unsupported migration options fail closed", () => {
  assert.throws(
    () => createDevelopmentMigrationPlan(validEnvironment, ["--force"]),
    /Unsupported development migration option/,
  );
});

test("a connected database must match the guarded name, port, and public schema", () => {
  const connectedIdentity = { databaseName: "fundedexperts_dev", schemaName: "public", port: 5432 };
  const emptyDatabase = {
    migrationLedgerExists: false,
    appliedMigrationCount: 0,
    incompleteMigrationCount: 0,
    applicationTableCount: 0,
  };

  assert.doesNotThrow(() => assertDevelopmentMigrationPreflight(developmentUrl, connectedIdentity, emptyDatabase));
  assert.throws(
    () => assertDevelopmentMigrationPreflight(developmentUrl, { ...connectedIdentity, databaseName: "production" }, emptyDatabase),
    /connected database identity does not match/,
  );
  assert.throws(
    () => assertDevelopmentMigrationPreflight(developmentUrl, { ...connectedIdentity, port: 6432 }, emptyDatabase),
    /connected database identity does not match/,
  );
  assert.throws(
    () => assertDevelopmentMigrationPreflight(developmentUrl, { ...connectedIdentity, schemaName: "other" }, emptyDatabase),
    /connected database identity does not match/,
  );
});

test("existing application tables with no successful migration history require a reviewed baseline", () => {
  assert.throws(
    () => assertDevelopmentMigrationPreflight(
      developmentUrl,
      { databaseName: "fundedexperts_dev", schemaName: "public", port: 5432 },
      {
        migrationLedgerExists: true,
        appliedMigrationCount: 0,
        incompleteMigrationCount: 0,
        applicationTableCount: 28,
      },
    ),
    /A reviewed baseline is required/,
  );
});

test("incomplete migration records stop before migration execution", () => {
  assert.throws(
    () => assertDevelopmentMigrationPreflight(
      developmentUrl,
      { databaseName: "fundedexperts_dev", schemaName: "public", port: 5432 },
      {
        migrationLedgerExists: true,
        appliedMigrationCount: 13,
        incompleteMigrationCount: 1,
        applicationTableCount: 28,
      },
    ),
    /incomplete Prisma migration requires manual review/,
  );
});

test("a connection or identity-check failure prevents Prisma migration execution", async () => {
  let migrationStarted = false;

  await assert.rejects(
    runAfterVerifiedDevelopmentTarget(
      async () => {
        throw new Error("Development migration stopped: the connected database could not be safely inspected.");
      },
      () => {
        migrationStarted = true;
      },
    ),
    /could not be safely inspected/,
  );

  assert.equal(migrationStarted, false);
});

test("Prisma migration starts only after connected-target verification completes", async () => {
  const sequence: string[] = [];

  await runAfterVerifiedDevelopmentTarget(
    async () => {
      sequence.push("verified");
    },
    () => {
      sequence.push("migrate");
    },
  );

  assert.deepEqual(sequence, ["verified", "migrate"]);
});

test("the command validates and checks --apply before launching Prisma", () => {
  const source = readFileSync(resolve(__dirname, "..", "scripts", "run-development-migration.ts"), "utf8");
  const planCreation = source.indexOf("createDevelopmentMigrationPlan(");
  const applyGate = source.indexOf("if (!plan.apply)");
  const guardedApply = source.indexOf("await runAfterVerifiedDevelopmentTarget(");
  const identityPreflight = source.indexOf("() => verifyDevelopmentDatabaseBeforeMigration(plan.databaseUrl)");
  const prismaLaunch = source.indexOf("execFileSync(");

  assert.ok(planCreation >= 0 && planCreation < applyGate);
  assert.ok(applyGate >= 0 && applyGate < guardedApply);
  assert.ok(guardedApply >= 0 && guardedApply < identityPreflight);
  assert.ok(identityPreflight >= 0 && identityPreflight < prismaLaunch);
  assert.match(source, /DATABASE_URL:\s*plan\.databaseUrl/);
  assert.match(source, /delete migrationEnv\.PRODUCTION_DATABASE_URL/);
  assert.match(source, /delete migrationEnv\.DEVELOPMENT_DATABASE_URL/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*databaseUrl/);
});
