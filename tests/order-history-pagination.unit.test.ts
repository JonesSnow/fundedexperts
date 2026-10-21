import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { encodeCreatedAtCursor, parseCursorPage } from "../lib/cursor-pagination";

const orderRoute = readFileSync(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
const ordersPage = readFileSync(new URL("../app/orders/page.tsx", import.meta.url), "utf8");
const dashboardPage = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const traderEvaluationsRoute = readFileSync(new URL("../app/api/trader/evaluations/route.ts", import.meta.url), "utf8");
const adminEvaluationsRoute = readFileSync(new URL("../app/api/evaluations/route.ts", import.meta.url), "utf8");
const evaluationsPage = readFileSync(new URL("../app/evaluations/page.tsx", import.meta.url), "utf8");

test("cursor page requests use a bounded default and maximum size", () => {
  assert.deepEqual(parseCursorPage(new URLSearchParams()), {
    success: true,
    limit: 50,
    cursor: null,
  });
  assert.equal(parseCursorPage(new URLSearchParams("limit=100")).success, true);
  assert.equal(parseCursorPage(new URLSearchParams("limit=101")).success, false);
  assert.equal(parseCursorPage(new URLSearchParams("limit=0")).success, false);
  assert.equal(parseCursorPage(new URLSearchParams("limit=10&limit=20")).success, false);
  assert.deepEqual(parseCursorPage(new URLSearchParams("before=first&before=second")), {
    success: false,
    error: "Invalid page cursor",
  });
});

test("cursor payloads are validated and round-trip with a stable sort boundary", () => {
  const expected = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    createdAt: new Date("2026-10-15T19:00:00.000Z"),
  };
  const encoded = encodeCreatedAtCursor(expected);
  const parsed = parseCursorPage(new URLSearchParams({ before: encoded }));
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.cursor?.id, expected.id);
    assert.equal(parsed.cursor?.createdAt.toISOString(), expected.createdAt.toISOString());
  }
  assert.equal(parseCursorPage(new URLSearchParams("before=not-a-cursor")).success, false);
  assert.equal(parseCursorPage(new URLSearchParams(`before=${"a".repeat(257)}`)).success, false);
});

test("order history uses bounded stable pages and preserves exact summary counts", () => {
  assert.match(orderRoute, /take: page\.limit \+ 1/);
  assert.match(orderRoute, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(orderRoute, /tx\.order\.count\(\{ where: baseWhere \}\)/);
  assert.match(orderRoute, /tx\.order\.groupBy\(/);
  assert.match(orderRoute, /TransactionIsolationLevel\.RepeatableRead/);
  assert.match(orderRoute, /nextCursor:/);
  assert.match(ordersPage, /loadOlderOrders/);
  assert.match(ordersPage, /Load older orders/);
  assert.match(dashboardPage, /orderSummary\?\.totalCount/);
  assert.match(dashboardPage, /statusCounts\.PENDING_PAYMENT/);
});

test("evaluation feeds and history page use bounded cursors and exact status summaries", () => {
  for (const route of [traderEvaluationsRoute, adminEvaluationsRoute]) {
    assert.match(route, /take: page\.limit \+ 1/);
    assert.match(route, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
    assert.match(route, /tx\.evaluation\.groupBy\(/);
    assert.match(route, /TransactionIsolationLevel\.RepeatableRead/);
    assert.match(route, /nextCursor:/);
  }
  assert.match(evaluationsPage, /loadOlderEvaluations/);
  assert.match(evaluationsPage, /Load older evaluations/);
  assert.match(dashboardPage, /evaluationSummary\?\.totalCount/);
});
