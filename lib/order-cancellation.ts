import type { Prisma } from "@prisma/client";

export function cancellableOrderWhere(
  id: string,
  traderId: string,
  role: string,
): Prisma.OrderWhereInput {
  return {
    id,
    ...(role === "TRADER" ? { traderId } : {}),
    status: { in: ["CREATED", "PENDING_PAYMENT"] },
  };
}
