import { OrderStatus } from "@prisma/client";

export interface CreateOrderInput {
  productId: string;
  rulesetVersionId?: string;
  idempotencyKey?: string;
  notes?: string;
}

export function validateCreateOrderInput(input: Record<string, unknown>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  if (!input.productId || typeof input.productId !== "string") {
    errors.productId = "Product ID is required";
  }
  if (
    input.rulesetVersionId !== undefined &&
    typeof input.rulesetVersionId !== "string"
  ) {
    errors.rulesetVersionId = "Ruleset version ID must be a string";
  }
  if (
    input.idempotencyKey !== undefined &&
    typeof input.idempotencyKey !== "string"
  ) {
    errors.idempotencyKey = "Idempotency key must be a string";
  }
  if (input.notes !== undefined && typeof input.notes !== "string") {
    errors.notes = "Notes must be a string";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
