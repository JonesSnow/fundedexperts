import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareMt5Credentials } from "../lib/mt5-credential-storage";

let encryptCalls = 0;
const encryptForTest = (plaintext: string) => {
  encryptCalls += 1;
  return `sealed:${plaintext}`;
};

assert.deepEqual(prepareMt5Credentials(undefined, encryptForTest), { ok: true, value: undefined });
assert.deepEqual(prepareMt5Credentials(null, encryptForTest), { ok: true, value: null });
assert.deepEqual(prepareMt5Credentials("", encryptForTest), { ok: true, value: null });
assert.equal(encryptCalls, 0);
assert.deepEqual(prepareMt5Credentials({ password: "dummy" }, encryptForTest), { ok: false, reason: "invalid" });
assert.equal(encryptCalls, 0);

const prepared = prepareMt5Credentials("test-only-dummy-credential", encryptForTest);
assert.deepEqual(prepared, { ok: true, value: "sealed:test-only-dummy-credential" });
assert.equal(encryptCalls, 1);
if (prepared.ok) assert.notEqual(prepared.value, "test-only-dummy-credential");

assert.deepEqual(
  prepareMt5Credentials("test-only-dummy-credential", () => { throw new Error("key unavailable"); }),
  { ok: false, reason: "unavailable" },
);

const routeSources = [
  readFileSync("app/api/admin/mt5-accounts/route.ts", "utf8"),
  readFileSync("app/api/admin/mt5-accounts/[id]/route.ts", "utf8"),
];
for (const source of routeSources) {
  assert.match(source, /prepareMt5Credentials\(credentials\)/);
  assert.doesNotMatch(source, /credentials:\s*credentials\s*(?:\?\?\s*null)?[,;]/);
  assert.doesNotMatch(source, /updateData\.credentials\s*=\s*credentials\s*;/);
}
assert.match(routeSources[0], /credentials:\s*preparedCredentials\.value\s*\?\?\s*null/);
assert.match(routeSources[1], /updateData\.credentials\s*=\s*preparedCredentials\.value\s*\?\?\s*null/);

console.log("Admin MT5 credential safety tests passed.");