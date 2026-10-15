import assert from "node:assert/strict";
import test from "node:test";
import { attemptOrderCreatedNotification } from "../lib/order-notification";

test("failed confirmation delivery does not turn a persisted order into an apparent create failure", async () => {
  let failureLogged = false;
  const delivered = await attemptOrderCreatedNotification(
    async () => ({ success: false }),
    () => { failureLogged = true; },
  );

  assert.equal(delivered, false);
  assert.equal(failureLogged, true);
});

test("thrown confirmation delivery errors are reported without escaping the notification boundary", async () => {
  let failureLogged = false;
  const delivered = await attemptOrderCreatedNotification(
    async () => { throw new Error("private transport detail"); },
    () => { failureLogged = true; },
  );

  assert.equal(delivered, false);
  assert.equal(failureLogged, true);
});

test("successful confirmation delivery does not report failure", async () => {
  let failureLogged = false;
  const delivered = await attemptOrderCreatedNotification(
    async () => ({ success: true }),
    () => { failureLogged = true; },
  );

  assert.equal(delivered, true);
  assert.equal(failureLogged, false);
});
