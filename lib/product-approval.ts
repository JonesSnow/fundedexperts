import { createHash } from "node:crypto";
import type { ProductConfiguration, ProductRuleConfiguration, PublishedRulesetConfiguration } from "./product-domain";

type FingerprintProduct = ProductConfiguration & {
  description?: string | null;
};

function decimalText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    const text = value.toString();
    return text === "[object Object]" ? null : text;
  }
  return null;
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (object.constructor?.name === "Decimal" && typeof object.toString === "function") return object.toString();
    return Object.fromEntries(
      Object.entries(object)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function ruleTerms(rule: ProductRuleConfiguration) {
  return {
    id: rule.id ?? null,
    name: rule.name,
    ruleType: rule.ruleType,
    disposition: rule.disposition,
    isRequired: rule.isRequired ?? null,
    effectiveDate: rule.effectiveDate ?? null,
    value: rule.value,
    calculation: rule.calculation,
  };
}

function rulesetTerms(version: PublishedRulesetConfiguration | null | undefined) {
  if (!version) return null;
  return {
    id: version.id,
    version: version.version,
    status: version.status,
    effectiveDate: version.effectiveDate ?? null,
    rulesetId: version.rulesetId ?? null,
    ruleset: version.ruleset ?? null,
    rules: [...version.rules]
      .map(ruleTerms)
      .sort((left, right) => `${left.id ?? ""}:${left.ruleType}:${left.name}`.localeCompare(`${right.id ?? ""}:${right.ruleType}:${right.name}`)),
  };
}

/** Fingerprints the saved customer-facing offer and its attached rule versions. */
export function productTermsFingerprint(product: FingerprintProduct): string {
  const terms = {
    id: product.id ?? null,
    code: product.code,
    name: product.name,
    description: product.description ?? null,
    isActive: product.isActive ?? null,
    ruleset: product.ruleset ?? null,
    category: product.category,
    evaluationStructure: product.evaluationStructure,
    status: product.status ?? null,
    accountSize: decimalText(product.accountSize),
    denominationCurrency: product.denominationCurrency,
    price: decimalText(product.price),
    currency: product.currency,
    legacyRulesetId: product.rulesetId ?? null,
    stages: [...product.stages]
      .sort((left, right) => left.stageOrder - right.stageOrder || left.stageKey.localeCompare(right.stageKey))
      .map((stage) => ({
        id: stage.id ?? null,
        key: stage.stageKey,
        displayName: stage.displayName,
        order: stage.stageOrder,
        rulesetVersion: rulesetTerms(stage.rulesetVersion),
      })),
    operatingRulesetVersion: rulesetTerms(product.operatingRulesetVersion),
  };
  return createHash("sha256").update(JSON.stringify(stableValue(terms))).digest("hex");
}

export function isCurrentProductApproval(
  audit: { performedBy: string | null; details: unknown } | null,
  ownerTraderId: string,
  fingerprint: string,
  productUpdatedAt: Date,
): boolean {
  if (!audit || audit.performedBy !== ownerTraderId || audit.details === null || typeof audit.details !== "object" || Array.isArray(audit.details)) {
    return false;
  }
  const details = audit.details as Record<string, unknown>;
  return details.event === "PRODUCT_TERMS_APPROVED"
    && details.termsFingerprint === fingerprint
    && details.productUpdatedAt === productUpdatedAt.toISOString();
}
