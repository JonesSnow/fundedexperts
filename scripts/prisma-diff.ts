import { execSync } from "child_process";

const result = execSync("npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma", {
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "" },
  encoding: "utf-8",
  stdio: "pipe",
});
console.log(result);
