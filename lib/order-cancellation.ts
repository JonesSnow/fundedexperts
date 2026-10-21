import type { Prisma } from "@prisma/client";

export function cancellableOrderWhere(
  id: string,
  traderId: string,
  isAdmin: boolean,
): Prisma.OrderWhereInput {
  return {
    id,
    ...(!isAdmin ? { traderId } : {}),
    status: { in: ["CREATED", "PENDING_PAYMENT"] },
  };
}
