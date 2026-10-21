import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync(new URL("../app/api/accounts/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/accounts/page.tsx", import.meta.url), "utf8");

test("admin account inventory uses bounded cursor pages and preserves filters", () => {
  assert.match(route, /parseCursorPage\(request\.nextUrl\.searchParams\)/);
  assert.match(route, /take: page\.limit \+ 1/);
  assert.match(route, /tx\.mT5Account\.count\(\{ where: baseWhere \}\)/);
  assert.match(route, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(route, /select: accountResponseSelect/);
  assert.match(route, /nextCursor:/);
  assert.match(page, /params\.set\("limit", String\(ACCOUNT_PAGE_SIZE\)\)/);
  assert.match(page, /if \(before\) params\.set\("before", before\)/);
  assert.match(page, /handleLoadOlder/);
  assert.match(page, /Showing \{accounts\.length\} of \{totalCount\} accounts/);
});
