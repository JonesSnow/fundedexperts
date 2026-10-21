import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMt5CredentialUpdateData,
  prepareMt5Credentials,
} from "../lib/mt5-credential-storage";

let encryptCalls = 0;
const encryptForTest = (plaintext: string) => {
  encryptCalls += 1;
  return `sealed:${plaintext}`;
};
const credentialPayload = JSON.stringify({
  login: "12345678",
  password: "test-only-dummy-credential",
  server: "Demo-Server",
});

assert.deepEqual(prepareMt5Credentials(undefined, encryptForTest), { ok: true, value: undefined });
assert.deepEqual(prepareMt5Credentials(null, encryptForTest), { ok: true, value: null });
assert.deepEqual(prepareMt5Credentials("", encryptForTest), { ok: true, value: null });
assert.equal(encryptCalls, 0);
assert.deepEqual(prepareMt5Credentials({ password: "dummy" }, encryptForTest), { ok: false, reason: "invalid" });
assert.deepEqual(prepareMt5Credentials("test-only-dummy-credential", encryptForTest), { ok: false, reason: "invalid" });
assert.deepEqual(prepareMt5Credentials(JSON.stringify({ login: "0", password: "x", server: "Demo" }), encryptForTest), { ok: false, reason: "invalid" });
assert.deepEqual(prepareMt5Credentials(JSON.stringify({ login: "1", password: "x" }), encryptForTest), { ok: false, reason: "invalid" });
assert.equal(encryptCalls, 0);

const prepared = prepareMt5Credentials(credentialPayload, encryptForTest);
assert.deepEqual(prepared, { ok: true, value: `sealed:${credentialPayload}` });
assert.equal(encryptCalls, 1);
if (prepared.ok) assert.notEqual(prepared.value, credentialPayload);

assert.deepEqual(
  prepareMt5Credentials(credentialPayload, () => { throw new Error("key unavailable"); }),
  { ok: false, reason: "unavailable" },
);

assert.deepEqual(buildMt5CredentialUpdateData(false, undefined), {});
assert.deepEqual(buildMt5CredentialUpdateData(true, null), { credentials: null });
assert.deepEqual(buildMt5CredentialUpdateData(true, undefined), { credentials: null });
assert.deepEqual(buildMt5CredentialUpdateData(true, "replacement-ciphertext"), { credentials: "replacement-ciphertext" });

const routeSources = [
  readFileSync("app/api/admin/mt5-accounts/route.ts", "utf8"),
  readFileSync("app/api/admin/mt5-accounts/[id]/route.ts", "utf8"),
  readFileSync("app/api/accounts/route.ts", "utf8"),
  readFileSync("app/api/accounts/[id]/route.ts", "utf8"),
];
assert.match(routeSources[0], /prepareMt5Credentials\(credentials\)/);
assert.match(routeSources[1], /prepareMt5Credentials\(credentials\)/);
for (const source of routeSources) {
  assert.match(source, /prepareMt5Credentials\(/);
  assert.doesNotMatch(source, /encryptIfEnabled\(body\.credentials\)/);
  assert.doesNotMatch(source, /credentials:\s*credentials\s*(?:\?\?\s*null)?[,;]/);
  assert.doesNotMatch(source, /updateData\.credentials\s*=\s*credentials\s*;/);
}
assert.match(routeSources[0], /credentials:\s*preparedCredentials\.value\s*\?\?\s*null/);
assert.match(routeSources[1], /updateData\.credentials\s*=\s*preparedCredentials\.value\s*\?\?\s*null/);
assert.match(routeSources[1], /Credentials cannot be removed while the account is IN_USE or has an active assignment/);
assert.match(routeSources[1], /credentialsConfiguredAfterUpdate/);

const inventoryPage = readFileSync("app/admin/accounts/page.tsx", "utf8");
const accountDetailPage = readFileSync("app/admin/accounts/[id]/page.tsx", "utf8");
assert.match(inventoryPage, /credentials:\s*JSON\.stringify\(\{\s*login,\s*password:\s*mt5Password,\s*server\s*\}\)/);
assert.match(inventoryPage, /type="password"/);
assert.match(accountDetailPage, /credentials:\s*JSON\.stringify\(\{\s*login,\s*password:\s*credentialPassword,\s*server\s*\}\)/);
assert.match(accountDetailPage, /credentialsConfigured/);

const legacyAccountListRoute = readFileSync("app/api/accounts/route.ts", "utf8");
const safeAccountSelect = legacyAccountListRoute.match(
  /const accountResponseSelect = \{[\s\S]*?\} satisfies Prisma\.MT5AccountSelect/,
);
assert.ok(safeAccountSelect);
assert.doesNotMatch(safeAccountSelect[0], /\bcredentials\b/);
assert.match(legacyAccountListRoute, /mT5Account\.findMany\(\{[\s\S]*?select: accountResponseSelect/);
assert.match(legacyAccountListRoute, /mT5Account\.create\(\{[\s\S]*?select: accountResponseSelect/);
assert.doesNotMatch(legacyAccountListRoute, /accounts\.map\(omitCredentials\)/);

const legacyAccountDetailRoute = readFileSync("app/api/accounts/[id]/route.ts", "utf8");
assert.match(legacyAccountDetailRoute, /buildMt5CredentialUpdateData\(/);
assert.match(legacyAccountDetailRoute, /const account = await prisma\.\$transaction\(async \(tx\) => \{/);
assert.match(legacyAccountDetailRoute, /const deletion = await prisma\.\$transaction\(async \(tx\) => \{[\s\S]*?FOR UPDATE[\s\S]*?tx\.mT5Account\.delete[\s\S]*?tx\.auditLog\.create/);
assert.doesNotMatch(legacyAccountDetailRoute, /await prisma\.mT5Account\.delete\(/);

console.log("Admin MT5 credential safety tests passed.");
