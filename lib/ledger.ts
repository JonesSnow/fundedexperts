import {
  PrismaClient,
  Prisma,
  LedgerEntry,
  LedgerEntryType,
  LedgerDirection,
  LedgerEntryStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createLogger, generateCorrelationId } from "./logger";

const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

export interface CreateLedgerEntryInput {
  traderId?: string;
  orderId?: string;
  referenceId: string;
  entryType: LedgerEntryType;
  amount: number | string;
  direction: LedgerDirection;
  currency?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface LedgerEntryCreateSuccess {
  success: true;
  entry: LedgerEntry;
}

export interface LedgerEntryCreateFailure {
  success: false;
  error: string;
  errorCategory: string;
}

export type LedgerEntryCreateResult =
  LedgerEntryCreateSuccess | LedgerEntryCreateFailure;

function parseLedgerAmount(value: number | string): Prisma.Decimal | null {
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const serialized = typeof value === "string" ? value.trim() : String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(serialized)) return null;

  try {
    const amount = new Prisma.Decimal(serialized);
    if (!amount.gt(0) || amount.gte("10000000000000000")) return null;
    return amount;
  } catch {
    return null;
  }
}

function isSameLedgerOperation(
  existing: LedgerEntry,
  input: CreateLedgerEntryInput,
  amount: Prisma.Decimal,
): boolean {
  return existing.referenceId === input.referenceId
    && existing.traderId === (input.traderId ?? null)
    && existing.orderId === (input.orderId ?? null)
    && existing.entryType === input.entryType
    && existing.amount.equals(amount)
    && existing.direction === input.direction
    && existing.currency === (input.currency ?? "USD");
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

function idempotencyConflict(): LedgerEntryCreateFailure {
  return {
    success: false,
    error: "Ledger reference was already used for a different transaction",
    errorCategory: "IDEMPOTENCY_CONFLICT",
  };
}

export interface LedgerEntryQueryInput {
  traderId?: string;
  orderId?: string;
  entryType?: LedgerEntryType;
  status?: LedgerEntryStatus;
  referenceId?: string;
}

export async function createLedgerEntry(
  prisma: PrismaClient,
  input: CreateLedgerEntryInput,
): Promise<LedgerEntryCreateResult> {
  const correlationId = generateCorrelationId();
  const validation = validateLedgerEntryInput(input);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join("; "),
      errorCategory: "VALIDATION_ERROR",
    } as LedgerEntryCreateFailure;
  }

  const amount = parseLedgerAmount(input.amount);
  if (!amount) {
    return {
      success: false,
      error: "amount must be positive, fit the ledger precision, and have at most two decimal places",
      errorCategory: "VALIDATION_ERROR",
    };
  }

  try {
    const { referenceId } = input;
    const existing = await prisma.ledgerEntry.findUnique({
      where: { referenceId },
    });
    if (existing) {
      if (!isSameLedgerOperation(existing, input, amount)) {
        logger.warn("LEDGER", "Ledger idempotency reference conflicts with existing transaction", {
          correlationId,
          actor: { type: "system", id: input.createdBy ?? "unknown" },
          entity: { type: "LedgerEntry", id: existing.id },
          metadata: { referenceId },
        });
        return idempotencyConflict();
      }
      logger.info("LEDGER", "Duplicate ledger entry ignored (idempotency)", {
        correlationId,
        actor: { type: "system", id: input.createdBy ?? "unknown" },
        entity: { type: "LedgerEntry", id: existing.id },
        metadata: { referenceId, existingStatus: existing.status },
      });
      return {
        success: true,
        entry: existing,
      } as LedgerEntryCreateSuccess;
    }

    const entryNumber = `LED-${randomUUID().toUpperCase()}`;
    const entryData: {
      entryNumber: string;
      traderId: string | null;
      orderId: string | null;
      referenceId: string;
      entryType: LedgerEntryType;
      amount: Prisma.Decimal;
      direction: LedgerDirection;
      currency: string;
      status: string;
      metadata?: Record<string, unknown>;
      createdBy?: string | null;
    } = {
      entryNumber,
      traderId: input.traderId ?? null,
      orderId: input.orderId ?? null,
      referenceId,
      entryType: input.entryType,
      amount,
      direction: input.direction,
      currency: input.currency ?? "USD",
      status: "POSTED",
      createdBy: input.createdBy ?? null,
    };
    if (input.metadata !== undefined && input.metadata !== null) {
      entryData.metadata = input.metadata;
    }

    const entry = await prisma.ledgerEntry.create({ data: entryData as unknown as Prisma.LedgerEntryUncheckedCreateInput });

    logger.info("LEDGER", "Ledger entry created", {
      correlationId,
      actor: { type: "system", id: input.createdBy ?? "system" },
      entity: { type: "LedgerEntry", id: entry.id },
      metadata: {
        entryNumber: entry.entryNumber,
        referenceId: entry.referenceId,
        entryType: entry.entryType,
        amount: entry.amount.toString(),
        direction: entry.direction,
        currency: entry.currency,
        orderId: entry.orderId,
        traderId: entry.traderId,
      },
    });

    return { success: true, entry } as LedgerEntryCreateSuccess;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      try {
        const existing = await prisma.ledgerEntry.findUnique({
          where: { referenceId: input.referenceId },
        });
        if (existing) {
          if (isSameLedgerOperation(existing, input, amount)) {
            return { success: true, entry: existing };
          }
          return idempotencyConflict();
        }
      } catch {
        // Keep the generic create failure if the conflict lookup is unavailable.
      }
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("LEDGER", "Ledger entry creation failed", {
      correlationId,
      error: { code: "LEDGER_CREATE_FAILED", message: msg },
    });
    return {
      success: false,
      error: "Failed to create ledger entry",
      errorCategory: "CREATE_FAILED",
    } as LedgerEntryCreateFailure;
  }
}

