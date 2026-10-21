import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  createDevelopmentMigrationPlan,
} from "../lib/development-migration-plan";
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

test("the command validates and checks --apply before launching Prisma", () => {
  const source = readFileSync(resolve(__dirname, "..", "scripts", "run-development-migration.ts"), "utf8");
  const planCreation = source.indexOf("createDevelopmentMigrationPlan(");
  const applyGate = source.indexOf("if (!plan.apply)");
  const prismaLaunch = source.indexOf("execFileSync(");

  assert.ok(planCreation >= 0 && planCreation < applyGate);
  assert.ok(applyGate >= 0 && applyGate < prismaLaunch);
  assert.match(source, /DATABASE_URL:\s*plan\.databaseUrl/);
  assert.match(source, /delete migrationEnv\.PRODUCTION_DATABASE_URL/);
  assert.match(source, /delete migrationEnv\.DEVELOPMENT_DATABASE_URL/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*databaseUrl/);
});
