-- Create PaymentEvent table for durable payment event idempotency.
-- Provider event IDs are unique, preventing duplicate processing.
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" TEXT,
    "transactionId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentEvent_providerEventId_key" UNIQUE ("providerEventId"),
    CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PaymentEvent_orderId_idx" ON "PaymentEvent"("orderId");
CREATE INDEX "PaymentEvent_processedAt_idx" ON "PaymentEvent"("processedAt");