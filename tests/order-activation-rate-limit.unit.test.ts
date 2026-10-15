import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { NextRequest } from "next/server";
import { createSession } from "../lib/auth/session";
import { resetRateLimit } from "../lib/auth/rate-limit";

const traderId = "activation-rate-limit-test-trader";
const orderId = "activation-rate-limit-test-order";
let transactionCount = 0;

const fakePrisma = {
  trader: {
    findUnique: async () => ({ id: traderId, role: "TRADER", status: "ACTIVE" }),
  },
  $transaction: async () => {
    transactionCount += 1;
    throw new Error("Mocked transaction; database access is disabled in this test.");
  },
};

const previousPrisma = Reflect.get(globalThis, "__fundedExpertsPrisma");
Reflect.set(globalThis, "__fundedExpertsPrisma", fakePrisma);

let activationRoutes: Array<(request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>> = [];
let cookie = "";

before(async () => {
  activationRoutes = [
    (await import("../app/api/orders/[id]/activate/route")).POST,
    (await import("../app/api/orders/[id]/activate-evaluation/route")).POST,
    (await import("../app/api/orders/[id]/allocate/route")).POST,
  ];
  cookie = `session=${await createSession(traderId, "TRADER", true)}`;
});

after(() => {
  resetRateLimit(`order:activation:${traderId}`);
  if (previousPrisma === undefined) Reflect.deleteProperty(globalThis, "__fundedExpertsPrisma");
  else Reflect.set(globalThis, "__fundedExpertsPrisma", previousPrisma);
});

test("activation aliases share one per-trader rate limit", async () => {
  resetRateLimit(`order:activation:${traderId}`);
  transactionCount = 0;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const route = activationRoutes[attempt % activationRoutes.length];
    assert.ok(route);
    const request = new NextRequest(`https://fundedexperts.test/api/orders/${orderId}/activate`, {
      method: "POST",
      headers: { cookie },
    });
    const response = await route(request, { params: Promise.resolve({ id: orderId }) });
    assert.equal(response.status, 500, "the mocked activation transaction should fail safely");
  }

  const blockedRoute = activationRoutes[2];
  assert.ok(blockedRoute);
  const blocked = await blockedRoute(
    new NextRequest(`https://fundedexperts.test/api/orders/${orderId}/allocate`, { method: "POST", headers: { cookie } }),
    { params: Promise.resolve({ id: orderId }) },
  );

  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "900");
  assert.equal(transactionCount, 5, "the rejected request must not start another activation transaction");
});
