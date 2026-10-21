import { NextRequest, NextResponse } from "next/server";
import { Prisma, type AuditAction } from "@prisma/client";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { getConfiguredProviderName, getPaymentProvider } from "@/lib/payment-provider-registry";
import { canonicalAmount, canonicalCurrency, isSameVerifiedPaymentEvent } from "@/lib/payment-verification";
import { isValidTransition, getNextState } from "@/lib/payment-state-machine";
import { mapNowPaymentsOrderEvent } from "@/lib/nowpayments-provider";

const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

function readHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

function mapProviderStatus(
  status: string,
  providerName: string,
): "PAYMENT_INITIATED" | "PAYMENT_CONFIRMED" | "PAYMENT_FAILED" | "PAYMENT_EXPIRED" | "PAYMENT_CANCELLED" | null {
  const normalized = status.toUpperCase();
  if (providerName === "NOWPAYMENTS") {
    return mapNowPaymentsOrderEvent(status);
  }
  switch (normalized) {
    case "PENDING":
    case "PROCESSING":
      return "PAYMENT_INITIATED";
    case "COMPLETED":
    case "CONFIRMED":
    case "CAPTURED":
      return "PAYMENT_CONFIRMED";
    case "FAILED":
    case "DECLINED":
    case "REJECTED":
      return "PAYMENT_FAILED";
    case "EXPIRED":
      return "PAYMENT_EXPIRED";
    case "CANCELLED":
    case "CANCELED":
      return "PAYMENT_CANCELLED";
    default:
      return null;
  }
}

