import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { isActiveAdministrator } from "../lib/auth/admin-policy";

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

test("administrator access requires both the ADMIN role and ACTIVE status", () => {
  assert.equal(isActiveAdministrator({ role: "ADMIN", status: "ACTIVE" }), true);
  assert.equal(isActiveAdministrator({ role: "ADMIN", status: "PENDING" }), false);
  assert.equal(isActiveAdministrator({ role: "ADMIN", status: "SUSPENDED" }), false);
  assert.equal(isActiveAdministrator({ role: "ADMIN", status: "INACTIVE" }), false);
  assert.equal(isActiveAdministrator({ role: "TRADER", status: "ACTIVE" }), false);
  assert.equal(isActiveAdministrator(null), false);
  assert.equal(isActiveAdministrator(undefined), false);
});

test("API and middleware authorization do not trust a raw ADMIN role claim", () => {
  const projectRoot = process.cwd();
  const files = [
    ...collectTypeScriptFiles(path.join(projectRoot, "app", "api")),
    path.join(projectRoot, "middleware.ts"),
  ];
  const rawAdminRoleCheck = /\b[A-Za-z_$][\w$]*\??\.role\s*(?:===|!==|==|!=)\s*["']ADMIN["']/;

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, rawAdminRoleCheck, path.relative(projectRoot, file));
  }
});
