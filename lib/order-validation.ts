export interface CreateOrderInput {
  productId: string;
  idempotencyKey?: string;
  notes?: string;
  couponCode?: string;
}

export function validateCreateOrderInput(input: Record<string, unknown>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  if (!input.productId || typeof input.productId !== "string") {
    errors.productId = "Product ID is required";
  }
  for (const field of ["price", "currency", "accountSize", "category", "evaluationStructure", "rulesetVersionId", "rules"] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      errors[field] = "This value is resolved from the published product and cannot be supplied by the browser";
    }
  }
  if (
    input.idempotencyKey !== undefined &&
    (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 1 || input.idempotencyKey.length > 128)
  ) {
    errors.idempotencyKey = "Idempotency key must contain 1–128 characters";
  }
  if (input.notes !== undefined && (typeof input.notes !== "string" || input.notes.length > 500)) {
    errors.notes = "Notes must be a string of at most 500 characters";
  }
  if (input.couponCode !== undefined && (typeof input.couponCode !== "string" || input.couponCode.length > 64)) {
    errors.couponCode = "Coupon code must be a string of at most 64 characters";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
