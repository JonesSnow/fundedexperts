import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/orders/[id]/pay/route.ts", import.meta.url), "utf8");

test("payment attempts use unique keys and claim the order state before contacting the provider", () => {
  assert.match(route, /`payment:\$\{order\.id\}:\$\{randomUUID\(\)\}`/);
  assert.match(route, /tx\.order\.updateMany\([\s\S]*?where: \{ id: orderId, status: order\.status \}/);
  assert.ok(route.indexOf("PAYMENT_ATTEMPT_ALREADY_CLAIMED") < route.indexOf("provider.processPayment(paymentRequest)"));
});

test("only a definitive provider rejection releases the order for a safe retry", () => {
  const safeRetryBranch = route.slice(route.indexOf("if (result.safeToRetry)"), route.indexOf("return NextResponse.json(\n        { success: false, error: result?.error"));
  assert.match(safeRetryBranch, /providerStatus: "INITIATION_REJECTED"/);
  assert.match(safeRetryBranch, /where: \{ id: orderId, status: "PENDING_PAYMENT" \}/);
  assert.match(safeRetryBranch, /data: \{ status: "FAILED" \}/);
  assert.match(safeRetryBranch, /retryable: true/);
  assert.match(route, /if \(!result\.success \|\| !result\.providerRefId\)[\s\S]*?if \(result\.safeToRetry\)/);
});

test("uncertain failures do not release the pending reservation", () => {
  const failedResultBranch = route.slice(route.indexOf("if (!result.success || !result.providerRefId)"), route.indexOf("try {\n      await prisma.$transaction", route.indexOf("if (!result.success || !result.providerRefId)")));
  assert.match(failedResultBranch, /if \(result\.safeToRetry\)/);
  assert.match(failedResultBranch, /Payment initiation is being reconciled; contact support before retrying/);
  assert.doesNotMatch(failedResultBranch.slice(failedResultBranch.indexOf("return NextResponse.json(\n        { success: false, error: result?.error")), /data: \{ status: "FAILED" \}/);
});
