import { PrismaClient, Prisma, LedgerEntryStatus, LedgerDirection, LedgerEntryType } from "@prisma/client";

const prisma = new PrismaClient();

export interface CreateLedgerEntryInput {
  traderId: string;
  orderId: string;
  entryType: LedgerEntryType;
  amount: Prisma.Decimal;
  direction: LedgerDirection;
  currency?: string;
  referenceId: string;
  metadata?: Prisma.InputJsonValue;
  createdBy?: string;
}

export interface CreateLedgerEntryResult {
  success: boolean;
  ledgerEntry?: {
    id: string;
    entryNumber: string;
    status: LedgerEntryStatus;
    amount: Prisma.Decimal;
    direction: LedgerDirection;
    currency: string;
    createdAt: Date;
  };
  error?: string;
}

function generateEntryNumber(): string {
  return `LED-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function createLedgerEntry(input: CreateLedgerEntryInput): Promise<CreateLedgerEntryResult> {
  const { traderId, orderId, entryType, amount, direction, currency = "USD", referenceId, metadata, createdBy } = input;

  try {
    const existing = await prisma.ledgerEntry.findUnique({
      where: { referenceId },
    });

    if (existing) {
      return {
        success: true,
        ledgerEntry: {
          id: existing.id,
          entryNumber: existing.entryNumber,
          status: existing.status,
          amount: existing.amount,
          direction: existing.direction,
          currency: existing.currency,
          createdAt: existing.createdAt,
        },
      };
    }

    const entryNumber = generateEntryNumber();

    const ledgerEntry = await prisma.ledgerEntry.create({
      data: {
        entryNumber,
        traderId,
        orderId,
        entryType,
        amount,
        direction,
        currency,
        referenceId,
        status: "POSTED",
        metadata,
        createdBy,
      },
      select: {
        id: true,
        entryNumber: true,
        status: true,
        amount: true,
        direction: true,
        currency: true,
        createdAt: true,
      },
    });

    return { success: true, ledgerEntry };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Failed to create ledger entry: ${msg}` };
  }
}

export async function getLedgerEntriesForOrder(orderId: string) {
  return prisma.ledgerEntry.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getLedgerEntriesForTrader(traderId: string) {
  return prisma.ledgerEntry.findMany({
    where: { traderId },
    orderBy: { createdAt: "desc" },
  });
}