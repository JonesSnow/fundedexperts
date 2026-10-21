import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSameOrderRequest } from "../lib/order-idempotency";

const request = {
  traderId: "trader-1",
  productId: "product-1",
  notes: "Please email my receipt",
  couponCode: "WELCOME",
};

const existingOrder = {
  traderId: "trader-1",
  notes: "Please email my receipt",
  orderItems: [{ productId: "product-1", quantity: 1 }],
};

test("an exact order retry matches the existing request identity", () => {
  assert.equal(isSameOrderRequest(existingOrder, request, ["WELCOME"]), true);
});

test("reusing an order key with different customer, product, notes, coupon, or item count conflicts", () => {
  const conflicts = [
    { request: { ...request, traderId: "trader-2" }, coupons: ["WELCOME"] },
    { request: { ...request, productId: "product-2" }, coupons: ["WELCOME"] },
    { request: { ...request, notes: "Different receipt note" }, coupons: ["WELCOME"] },
    { request: { ...request, couponCode: "SPRING" }, coupons: ["WELCOME"] },
    { request, coupons: [] },
    { request, coupons: ["WELCOME", "OTHER"] },
    { request, coupons: ["WELCOME"], existing: { ...existingOrder, orderItems: [
      ...existingOrder.orderItems,
      { productId: "product-2", quantity: 1 },
    ] } },
    { request, coupons: ["WELCOME"], existing: { ...existingOrder, orderItems: [{ productId: "product-1", quantity: 2 }] } },
  ];

  for (const conflict of conflicts) {
    assert.equal(isSameOrderRequest(conflict.existing ?? existingOrder, conflict.request, conflict.coupons), false);
  }
});

test("the order route validates and resolves same-key requests before creating orders, including unique-key races", () => {
  const source = readFileSync(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  const postHandler = source.split("export async function POST(request: NextRequest)")[1]?.split("export async function GET(request: NextRequest)")[0] ?? "";

  assert.ok(postHandler.indexOf("validateCreateOrderInput(orderInput)") < postHandler.indexOf("findExistingOrderResponse("));
  assert.ok(postHandler.indexOf("findExistingOrderResponse(") < postHandler.indexOf("prisma.product.findUnique"));
  assert.match(postHandler, /isPrismaUniqueConstraintError\(error\)[\s\S]*findExistingOrderResponse\(/);
  assert.match(source, /isSameOrderRequest\(existing, requestIdentity, couponCodes\)/);
});
