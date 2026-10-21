import assert from "node:assert/strict";
import test from "node:test";
import { publicApiCorrelationId } from "../lib/public-api-error";

test("public API references accept only UUID-shaped correlation IDs", () => {
  const id = "corr_3ee8194b-40f8-4157-98d3-dbd131d4c82c";
  assert.equal(publicApiCorrelationId({ correlationId: id }), id);
  assert.equal(publicApiCorrelationId({ correlationId: "corr_private-details" }), null);
  assert.equal(publicApiCorrelationId({ correlationId: ` ${id}` }), null);
  assert.equal(publicApiCorrelationId({ correlationId: 123 }), null);
  assert.equal(publicApiCorrelationId(null), null);
  assert.equal(publicApiCorrelationId([id]), null);
});
