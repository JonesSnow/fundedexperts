import assert from "node:assert/strict";
import test from "node:test";
import { cancellableOrderWhere } from "../lib/order-cancellation";

test("trader cancellation query is constrained by ownership and cancellable states", () => {
  assert.deepEqual(cancellableOrderWhere("order-1", "trader-1", "TRADER"), {
    id: "order-1",
    traderId: "trader-1",
    status: { in: ["CREATED", "PENDING_PAYMENT"] },
  });
});

test("admin cancellation query remains status-conditional", () => {
  assert.deepEqual(cancellableOrderWhere("order-2", "admin-1", "ADMIN"), {
    id: "order-2",
    status: { in: ["CREATED", "PENDING_PAYMENT"] },
  });
});
