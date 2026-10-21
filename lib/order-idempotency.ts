export interface ExistingOrderRequestShape {
  traderId: string;
  notes: string | null;
  orderItems: Array<{ productId: string; quantity: number }>;
}

export interface OrderRequestIdentity {
  traderId: string;
  productId: string;
  notes?: string;
  couponCode?: string;
}

/** A reused order key is valid only for the same customer-visible request. */
export function isSameOrderRequest(
  existing: ExistingOrderRequestShape,
  request: OrderRequestIdentity,
  existingCouponCodes: string[],
): boolean {
  if (existing.traderId !== request.traderId) return false;
  if ((existing.notes ?? null) !== (request.notes ?? null)) return false;
  if (existing.orderItems.length !== 1) return false;

  const [item] = existing.orderItems;
  if (item.productId !== request.productId || item.quantity !== 1) return false;

  const requestedCoupons = request.couponCode === undefined ? [] : [request.couponCode];
  return existingCouponCodes.length === requestedCoupons.length
    && existingCouponCodes.every((code, index) => code === requestedCoupons[index]);
}