export async function getLedgerEntries(
  prisma: PrismaClient,
  query: LedgerEntryQueryInput,
  limit = 50,
): Promise<LedgerEntry[]> {
  const where: Record<string, unknown> = {};
  if (query.traderId) where.traderId = query.traderId;
  if (query.orderId) where.orderId = query.orderId;
  if (query.entryType) where.entryType = query.entryType;
  if (query.status) where.status = query.status;
  if (query.referenceId) where.referenceId = query.referenceId;

  return prisma.ledgerEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getLedgerEntryByReference(
  prisma: PrismaClient,
  referenceId: string,
): Promise<LedgerEntry | null> {
  return prisma.ledgerEntry.findUnique({ where: { referenceId } });
}

function validateLedgerEntryInput(input: CreateLedgerEntryInput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (typeof input.referenceId !== "string" || input.referenceId.trim().length === 0) {
    errors.push("referenceId is required");
  }
  if (!input.entryType) {
    errors.push("entryType is required");
  } else if (!Object.values(LedgerEntryType).includes(input.entryType)) {
    errors.push("entryType is not a valid LedgerEntryType");
  }
  if (
    (typeof input.amount !== "number" && typeof input.amount !== "string") ||
    !parseLedgerAmount(input.amount)
  ) {
    errors.push("amount must be positive, fit the ledger precision, and have at most two decimal places");
  }
  if (
    !input.direction ||
    !Object.values(LedgerDirection).includes(input.direction)
  ) {
    errors.push("direction is required (DEBIT or CREDIT)");
  }
  if (
    input.currency !== undefined &&
    (typeof input.currency !== "string" || input.currency.length !== 3)
  ) {
    errors.push("currency must be a 3-letter ISO code");
  }
  if (input.traderId !== undefined && typeof input.traderId !== "string") {
    errors.push("traderId must be a string");
  }
  if (input.orderId !== undefined && typeof input.orderId !== "string") {
    errors.push("orderId must be a string");
  }
  return { valid: errors.length === 0, errors };
}
