/**
 * Order creation remains disabled until a verified payment and checkout flow
 * can complete the customer's purchase. Keep this fail-closed in every
 * environment; a pending order must not reserve a coupon or imply a purchase.
 */
export function isOrderCreationEnabled(): boolean {
  return false;
}
