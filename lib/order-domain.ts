import { buildProductOrderSnapshot, validateProductForPublication, type ProductConfiguration, type ProductRuleType } from "./product-domain";

export type PurchasableProduct = ProductConfiguration & { isActive: boolean };

export type OrderTermsResult =
  | { valid: true; productId: string; price: string; currency: string; accountSize: string; rulesetVersionId: string; productSnapshot: Record<string, unknown> }
  | { valid: false; errors: string[] };

/** Resolves all commercial terms from the server-side catalog record. */
export function resolveOrderTerms(product: PurchasableProduct, capturedAt: Date = new Date(), evaluatorVerifiedRuleTypes: readonly ProductRuleType[] = []): OrderTermsResult {
  const errors: string[] = [];
  if (product.status !== "ACTIVE" || !product.isActive) errors.push("Product is not active.");
  errors.push(...validateProductForPublication(product, evaluatorVerifiedRuleTypes));
  const price = typeof product.price === "string" ? product.price : product.price !== null && product.price !== undefined && typeof product.price === "object" && "toString" in product.price
    ? String(product.price)
    : typeof product.price === "number" ? String(product.price) : "";
  const accountSize = typeof product.accountSize === "string" ? product.accountSize : product.accountSize !== null && product.accountSize !== undefined && typeof product.accountSize === "object" && "toString" in product.accountSize
    ? String(product.accountSize)
    : typeof product.accountSize === "number" ? String(product.accountSize) : "";
  const firstStage = [...product.stages].sort((a, b) => a.stageOrder - b.stageOrder)[0];
  if (!product.id) errors.push("Product identity is missing.");
  if (!price || !Number.isFinite(Number(price)) || Number(price) <= 0) errors.push("Product price is missing or invalid.");
  if (!product.currency) errors.push("Product price currency is missing.");
  if (!accountSize || !Number.isFinite(Number(accountSize)) || Number(accountSize) <= 0) errors.push("Product account size is missing or invalid.");
  if (!firstStage?.rulesetVersion?.id) errors.push("Product has no first-stage ruleset version.");
  if (errors.length > 0 || !firstStage) return { valid: false, errors };
  return {
    valid: true,
    productId: product.id ?? "",
    price,
    currency: product.currency!,
    accountSize,
    rulesetVersionId: firstStage.rulesetVersion.id,
    productSnapshot: buildProductOrderSnapshot(product, capturedAt),
  };
}
