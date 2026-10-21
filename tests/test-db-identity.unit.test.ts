import test from "node:test";
import assert from "node:assert/strict";
import { assertTestDatabaseIdentity, configuredDatabasePort } from "./support/test-db-identity";

const localIdentity = {
  databaseName: "fundedexperts_test",
  userName: "fundedexperts_test_user",
  serverAddress: "127.0.0.1",
  serverPort: 5432,
  serverVersion: "16.4",
};

test("accepts the expected local disposable database identity", () => {
  assert.doesNotThrow(() => assertTestDatabaseIdentity(localIdentity, {
    configuredPort: 5432,
    githubActions: false,
  }));
});

test("accepts a private PostgreSQL service address only in GitHub Actions", () => {
  assert.doesNotThrow(() => assertTestDatabaseIdentity({
    ...localIdentity,
    serverAddress: "172.19.0.3",
  }, { configuredPort: 5432, githubActions: true }));
  assert.throws(() => assertTestDatabaseIdentity({
    ...localIdentity,
    serverAddress: "172.19.0.3",
  }, { configuredPort: 5432, githubActions: false }), /not a local test server/);
});

test("rejects mismatched database names, roles, ports, server addresses, and public hosts", () => {
  assert.throws(() => assertTestDatabaseIdentity({ ...localIdentity, databaseName: "fundedexperts" }, {
    configuredPort: 5432, githubActions: false,
  }), /database name/);
  assert.throws(() => assertTestDatabaseIdentity({ ...localIdentity, userName: "postgres" }, {
    configuredPort: 5432, githubActions: false,
  }), /database role/);
  assert.throws(() => assertTestDatabaseIdentity({ ...localIdentity, serverPort: 5433 }, {
    configuredPort: 5432, githubActions: false,
  }), /server port/);
  assert.throws(() => assertTestDatabaseIdentity({ ...localIdentity, serverAddress: "203.0.113.20" }, {
    configuredPort: 5432, githubActions: false,
  }), /not a local test server/);
  assert.throws(() => assertTestDatabaseIdentity({ ...localIdentity, serverAddress: null }, {
    configuredPort: 5432, githubActions: false,
  }), /server address/);
});

test("parses the configured port without exposing the database URL", () => {
  assert.equal(configuredDatabasePort("postgresql://user:secret@localhost:5544/fundedexperts_test"), 5544);
  assert.equal(configuredDatabasePort("postgresql://localhost/fundedexperts_test"), 5432);
  assert.throws(() => configuredDatabasePort("postgresql://localhost:bad/fundedexperts_test"), /URL is invalid/);
});
