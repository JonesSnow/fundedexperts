import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { getPaymentProvider, getConfiguredProviderName } from "@/lib/payment-provider-registry";
import { isValidTransition } from "@/lib/payment-state-machine";
import type { PaymentRequest } from "@/lib/payment";
import { randomUUID } from "node:crypto";

const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function mapProviderStatusForRecord(status: string): string {
  return status.toUpperCase();
}

function hostedCheckoutUrl(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).checkoutUrl;
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/orders/[id]/pay
 *
 * Initiates a payment for an order using the configured payment provider.
 *
 * Security properties:
 * - Requires an authenticated session and order ownership.
 * - Fails closed (503) when no real payment provider is configured; the mock
 *   provider is never activated outside tests.
 * - The authoritative amount and currency come from the stored order record.
 * - Payment initiation is idempotent: a reserved idempotency key is passed to
 *   the provider (which must honor it) and recorded in PaymentEvent, so
 *   repeated requests cannot create duplicate provider payments.
 * - A successful initiation only marks the order PENDING_PAYMENT
 *   ("payment initiated"). It does NOT mark the order PAID. Only an
 *   authenticated webhook confirmation can transition an order to PAID.
 * - Provider timeouts and uncertain outcomes leave the order unmarked and
 *   return a generic error without leaking provider internals or credentials.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = generateCorrelationId();
  const { id: orderId } = await params;

  const token = getSessionCookie(request);
  if (!token) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, status: true },
  });
  if (!trader || trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const providerName = getConfiguredProviderName();
  if (!providerName) {
    return NextResponse.json(
      { success: false, error: "Payments are not available yet. No payment provider is configured." },
      { status: 503 },
    );
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, traderId: true, status: true, totalAmount: true, currency: true, idempotencyKey: true },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    if (order.traderId !== trader.id) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    const currentState = order.status as string;

    // An order already paid must not be re-initiated.
    if (currentState === "PAID") {
      logger.info("PAYMENT", "Payment already initiated for paid order", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Order", id: orderId },
        metadata: { provider: providerName, alreadyPaid: true },
      });
      return NextResponse.json(
        { success: true, alreadyPaid: true, orderId, status: "PAID" },
        { status: 200 },
      );
    }

    // A payment already in flight must not be re-initiated (no duplicate
    // provider payments). Return the existing payment info idempotently.
    if (currentState === "PENDING_PAYMENT") {
      const existing = await prisma.paymentEvent.findFirst({
        where: { orderId },
        orderBy: { processedAt: "desc" },
        select: { providerEventId: true, transactionId: true, providerStatus: true, verified: true, metadata: true },
      });
      if (existing) {
        const checkoutUrl = hostedCheckoutUrl(existing.metadata);
        if (!checkoutUrl) {
          return NextResponse.json(
            { success: false, error: "Payment initiation is being reconciled; retry after support review" },
            { status: 409 },
          );
        }
        return NextResponse.json(
          {
            success: true,
            duplicate: true,
            orderId,
            paymentId: existing.transactionId ?? existing.providerEventId,
            status: "PENDING_PAYMENT",
            providerRefId: existing.transactionId,
            providerStatus: existing.providerStatus,
            checkoutUrl,
          },
          { status: 200 },
        );
      }
      return NextResponse.json(
        { success: false, error: "A payment is already in progress for this order" },
        { status: 409 },
      );
    }

    if (!isValidTransition(currentState, "PAYMENT_INITIATED")) {
      return NextResponse.json(
        { success: false, error: `Cannot initiate payment from order status: ${currentState}` },
        { status: 409 },
      );
    }

    // Each attempt has a durable unique key. An order can retry only after a
    // definitive provider rejection moves it to FAILED; uncertain outcomes stay
    // pending and cannot create another invoice automatically.
    const idempotencyKey = `payment:${order.id}:${randomUUID()}`;

    const provider = getPaymentProvider(providerName);
    const paymentRequest: PaymentRequest = {
      orderId: order.id,
      amount: Number(order.totalAmount),
      currency: order.currency,
      provider: providerName,
      idempotencyKey,
    };

    // Reserve this attempt and claim the current order state transactionally
    // before the external call. The conditional update prevents concurrent
    // attempts from both reaching the provider.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.paymentEvent.create({
          data: {
            orderId: order.id,
            providerEventId: idempotencyKey,
            providerStatus: "INITIATION_RESERVED",
            amount: Number(order.totalAmount),
            currency: order.currency,
            verified: false,
            metadata: { provider: providerName, event: "PAYMENT_INITIATION_RESERVED" },
          },
        });
        const claimed = await tx.order.updateMany({
          where: { id: orderId, status: order.status },
          data: { status: "PENDING_PAYMENT" },
        });
        if (claimed.count !== 1) throw new Error("PAYMENT_ATTEMPT_ALREADY_CLAIMED");
        await tx.auditLog.create({
          data: {
            action: "SYSTEM_EVENT",
            entityType: "Order",
            entityId: orderId,
            performedBy: trader.id,
            details: { orderId, event: "PAYMENT_INITIATION_RESERVED", provider: providerName },
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "PAYMENT_ATTEMPT_ALREADY_CLAIMED") {
        return NextResponse.json(
          { success: false, error: "Another payment attempt is already being processed" },
          { status: 409 },
        );
      }
      if (isPrismaErrorCode(error, "P2002")) {
        const existing = await prisma.paymentEvent.findUnique({
          where: { providerEventId: idempotencyKey },
          select: { orderId: true, providerEventId: true, amount: true, currency: true, transactionId: true, providerStatus: true, metadata: true },
        });
        if (existing?.orderId === order.id
          && Number(existing.amount) === Number(order.totalAmount)
          && existing.currency === order.currency) {
          const checkoutUrl = hostedCheckoutUrl(existing.metadata);
          return NextResponse.json(
            checkoutUrl
              ? {
                  success: true,
                  duplicate: true,
                  orderId,
                  paymentId: existing.transactionId ?? existing.providerEventId,
                  providerRefId: existing.transactionId,
                  providerStatus: existing.providerStatus,
                  checkoutUrl,
                  statusText: "PENDING_PAYMENT",
                }
              : { success: false, error: "Payment initiation is being reconciled; retry after support review" },
            { status: checkoutUrl ? 200 : 409 },
          );
        }
      }
      logger.error("PAYMENT", "Payment idempotency reservation failed", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Order", id: orderId },
        error: { code: "PAYMENT_RESERVATION_FAILED", message: "Reservation was not created" },
      });
      return NextResponse.json({ success: false, error: "Payment could not be reserved safely" }, { status: 500 });
    }

    let result;
    try {
      result = await provider.processPayment(paymentRequest);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      logger.error("PAYMENT", "Payment provider initiation failed", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Order", id: orderId },
        error: { code: "PAYMENT_PROVIDER_FAILED", message: msg },
      });
      return NextResponse.json(
        { success: false, error: "Payment initiation could not be completed. Please retry." },
        { status: 502 },
      );
    }

    if (!result.success || !result.providerRefId) {
      logger.warn("PAYMENT", "Payment provider did not confirm initiation", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Order", id: orderId },
        metadata: { provider: providerName, status: result?.status, error: result?.error },
      });
      if (result.safeToRetry) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.paymentEvent.update({
              where: { providerEventId: idempotencyKey },
              data: {
                providerStatus: "INITIATION_REJECTED",
                metadata: { provider: providerName, event: "PAYMENT_INITIATION_REJECTED" },
              },
            });
            const failed = await tx.order.updateMany({
              where: { id: orderId, status: "PENDING_PAYMENT" },
              data: { status: "FAILED" },
            });
            if (failed.count === 1) {
              await tx.auditLog.create({
                data: {
                  action: "SYSTEM_EVENT",
                  entityType: "Order",
                  entityId: orderId,
                  performedBy: trader.id,
                  details: { orderId, event: "PAYMENT_INITIATION_REJECTED", provider: providerName },
                },
              });
            }
          });
        } catch {
          logger.error("PAYMENT", "Definitive provider rejection could not be reconciled", {
            correlationId,
            entity: { type: "Order", id: orderId },
            error: { code: "PAYMENT_REJECTION_RECONCILIATION_FAILED", message: "Order state unchanged" },
          });
          return NextResponse.json(
            { success: false, error: "Payment rejection is being reconciled; contact support before retrying" },
            { status: 500 },
          );
        }
        return NextResponse.json(
          { success: false, retryable: true, error: "The provider rejected this payment attempt. You can safely try again." },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { success: false, error: result?.error ?? "Payment initiation is being reconciled; contact support before retrying" },
        { status: 502 },
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.paymentEvent.update({
          where: { providerEventId: idempotencyKey },
          data: {
            providerStatus: mapProviderStatusForRecord(result.providerStatus ?? result.status),
            transactionId: result.providerRefId,
            metadata: {
              provider: providerName,
              paymentId: result.paymentId,
              checkoutUrl: result.checkoutUrl ?? null,
              orderCurrency: order.currency,
            },
          },
        });

        await tx.auditLog.create({
          data: {
            action: "SYSTEM_EVENT",
            entityType: "Order",
            entityId: orderId,
            performedBy: trader.id,
            details: {
              orderId,
              event: "PAYMENT_INITIATED",
              provider: providerName,
              providerRefId: result.providerRefId,
              paymentId: result.paymentId,
              amount: Number(order.totalAmount),
              currency: order.currency,
              nextState: "PENDING_PAYMENT",
            },
          },
        });
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      logger.error("PAYMENT", "Payment initiation record failed", {
        correlationId,
        actor: { type: "trader", id: trader.id },
        entity: { type: "Order", id: orderId },
        error: { code: "PAYMENT_RECORD_FAILED", message: msg },
      });
      return NextResponse.json(
        { success: false, error: "Payment initiation could not be completed. Please retry." },
        { status: 500 },
      );
    }

    logger.info("PAYMENT", "Payment initiated", {
      correlationId,
      actor: { type: "trader", id: trader.id },
      entity: { type: "Order", id: orderId },
      metadata: { provider: providerName, success: true, paymentId: result.paymentId, providerRefId: result.providerRefId },
    });

    return NextResponse.json(
      {
        success: true,
        paymentId: result.paymentId,
        status: result.status,
        providerRefId: result.providerRefId,
        checkoutUrl: result.checkoutUrl ?? null,
        orderId,
        statusText: "PENDING_PAYMENT",
      },
      { status: 200 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("PAYMENT", "Payment initiation failed", {
      correlationId,
      actor: { type: "trader", id: trader.id },
      entity: { type: "Order", id: orderId },
      error: { code: "PAYMENT_INIT_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Payment initiation failed" },
      { status: 500 },
    );
  }
}
