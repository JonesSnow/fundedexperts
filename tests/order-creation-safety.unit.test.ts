import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOrderCreationEnabled } from "../lib/order-availability";

const orderRoute = readFileSync(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
const postHandler = orderRoute.split("export async function POST(request: NextRequest)")[1]?.split("export async function GET(request: NextRequest)")[0] ?? "";

test("customer order creation stays disabled until verified checkout is implemented", () => {
  assert.equal(isOrderCreationEnabled(), false);
});

test("disabled order creation returns before auth, database, rate-limit, or request-body work", () => {
  const guard = postHandler.indexOf("if (!isOrderCreationEnabled())");
  assert.notEqual(guard, -1, "POST must include the order-availability guard");
  assert.ok(postHandler.indexOf("getAuthenticatedUser(request)") > guard);
  assert.ok(postHandler.indexOf("request.json()") > guard);
  assert.ok(postHandler.indexOf("checkRateLimit(") > guard);
  assert.ok(postHandler.indexOf("prisma.") > guard);
  assert.match(postHandler.slice(guard, guard + 240), /status:\s*503/);
  assert.match(postHandler.slice(guard, guard + 240), /Purchases are not available yet/);
});
