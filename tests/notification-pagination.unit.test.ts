import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { encodeCreatedAtCursor, parseCursorPage } from "../lib/cursor-pagination";

const apiRoute = readFileSync(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8");
const traderPanel = readFileSync(new URL("../components/notifications-panel.tsx", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../app/admin/notifications/page.tsx", import.meta.url), "utf8");

test("notification cursor parameters reject malformed and duplicate values", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const cursor = encodeCreatedAtCursor({ id, createdAt: new Date("2026-10-15T19:00:00.000Z") });
  const parsed = parseCursorPage(new URLSearchParams({ limit: "25", before: cursor }));

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.limit, 25);
    assert.equal(parsed.cursor?.id, id);
    assert.equal(parsed.cursor?.createdAt.toISOString(), "2026-10-15T19:00:00.000Z");
  }
  assert.equal(parseCursorPage(new URLSearchParams("limit=101")).success, false);
  assert.equal(parseCursorPage(new URLSearchParams("before=bad-cursor")).success, false);
  assert.equal(parseCursorPage(new URLSearchParams("before=one&before=two")).success, false);
});

test("notification API bounds pages and scopes the stable cursor and unread total", () => {
  assert.match(apiRoute, /parseCursorPage\(request\.nextUrl\.searchParams\)/);
  assert.match(apiRoute, /createdAt: \{ lt: page\.cursor\.createdAt \}/);
  assert.match(apiRoute, /createdAt: page\.cursor\.createdAt, id: \{ lt: page\.cursor\.id \}/);
  assert.match(apiRoute, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(apiRoute, /take: page\.limit \+ 1/);
  assert.match(apiRoute, /tx\.notification\.count\(\{ where: \{ \.\.\.baseWhere, read: false \} \}\)/);
  assert.match(apiRoute, /TransactionIsolationLevel\.RepeatableRead/);
  assert.match(apiRoute, /includeTraderDetails \?/);
  assert.match(apiRoute, /trader: \{ select: \{ email: true, firstName: true, lastName: true \} \}/);
  assert.match(apiRoute, /nextCursor:/);
  assert.equal((apiRoute.match(/notification\.findMany\(/g) ?? []).length, 1);
});

test("trader and admin notification screens request and append older pages", () => {
  assert.match(traderPanel, /showViewAll \? "5" : "25"/);
  assert.match(traderPanel, /before: nextCursor/);
  assert.match(traderPanel, /setNotifications\(\(current\) =>/);
  assert.match(traderPanel, /setUnreadTotal\(data\.unreadCount\)/);
  assert.match(traderPanel, /Load older notifications/);
  assert.match(adminPage, /NOTIFICATION_PAGE_SIZE = 50/);
  assert.match(adminPage, /query\.set\("before", cursor\)/);
  assert.match(adminPage, /Load older notifications/);
  assert.match(adminPage, /setUnreadTotal\(data\.unreadCount\)/);
  assert.doesNotMatch(adminPage, /updatedAt: string/);
});
