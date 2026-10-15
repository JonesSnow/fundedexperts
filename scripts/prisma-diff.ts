import "../tests/support/test-env";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import { join } from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("The verified test database URL was not set by the test environment guard.");
}

const projectRoot = process.cwd();
const require = createRequire(join(projectRoot, "package.json"));
const prismaCli = require.resolve("prisma/build/index.js");

try {
  const result = execFileSync(
    process.execPath,
    [
      prismaCli,
      "migrate",
      "diff",
      "--from-schema-datasource",
      join(projectRoot, "prisma", "schema.prisma"),
      "--to-schema-datamodel",
      join(projectRoot, "prisma", "schema.prisma"),
      "--script",
    ],
    {
      cwd: projectRoot,
      env: process.env,
      encoding: "utf-8",
      stdio: "pipe",
    },
  );
  console.log(result);
} catch {
  console.error("Schema diff failed for the verified test database; details are redacted.");
  process.exitCode = 1;
}
