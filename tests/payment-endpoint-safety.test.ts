import assert from "node:assert/strict";
import { POST } from "../app/api/orders/[id]/pay/route";

async function testPaymentEndpointFailsClosed() {
  const response = await POST(
    new Request("http://localhost/api/orders/test-order/pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ simulateSuccess: true, paymentMethod: "SIMULATED_CARD" }),
    }),
    { params: Promise.resolve({ id: "test-order" }) },
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    success: false,
    error: "Payments are not available yet",
  });
}

void testPaymentEndpointFailsClosed()
  .then(() => console.log("Payment endpoint safety test passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
