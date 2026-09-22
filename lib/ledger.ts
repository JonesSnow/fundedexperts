import {
  PrismaClient,
  Prisma,
  LedgerEntry,
  LedgerEntryType,
  LedgerDirection,
  LedgerEntryStatus,
  AuditAction,
} from "@prisma/client";
import { createLogger, generateCorrelationId } from "./logger";

const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

export interface CreateLedgerEntryInput {
  traderId?: string;
  orderId?: string;
  referenceId: string;
  entryType: LedgerEntryType;
  amount: number;
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

  try {
    const { referenceId } = input;
    const existing = await prisma.ledgerEntry.findUnique({
      where: { referenceId },
    });
    if (existing) {
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

    const entryNumber = `LED-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const entryData: {
      entryNumber: string;
      traderId: string | null;
      orderId: string | null;
      referenceId: string;
      entryType: LedgerEntryType;
      amount: number;
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
      amount: input.amount,
      direction: input.direction,
      currency: input.currency ?? "USD",
      status: "POSTED",
      createdBy: input.createdBy ?? null,
    };
    if (input.metadata !== undefined && input.metadata !== null) {
      entryData.metadata = input.metadata;
    }

    const entry = await prisma.ledgerEntry.create({ data: entryData as unknown as Prisma.LedgerEntryCreateInput });

    logger.info("LEDGER", "Ledger entry created", {
      correlationId,
      actor: { type: "system", id: input.createdBy ?? "system" },
      entity: { type: "LedgerEntry", id: entry.id },
      metadata: {
        entryNumber: entry.entryNumber,
        referenceId: entry.referenceId,
        entryType: entry.entryType,
        amount: entry.amount,
        direction: entry.direction,
        currency: entry.currency,
        orderId: entry.orderId,
        traderId: entry.traderId,
      },
    });

    return { success: true, entry } as LedgerEntryCreateSuccess;
  } catch (error) {
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
  if (!input.referenceId || typeof input.referenceId !== "string") {
    errors.push("referenceId is required");
  }
  if (!input.entryType) {
    errors.push("entryType is required");
  } else if (!Object.values(LedgerEntryType).includes(input.entryType)) {
    errors.push("entryType is not a valid LedgerEntryType");
  }
  if (
    input.amount === undefined ||
    typeof input.amount !== "number" ||
    input.amount <= 0 ||
    !Number.isFinite(input.amount)
  ) {
    errors.push("amount must be a positive number");
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
