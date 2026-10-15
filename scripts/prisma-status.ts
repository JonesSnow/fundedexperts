import "../tests/support/test-env";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import { join } from "path";

const projectRoot = process.cwd();
const require = createRequire(join(projectRoot, "package.json"));
const prismaCli = require.resolve("prisma/build/index.js");

try {
  const result = execFileSync(
    process.execPath,
    [prismaCli, "migrate", "status"],
    {
      cwd: projectRoot,
      env: process.env,
      encoding: "utf-8",
      stdio: "pipe",
    },
  );
  console.log(result);
} catch {
  console.error("Migration status check failed for the verified test database; details are redacted.");
  process.exitCode = 1;
}