/**
 * POST /api/webhooks/payment
 *
 * Receives payment provider webhook events.
 *
 * Security properties:
 * - The request is rejected unless the configured provider authenticates the
 *   signature over the raw request body and required headers. A generic JSON
 *   body is never treated as proof of payment.
 * - Provider event ids are recorded in PaymentEvent (unique providerEventId)
 *   inside the same transaction as the order transition, so duplicate or
 *   replayed events cannot create duplicate payments or allocations.
 * - Amount and currency are compared against the stored order record, never
 *   trusted from the webhook payload.
 * - Only authenticated, confirmed payments can transition an order to PAID;
 *   failed, expired, cancelled, underpaid, or unverified events never allocate.
 * - When no real provider is configured the endpoint fails closed (503).
 */
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const providerName = getConfiguredProviderName();
  if (!providerName) {
    logger.warn("WEBHOOK", "Webhook rejected: no payment provider configured", {
      correlationId,
      metadata: { reason: "no_provider_configured" },
    });
    return NextResponse.json(
      { success: false, error: "Payments are not available yet" },
      { status: 503 },
    );
  }

  let rawBody: Buffer;
  try {
    const arrayBuffer = await request.arrayBuffer();
    rawBody = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
  }

  const provider = getPaymentProvider(providerName);
  const headers = readHeaders(request);

  const verification = await provider.verifyWebhookSignature({ rawBody, headers });
  if (!verification.valid) {
    logger.warn("WEBHOOK", "Webhook rejected: invalid or missing signature", {
      correlationId,
      metadata: { reason: verification.reason ?? "invalid_signature" },
    });
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid payload");
    }
  } catch {
    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
  }

  const isNowPayments = providerName === "NOWPAYMENTS";
  const orderId = typeof (isNowPayments ? payload.order_id : payload.orderId) === "string"
    ? String(isNowPayments ? payload.order_id : payload.orderId)
    : null;
  const providerEventId =
    (typeof payload.providerEventId === "string" ? payload.providerEventId : null) ??
    verification.providerEventId ??
    null;
  const providerStatus =
    (typeof (isNowPayments ? payload.payment_status : payload.providerStatus) === "string"
      ? String(isNowPayments ? payload.payment_status : payload.providerStatus)
      : null) ??
    verification.providerStatus ??
    null;
  const rawAmount = isNowPayments ? payload.price_amount : payload.amount;
  const amount = typeof rawAmount === "number" || typeof rawAmount === "string"
    ? Number(rawAmount)
    : null;
  const rawCurrency = isNowPayments ? payload.price_currency : payload.currency;
  const currency = typeof rawCurrency === "string" ? rawCurrency : null;
  const rawTransactionId = isNowPayments ? payload.payment_id : payload.transactionId;
  const transactionId = typeof rawTransactionId === "string" || typeof rawTransactionId === "number"
    ? String(rawTransactionId)
    : null;
  const confirmations =
    typeof payload.confirmations === "number" ? payload.confirmations : null;

  if (!orderId || !providerEventId || !providerStatus) {
    return NextResponse.json(
      { success: false, error: "Missing required fields: orderId, providerEventId, providerStatus" },
      { status: 400 },
    );
  }
  if (isNowPayments && (amount === null || !Number.isFinite(amount) || !currency)) {
    return NextResponse.json({ success: false, error: "NOWPayments IPN is missing the quoted fiat amount or currency" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, traderId: true, status: true, totalAmount: true, currency: true },
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  const expectedAmount = canonicalAmount(order.totalAmount);
  const receivedAmount = amount !== null ? canonicalAmount(amount) : null;
  if (
    amount !== null &&
    (expectedAmount === null || receivedAmount === null || receivedAmount !== expectedAmount)
  ) {
    logger.warn("WEBHOOK", "Amount mismatch", {
      correlationId,
      metadata: { expected: expectedAmount, received: amount, orderId },
    });
    return NextResponse.json({ success: false, error: "Amount mismatch" }, { status: 400 });
  }

  const expectedCurrency = canonicalCurrency(order.currency);
  const receivedCurrency = currency !== null ? canonicalCurrency(currency) : null;
  if (
    currency !== null &&
    (expectedCurrency === null || receivedCurrency === null || receivedCurrency !== expectedCurrency)
  ) {
    return NextResponse.json({ success: false, error: "Currency mismatch" }, { status: 400 });
  }

  const incomingEvent = {
    orderId: order.id,
    providerStatus,
    amount,
    currency,
    transactionId,
  };
  const recordedEvent = await prisma.paymentEvent.findUnique({
    where: { providerEventId },
    select: {
      orderId: true,
      providerStatus: true,
      amount: true,
      currency: true,
      transactionId: true,
      verified: true,
    },
  });
  if (recordedEvent) {
    if (!isSameVerifiedPaymentEvent(recordedEvent, incomingEvent)) {
      return NextResponse.json({ success: false, error: "Payment event identifier has already been used" }, { status: 409 });
    }
    logger.info("WEBHOOK", "Duplicate webhook event ignored", {
      correlationId,
      metadata: { providerEventId, orderId },
    });
    return NextResponse.json({ success: true, duplicate: true }, { status: 200 });
  }

  const paymentEvent = mapProviderStatus(providerStatus, providerName);
  if (!paymentEvent) {
    return NextResponse.json(
      { success: false, error: `Unknown provider status: ${providerStatus}` },
      { status: 400 },
    );
  }

  const currentState = order.status as string;
  if (!isValidTransition(currentState, paymentEvent)) {
    logger.warn("WEBHOOK", "Invalid state transition", {
      correlationId,
      metadata: { currentState, paymentEvent, orderId },
    });
    return NextResponse.json(
      { success: false, error: `Invalid transition from ${currentState} via ${paymentEvent}` },
      { status: 409 },
    );
  }

  const nextState = getNextState(currentState, paymentEvent);
  if (!nextState) {
    return NextResponse.json({ success: false, error: "Could not determine next state" }, { status: 500 });
  }

  let isDuplicate = false;
  try {
    await prisma.$transaction(async (tx) => {
      const inserted = await tx.paymentEvent.createMany({
        data: [{
            orderId: order.id,
            providerEventId,
            providerStatus,
            amount: amount !== null ? new Prisma.Decimal(amount) : null,
            currency: currency ?? null,
            transactionId: transactionId ?? null,
            verified: true,
            processedAt: new Date(),
            metadata: {
              confirmations,
              paymentEvent,
              nextState,
              currentState,
              orderCurrency: order.currency,
            } as Prisma.InputJsonValue,
          }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        isDuplicate = true;
        return;
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: nextState },
      });

      await tx.auditLog.create({
        data: {
          action: nextState === "PAID" ? ("ORDER_PAID" as AuditAction) : ("SYSTEM_EVENT" as AuditAction),
          entityType: "PaymentEvent",
          entityId: providerEventId,
          performedBy: order.traderId,
          details: {
            orderId,
            providerStatus,
            paymentEvent,
            nextState,
            amount,
            currency,
            transactionId,
          } as Prisma.InputJsonValue,
        },
      });
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("WEBHOOK", "Webhook processing failed", {
      correlationId,
      error: { code: "WEBHOOK_FAILED", message: msg },
    });
    return NextResponse.json(
      { success: false, error: "Webhook processing failed" },
      { status: 500 },
    );
  }

  if (isDuplicate) {
    const racedEvent = await prisma.paymentEvent.findUnique({
      where: { providerEventId },
      select: {
        orderId: true,
        providerStatus: true,
        amount: true,
        currency: true,
        transactionId: true,
        verified: true,
      },
    });
    if (!racedEvent || !isSameVerifiedPaymentEvent(racedEvent, incomingEvent)) {
      return NextResponse.json({ success: false, error: "Payment event identifier has already been used" }, { status: 409 });
    }
    logger.info("WEBHOOK", "Duplicate webhook event ignored", {
      correlationId,
      metadata: { providerEventId, orderId },
    });
    return NextResponse.json({ success: true, duplicate: true }, { status: 200 });
  }

  logger.info("WEBHOOK", "Payment state transition applied", {
    correlationId,
    metadata: { orderId, from: currentState, to: nextState, providerEventId },
  });

  return NextResponse.json(
    { success: true, orderId, from: currentState, to: nextState },
    { status: 200 },
  );
}
