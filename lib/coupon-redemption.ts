import type { Prisma } from "@prisma/client";

export function redeemableCouponWhere(
  coupon: {
    id: string;
    discountPercent: number;
    totalUsageLimit: number | null;
  },
  now: Date,
): Prisma.CouponWhereInput {
  return {
    id: coupon.id,
    isActive: true,
    discountPercent: coupon.discountPercent,
    ...(coupon.totalUsageLimit === null
      ? { totalUsageLimit: null }
      : {
          totalUsageLimit: coupon.totalUsageLimit,
          usedCount: { lt: coupon.totalUsageLimit },
        }),
    AND: [{
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    }],
  };
}
