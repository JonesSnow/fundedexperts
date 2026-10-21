import assert from "node:assert/strict";
import test from "node:test";
import {
  createDatabaseClientAfterValidation,
  DEVELOPMENT_DATABASE_CONFIRMATION_VALUE,
  resolveDevelopmentDatabaseUrl,
} from "../lib/development-database-guard";

const productionUrl = "postgresql://production.example.test/fundedexperts";
const developmentUrl = "postgresql://development.example.test/fundedexperts_dev";

test("local development refuses a missing development URL instead of falling back to DATABASE_URL", () => {
  let clientCreated = false;
  assert.throws(
    () => createDatabaseClientAfterValidation(
      { NODE_ENV: "development", DATABASE_URL: productionUrl },
      () => { clientCreated = true; },
    ),
    /configure a separately verified DEVELOPMENT_DATABASE_URL/,
  );
  assert.equal(clientCreated, false);
});

test("local development rejects a development URL equal to the production URL", () => {
  assert.throws(
    () => resolveDevelopmentDatabaseUrl({
      NODE_ENV: "development",
      DEVELOPMENT_DATABASE_URL: productionUrl,
      DEVELOPMENT_DATABASE_CONFIRMATION: DEVELOPMENT_DATABASE_CONFIRMATION_VALUE,
      DATABASE_URL: productionUrl,
    }),
    /matches a configured production database identity/,
  );
});

test("local development detects canonical equality across a Neon pooler hostname", () => {
  assert.throws(
    () => resolveDevelopmentDatabaseUrl({
      NODE_ENV: "development",
      DEVELOPMENT_DATABASE_URL: "postgresql://ep-main.us-east-1.neon.tech/neondb",
      DEVELOPMENT_DATABASE_CONFIRMATION: DEVELOPMENT_DATABASE_CONFIRMATION_VALUE,
      DATABASE_URL: "postgresql://ep-main-pooler.us-east-1.neon.tech/neondb?sslmode=require",
    }),
    /matches a configured production database identity/,
  );
});

test("local development rejects malformed production references before client creation", () => {
  let clientCreated = false;
  assert.throws(
    () => createDatabaseClientAfterValidation(
      {
        NODE_ENV: "development",
        DEVELOPMENT_DATABASE_URL: developmentUrl,
        DEVELOPMENT_DATABASE_CONFIRMATION: DEVELOPMENT_DATABASE_CONFIRMATION_VALUE,
        DATABASE_URL: "not-a-postgres-url",
      },
      () => { clientCreated = true; },
    ),
    /could not be compared safely/,
  );
  assert.equal(clientCreated, false);
});

test("local development rejects unsupported database URL schemes", () => {
  assert.throws(
    () => resolveDevelopmentDatabaseUrl({
      NODE_ENV: "development",
      DEVELOPMENT_DATABASE_URL: "mysql://development.example.test/fundedexperts_dev",
      DEVELOPMENT_DATABASE_CONFIRMATION: DEVELOPMENT_DATABASE_CONFIRMATION_VALUE,
      DATABASE_URL: productionUrl,
    }),
    /not a valid PostgreSQL URL/,
  );
});

test("local development requires a production comparison reference", () => {
  assert.throws(
    () => resolveDevelopmentDatabaseUrl({
      NODE_ENV: "development",
      DEVELOPMENT_DATABASE_URL: developmentUrl,
      DEVELOPMENT_DATABASE_CONFIRMATION: DEVELOPMENT_DATABASE_CONFIRMATION_VALUE,
    }),
    /production database reference is required/,
  );
});

test("local development requires an explicit isolation confirmation before client creation", () => {
  let clientCreated = false;
  assert.throws(
    () => createDatabaseClientAfterValidation(
      {
        NODE_ENV: "development",
        DEVELOPMENT_DATABASE_URL: developmentUrl,
        DATABASE_URL: productionUrl,
      },
      () => { clientCreated = true; },
    ),
    /explicitly confirm that the development branch is isolated/,
  );
  assert.equal(clientCreated, false);
});

test("a distinct canonical target is accepted only after explicit isolation confirmation", () => {
  assert.equal(resolveDevelopmentDatabaseUrl({
    NODE_ENV: "development",
    DEVELOPMENT_DATABASE_URL: developmentUrl,
    DEVELOPMENT_DATABASE_CONFIRMATION: DEVELOPMENT_DATABASE_CONFIRMATION_VALUE,
    DATABASE_URL: productionUrl,
  }), developmentUrl);
});

test("production and test environments retain their existing Prisma configuration", () => {
  const calls: Array<string | undefined> = [];
  const client = createDatabaseClientAfterValidation(
    { NODE_ENV: "production", DATABASE_URL: productionUrl },
    (url) => { calls.push(url); return { initialized: true }; },
  );
  assert.deepEqual(calls, [undefined]);
  assert.deepEqual(client, { initialized: true });
});
