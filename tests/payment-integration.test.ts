/**
 * Database-backed payment security integration tests.
 *
 * This suite imports the shared guarded bootstrap before any application
 * module. The actual connected database name, role, server address, and port
 * are verified before a Prisma client or test write is created.
 *
 * Run only after provisioning and independently verifying a disposable local
 * PostgreSQL target and applying the checked-in migrations:
 * Run through pnpm test:db after provisioning the verified disposable target.
 */
import { TEST_DATABASE_URL } from "./support/test-env";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { Prisma, PrismaClient, OrderStatus } from "@prisma/client";
import { POST as webhookPost } from "../app/api/webhooks/payment/route";
import { getConfiguredProviderName } from "../lib/payment-provider-registry";
import { activatePaidOrder, prismaActivationRepository } from "../lib/evaluation-activation";

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

function signBody(rawBody: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function webhookRequest(
  rawBody: Buffer,
  secret: string,
  invalidSignature: boolean,
  eventId = "evt-integration-1",
): NextRequest {
  const signature = invalidSignature
    ? createHmac("sha256", "wrong-secret").update(rawBody).digest("hex")
    : signBody(rawBody, secret);
  return new NextRequest("http://localhost/api/webhooks/payment", {
    method: "POST",
    body: rawBody.toString("utf8"),
    headers: {
      "content-type": "application/json",
      "x-mock-payment-signature": signature,
      "x-mock-payment-event-id": eventId,
      "x-mock-payment-status": "COMPLETED",
    },
  });
}

async function main(): Promise<number> {
  // Fail closed: no real provider is configured in this test process, so the
  // webhook endpoint must refuse to accept events (503) unless we enable MOCK
  // for the test scope only.
  const noProvider = getConfiguredProviderName();
  if (noProvider !== null) {
    console.error("FAIL: expected no configured provider before enabling mock");
    return 1;
  }

  Reflect.set(process.env, "PAYMENT_PROVIDER", "MOCK");
  Reflect.set(process.env, "MOCK_PAYMENT_WEBHOOK_SECRET", "integration-test-secret");

  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let traderId: string | null = null;
  let orderId: string | null = null;
  const createdOrderIds: string[] = [];
  let rollbackFunctionInstalled = false;

  try {
    // Confirm the provider is fail-closed outside test scope behavior is
    // exercised by the unit suite; here MOCK is enabled strictly for this
    // isolated test process.
    if (getConfiguredProviderName() !== "MOCK") {
      console.error("FAIL: mock provider not available in test scope");
      return 1;
    }

    const trader = await prisma.trader.create({
      data: { email: `integration-${Date.now()}@example.test`, password: "x" },
      select: { id: true },
    });
    traderId = trader.id;

    const product = await prisma.product.create({
      data: {
        code: `P-INT-${Date.now()}`,
        name: `Integration Product ${Date.now()}`,
        price: new Prisma.Decimal(99.99),
        currency: "USD",
        status: "ACTIVE",
        isActive: true,
      },
      select: { id: true },
    });

    const order = await prisma.order.create({
      data: {
        traderId: trader.id,
        status: "CREATED",
        subtotal: new Prisma.Decimal(99.99),
        totalAmount: new Prisma.Decimal(99.99),
        currency: "USD",
        orderNumber: `ORD-INT-${Date.now()}`,
        orderItems: {
          create: [{ productId: product.id, unitPrice: new Prisma.Decimal(99.99), currency: "USD", quantity: 1 }],
        },
      },
      select: { id: true },
    });
    orderId = order.id;
    createdOrderIds.push(orderId);

    const rawBody = Buffer.from(
      JSON.stringify({ orderId: order.id, amount: 99.99, currency: "USD", providerStatus: "COMPLETED" }),
    );

    // Competing copies of the same signed provider event must converge on one
    // committed payment event and return one normal transition plus one replay.
    const [first, concurrentReplay] = await Promise.all([
      webhookPost(webhookRequest(rawBody, "integration-test-secret", false)),
      webhookPost(webhookRequest(rawBody, "integration-test-secret", false)),
    ]);
    const webhookResults = await Promise.all([first, concurrentReplay].map(async (response) => ({
      status: response.status,
      body: await parseBody(response) as { success?: boolean; to?: string; duplicate?: boolean } | null,
    })));
    const initialTransition = webhookResults.find(({ body }) => body?.success === true && body.to === "PAID");
    const replayResult = webhookResults.find(({ body }) => body?.success === true && body.duplicate === true);
    if (!initialTransition || !replayResult || webhookResults.some(({ status }) => status !== 200)) {
      console.error("FAIL: concurrent confirmed webhook replay did not converge idempotently", {
        statuses: webhookResults.map(({ status }) => status),
      });
      return 1;
    }

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
    if (updatedOrder?.status !== "PAID") {
      console.error("FAIL: order not persisted as PAID", updatedOrder);
      return 1;
    }

    const events = await prisma.paymentEvent.count({ where: { orderId: order.id } });
    if (events !== 1) {
      console.error("FAIL: expected exactly one PaymentEvent", { events });
      return 1;
    }

    // Replayed identical event: must be idempotent (duplicate:true), no new PaymentEvent.
    const replay = await webhookPost(webhookRequest(rawBody, "integration-test-secret", false));
    const replayBody = (await parseBody(replay)) as { success?: boolean; duplicate?: boolean } | null;
    if (replay.status !== 200 || replayBody?.duplicate !== true) {
      console.error("FAIL: replayed webhook not deduplicated", { status: replay.status, body: replayBody });
      return 1;
    }
    const eventsAfterReplay = await prisma.paymentEvent.count({ where: { orderId: order.id } });
    if (eventsAfterReplay !== 1) {
      console.error("FAIL: replayed webhook created a duplicate PaymentEvent", { events: eventsAfterReplay });
      return 1;
    }
    const [evaluationsForOrder, assignmentsForTrader] = await Promise.all([
      prisma.evaluation.count({ where: { orderId: order.id } }),
      prisma.accountAssignment.count({ where: { traderId } }),
    ]);
    if (evaluationsForOrder !== 0 || assignmentsForTrader !== 0) {
      console.error("FAIL: duplicate payment webhooks created account allocation state", {
        evaluationsForOrder,
        assignmentsForTrader,
      });
      return 1;
    }

    // Invalid signature: must be rejected with 401, no state change.
    const rawBody2 = Buffer.from(
      JSON.stringify({ orderId: order.id, amount: 99.99, currency: "USD", providerStatus: "COMPLETED" }),
    );
    const invalid = await webhookPost(webhookRequest(rawBody2, "integration-test-secret", true));
    if (invalid.status !== 401) {
      console.error("FAIL: invalid signature not rejected", { status: invalid.status });
      return 1;
    }

    // Amount mismatch with a valid signature: 400.
    const mismatchBody = Buffer.from(
      JSON.stringify({ orderId: order.id, amount: 1.00, currency: "USD", providerStatus: "COMPLETED" }),
    );
    const mismatch = new NextRequest("http://localhost/api/webhooks/payment", {
      method: "POST",
      body: mismatchBody.toString("utf8"),
      headers: {
        "content-type": "application/json",
        "x-mock-payment-signature": signBody(mismatchBody, "integration-test-secret"),
        "x-mock-payment-event-id": "evt-integration-2",
        "x-mock-payment-status": "COMPLETED",
      },
    });
    const mismatchResp = await webhookPost(mismatch);
    if (mismatchResp.status !== 400) {
      console.error("FAIL: amount mismatch not rejected", { status: mismatchResp.status });
      return 1;
    }

    // Force the final audit insert in the production webhook transaction to
    // fail, then verify the earlier event/order writes rolled back together.
    const rollbackOrder = await prisma.order.create({
      data: {
        traderId: trader.id,
        status: "CREATED",
        subtotal: new Prisma.Decimal(99.99),
        totalAmount: new Prisma.Decimal(99.99),
        currency: "USD",
        orderNumber: `ORD-INT-ROLLBACK-${Date.now()}`,
        orderItems: {
          create: [{ productId: product.id, unitPrice: new Prisma.Decimal(99.99), currency: "USD", quantity: 1 }],
        },
      },
      select: { id: true },
    });
    createdOrderIds.push(rollbackOrder.id);
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "test_reject_payment_audit"() RETURNS trigger AS $$
      BEGIN
        IF NEW."entityType" = 'PaymentEvent' THEN
          RAISE EXCEPTION 'integration rollback test';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    rollbackFunctionInstalled = true;
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "test_reject_payment_audit_trigger"
      BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION "test_reject_payment_audit"()
    `);
    const rollbackBody = Buffer.from(JSON.stringify({
      orderId: rollbackOrder.id,
      amount: 99.99,
      currency: "USD",
      providerStatus: "COMPLETED",
    }));
    const rollbackResponse = await webhookPost(webhookRequest(
      rollbackBody,
      "integration-test-secret",
      false,
      "evt-integration-rollback",
    ));
    const [rollbackOrderAfterFailure, rollbackEventCount] = await Promise.all([
      prisma.order.findUnique({ where: { id: rollbackOrder.id }, select: { status: true } }),
      prisma.paymentEvent.count({ where: { orderId: rollbackOrder.id } }),
    ]);
    await prisma.$executeRawUnsafe('DROP TRIGGER "test_reject_payment_audit_trigger" ON "AuditLog"');
    await prisma.$executeRawUnsafe('DROP FUNCTION "test_reject_payment_audit"()');
    rollbackFunctionInstalled = false;
    if (rollbackResponse.status !== 500 || rollbackOrderAfterFailure?.status !== "CREATED" || rollbackEventCount !== 0) {
      console.error("FAIL: webhook transaction did not roll back all writes after audit failure", {
        status: rollbackResponse.status,
        orderStatus: rollbackOrderAfterFailure?.status,
        paymentEvents: rollbackEventCount,
      });
      return 1;
    }

    // Allocation requires a verified PAID order: failed, expired, cancelled and
    // unverified payments must never allocate an account.
    for (const status of ["CREATED", "FAILED", "EXPIRED", "CANCELLED"] as OrderStatus[]) {
      const badOrder = await prisma.order.create({
        data: {
          traderId: trader.id,
          status,
          subtotal: new Prisma.Decimal(99.99),
          totalAmount: new Prisma.Decimal(99.99),
          currency: "USD",
          orderNumber: `ORD-INT-ALLOC-${status}-${Date.now()}`,
        },
        select: { id: true },
      });
      createdOrderIds.push(badOrder.id);
      const badResult = await activatePaidOrder(
        prismaActivationRepository(prisma),
        { orderId: badOrder.id, traderId },
      );
      if (badResult.success || badResult.code !== "ORDER_NOT_PAID") {
        console.error(`FAIL: ${status} order was able to allocate an account`, badResult);
        return 1;
      }
    }

    console.log("PAYMENT_INTEGRATION: all database-backed scenarios passed.");
    return 0;
  } catch (error) {
    console.error("FAIL: payment-integration threw", error);
    return 1;
  } finally {
    if (rollbackFunctionInstalled) {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "test_reject_payment_audit_trigger" ON "AuditLog"').catch(() => undefined);
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS "test_reject_payment_audit"()').catch(() => undefined);
    }
    for (const oid of createdOrderIds) {
      await prisma.paymentEvent.deleteMany({ where: { orderId: oid } }).catch(() => undefined);
      await prisma.order.delete({ where: { id: oid } }).catch(() => undefined);
    }
    if (traderId) {
      await prisma.trader.delete({ where: { id: traderId } }).catch(() => undefined);
    }
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main().then((code) => {
  process.exitCode = code;
});
