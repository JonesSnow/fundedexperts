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

describe("Prisma test entry-point coverage", () => {
  it("imports the guarded environment before each test or script constructs Prisma", () => {
    const candidates = [
      ...sourceFiles(join(projectRoot, "tests")),
      ...sourceFiles(join(projectRoot, "scripts")),
    ];
    const unguarded = candidates.filter((path) => {
      if (path === __filename) return false;
      const source = readFileSync(path, "utf8");
      if (!source.includes("new PrismaClient")) return false;
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
});
