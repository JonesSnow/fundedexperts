import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const projectRoot = resolve(__dirname, "..");
const projectRequire = createRequire(join(projectRoot, "package.json"));
const tsxCli = projectRequire.resolve("tsx/cli");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|cjs)$/.test(entry.name) ? [path] : [];
  });
}

describe("legacy database reset entry points", () => {
  for (const script of ["test-reset.cjs", "scripts/clean-db.js"]) {
    it(`${script} exits before any database access`, () => {
      const result = spawnSync(process.execPath, [resolve(projectRoot, script)], {
        cwd: projectRoot,
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
        encoding: "utf8",
      });

      assert.equal(result.status, 1);
      assert.match(result.stderr, /Database (reset|cleanup) is disabled/);
      assert.doesNotMatch(result.stderr, /TRUNCATE|DATABASE_URL|postgres/i);
      assert.equal(result.stdout, "");
    });
  }
});

describe("guarded cleanup entry point", () => {
  it("refuses cleanup before loading the test environment or Prisma without a cleanup-only confirmation", () => {
    const result = spawnSync(
      process.execPath,
      [tsxCli, resolve(projectRoot, "scripts/cleanup-db.ts")],
      {
        cwd: projectRoot,
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Database cleanup is disabled/);
    assert.doesNotMatch(result.stderr, /PrismaClient|Connected|deleteMany|TRUNCATE|DATABASE_URL/i);
    assert.equal(result.stdout, "");
  });
});

describe("test database identity preflight entry point", () => {
  it("refuses direct invocation without a dedicated target before constructing Prisma", () => {
    const result = spawnSync(
      process.execPath,
      [tsxCli, resolve(projectRoot, "scripts/verify-test-database-identity.ts")],
      {
        cwd: projectRoot,
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Test database identity verification failed/);
    assert.doesNotMatch(result.stderr, /PrismaClient|Connected|DATABASE_URL|postgres/i);
    assert.equal(result.stdout, "");
  });
});

describe("Prisma test entry-point coverage", () => {
  it("guards every test/script Prisma client before construction", () => {
    const candidates = [
      ...sourceFiles(join(projectRoot, "tests")),
      ...sourceFiles(join(projectRoot, "scripts")),
    ];
    const developmentMigrationPath = resolve(projectRoot, "scripts/run-development-migration.ts");
    const developmentSeedPath = resolve(projectRoot, "scripts/seed-development-catalog.ts");
    const developmentVerifyPath = resolve(projectRoot, "scripts/verify-development-database.ts");
      const testEnvironmentPath = resolve(projectRoot, "tests/support/test-env.ts");
      const testIdentityScriptPath = resolve(projectRoot, "scripts/verify-test-database-identity.ts");
    const unguarded = candidates.filter((path) => {
      if (path === __filename) return false;
      const source = readFileSync(path, "utf8");
      if (!source.includes("new PrismaClient")) return false;

      if (path === developmentMigrationPath) {
        const mainStart = source.indexOf("async function main");
        const mainSource = mainStart >= 0 ? source.slice(mainStart) : "";
        const mainSteps = [
          mainSource.indexOf("createDevelopmentMigrationPlan("),
          mainSource.indexOf("if (!plan.apply)"),
          mainSource.indexOf("await runAfterVerifiedDevelopmentTarget("),
          mainSource.indexOf("() => verifyDevelopmentDatabaseBeforeMigration(plan.databaseUrl)"),
          mainSource.indexOf('prismaCli, "migrate", "deploy"'),
        ];
        const verifyStart = source.indexOf("async function verifyDevelopmentDatabaseBeforeMigration");
        const verifyEnd = source.indexOf("async function main", verifyStart);
        const verificationSource = verifyStart >= 0 && verifyEnd > verifyStart
          ? source.slice(verifyStart, verifyEnd)
          : "";
        const verificationSteps = [
          verificationSource.indexOf("new PrismaClient"),
          verificationSource.indexOf("current_database()"),
          verificationSource.indexOf("assertDevelopmentMigrationPreflight("),
        ];

        return !(
          source.includes("../lib/development-migration-preflight")
          && mainSteps.every((step, index) => step >= 0 && (index === 0 || mainSteps[index - 1] < step))
          && verificationSteps.every((step, index) => step >= 0 && (index === 0 || verificationSteps[index - 1] < step))
        );
      }

      if (path === developmentSeedPath) {
        const mainStart = source.indexOf("async function main");
        const mainSource = mainStart >= 0 ? source.slice(mainStart) : "";
        const mainSteps = [
          mainSource.indexOf("createDevelopmentMigrationPlan("),
          mainSource.indexOf("if (!plan.apply)"),
          mainSource.indexOf("new PrismaClient"),
          mainSource.indexOf("await prisma.$connect()"),
          mainSource.indexOf("await runAfterVerifiedDevelopmentTarget("),
          mainSource.indexOf("() => verifySeedTarget(prisma, plan.databaseUrl, expectedMigrationNames)"),
          mainSource.indexOf("() => seedFixture(prisma)"),
        ];
        const verifyStart = source.indexOf("async function verifySeedTarget");
        const verifyEnd = source.indexOf("async function seedFixture", verifyStart);
        const verificationSource = verifyStart >= 0 && verifyEnd > verifyStart
          ? source.slice(verifyStart, verifyEnd)
          : "";
        const verificationSteps = [
          verificationSource.indexOf("current_database()"),
          verificationSource.indexOf("assertDevelopmentSeedPreflight("),
        ];
        const seedStart = source.indexOf("async function seedFixture");
        const seedSource = seedStart >= 0 ? source.slice(seedStart) : "";

        return !(
          source.includes("../lib/development-migration-plan")
          && source.includes("../lib/development-migration-execution")
          && mainSteps.every((step, index) => step >= 0 && (index === 0 || mainSteps[index - 1] < step))
          && verificationSteps.every((step, index) => step >= 0 && (index === 0 || verificationSteps[index - 1] < step))
          && seedSource.indexOf("await prisma.$transaction(") < seedSource.indexOf("assertNonPublicDevelopmentCatalogFixture(")
          && seedSource.indexOf("assertNonPublicDevelopmentCatalogFixture(") < seedSource.indexOf("catch (error)")
          && !/console\.(?:log|error)\([^\n]*databaseUrl/.test(source)
        );
      }

      if (path === developmentVerifyPath) {
        const guard = source.indexOf("resolveDevelopmentDatabaseUrl(env)");
        const prismaImport = source.indexOf('await import("@prisma/client")');
        const client = source.indexOf("new PrismaClient");
        const query = source.indexOf("prisma.$queryRaw");
        const sanitizedConnectionFailure = source.indexOf("Unable to reach the guarded development database; connection details were suppressed.");
        return !(guard >= 0 && guard < prismaImport && prismaImport < client && client < query && sanitizedConnectionFailure > query);
      }

      if (path === testEnvironmentPath) {
        const guard = source.indexOf("withVerifiedTestDatabase(");
        const identityLaunch = source.indexOf("verify-test-database-identity.ts");
        return !(
          guard >= 0
          && identityLaunch > guard
        );
      }

      if (path === testIdentityScriptPath) {
        const guard = source.indexOf("resolveAndVerifyTestDatabase(");
        const client = source.indexOf("new PrismaClient");
        const identityQuery = source.indexOf("$queryRaw");
        const identityAssertion = source.indexOf("assertTestDatabaseIdentity(");
        return !(guard >= 0 && guard < client && client < identityQuery && identityQuery < identityAssertion);
      }

      const testBootstrap = source.indexOf("support/test-env");
      const clientConstruction = source.indexOf("new PrismaClient");
      return testBootstrap < 0 || testBootstrap > clientConstruction;
    });

    assert.deepEqual(unguarded, []);
  });

  it("validates the dedicated test target before launching Prisma CLI operations", () => {
    const scripts = [
      "scripts/prisma-status.ts",
      "scripts/prisma-diff.ts",
      "scripts/run-migration.js",
      "scripts/run-tests.js",
      "scripts/run-all-tests.js",
    ];
    const unguarded = scripts.filter((script) => {
      const source = readFileSync(resolve(projectRoot, script), "utf8");
      const testBootstrap = source.indexOf("test-env");
      const prismaOperation = Math.min(
        ...["execSync", "execFileSync", "execFile("]
          .map((operation) => source.indexOf(operation))
          .filter((index) => index >= 0),
      );
      return testBootstrap < 0 || prismaOperation < 0 || testBootstrap > prismaOperation;
    });

    assert.deepEqual(unguarded, []);
  });

  it("requires explicit cleanup authorization for every database suite with global cleanup", () => {
    const candidates = [
      ...sourceFiles(join(projectRoot, "tests")),
      ...sourceFiles(join(projectRoot, "scripts")),
    ].filter((path) => path !== __filename);
    const unguarded = candidates.filter((path) => {
      const source = readFileSync(path, "utf8");
      const segments = path.split(/[\\/]/);
      const databaseTest = segments.includes("tests") && source.includes("support/test-env");
      const cleanupUtility = segments.includes("scripts") && /cleanup-db\.(?:ts|js)$/.test(path);
      if (!databaseTest && !cleanupUtility) return false;
      const hasGlobalCleanup = /\.deleteMany\s*\(\s*\{\s*\}\s*\)/.test(source)
        || /\bTRUNCATE\b[\s\S]{0,160}\bCASCADE\b/i.test(source);
      if (!hasGlobalCleanup) return false;
      if (path.endsWith("scripts\\cleanup-db.ts")) {
        return !(
          source.indexOf("process.env.TEST_DATABASE_CLEANUP_CONFIRMATION") >= 0
          && source.indexOf("process.env.TEST_DATABASE_CLEANUP_CONFIRMATION") < source.indexOf("new PrismaClient")
        );
      }
      return !source.includes("support/test-cleanup-guard");
    });

    assert.deepEqual(unguarded, []);
  });

  it("uses run-scoped identities for standalone utilities that clean up test fixtures", () => {
    const scripts = ["scripts/inspect-db.ts", "scripts/verify-monitoring-job-index.ts"];
    const unsafe = scripts.filter((script) => {
      const source = readFileSync(resolve(projectRoot, script), "utf8");
      return source.includes(".deleteMany") && (
        !source.includes("randomUUID")
        || /test-acc-001|test-acc-002|persistent-acc-verify|persistent-index-verify/.test(source)
      );
    });

    assert.deepEqual(unsafe, []);
  });

  it("preflights global cleanup before launching database suites and preserves process confirmation", () => {
    const runner = readFileSync(resolve(projectRoot, "scripts/run-all-tests.js"), "utf8");
    const cleanupPreflight = runner.indexOf("const hasGlobalCleanup =");
    const firstChildLaunch = runner.indexOf("for (const testFile of testFiles)");

    assert.ok(cleanupPreflight >= 0 && cleanupPreflight < firstChildLaunch);
    assert.match(runner, /process\.env\.TEST_DATABASE_CLEANUP_CONFIRMATION/);
    assert.doesNotMatch(runner, /delete childEnv\.TEST_DATABASE_CLEANUP_CONFIRMATION/);
  });
});
