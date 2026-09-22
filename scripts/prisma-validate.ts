import { execSync } from "child_process";
const result = execSync("npx prisma validate", {
  env: { ...process.env, DATABASE_URL: "postgresql://x@y/z?sslmode=require" },
  encoding: "utf-8",
});
console.log(result);
