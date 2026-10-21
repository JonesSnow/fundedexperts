import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../app/api/orders/[id]/pay/route";

async function testPaymentEndpointFailsClosed() {
  const request = new NextRequest("http://localhost/api/orders/test-order/pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ simulateSuccess: true, paymentMethod: "SIMULATED_CARD" }),
  });

  const response = await POST(request, { params: Promise.resolve({ id: "test-order" }) });

  // Must not accept client-declared success
  assert.ok(response.status === 401 || response.status === 503, `Expected 401 or 503, got ${response.status}`);
  const body = await response.json();
  assert.equal(body.success, false);
}

void testPaymentEndpointFailsClosed()
  .then(() => console.log("Payment endpoint safety test passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
