export const ACCOUNT_PATHWAYS = [
  {
    id: "beginner",
    name: "Beginner",
    alias: "Beginner",
    structure: "Configured Beginner offers use a three- or four-stage structure only when the active product specifies it.",
    audience: "For newer or developing traders who prefer a staged evaluation.",
    detail: "A product is purchasable only when its exact size, price, and applicable published rules appear in the active catalog.",
  },
  {
    id: "pro",
    name: "Pro",
    alias: "Pro",
    structure: "The product brief describes a two-stage evaluation; phase terms must be configured per offer.",
    audience: "For traders comfortable with a shorter, structured evaluation.",
    detail: "Category and stage structure come from the published product configuration.",
  },
  {
    id: "expert",
    name: "Expert",
    alias: "Expert / Experts",
    structure: "The product brief describes a one-stage evaluation; risk conditions still apply when configured.",
    audience: "For traders who prefer a single evaluation stage.",
    detail: "Availability and all conditions depend on the active product and its stage-specific published rulesets.",
  },
  {
    id: "direct-funded",
    name: "Direct Funded",
    alias: "Direct Funded",
    structure: "The product brief describes a path without an evaluation; operational eligibility and activation are unverified.",
    audience: "For customers considering a direct simulated funded-account pathway.",
    detail: "No active offer, instant allocation, live capital, payout, or withdrawal is implied by this model description.",
  },
] as const;

export type AccountPathwayId = (typeof ACCOUNT_PATHWAYS)[number]["id"];

export interface CatalogProduct {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  evaluationStructure: string;
  status: string;
  accountSize: number | string | null;
  denominationCurrency: string;
  price: number | string | null;
  currency: string;
  ruleset: { name: string } | null;
  stages: ConfiguredProductStage[];
  operatingRulesetVersion: ConfiguredProductStage["rulesetVersion"] | null;
  isActive: boolean;
  displayOrder: number;
}

export interface ConfiguredProductStage {
  id: string;
  stageKey: string;
  displayName: string;
  stageOrder: number;
  rulesetVersion: {
    id: string;
    version: string;
    status: string;
    ruleset: { id: string; name: string };
    rules: ConfiguredRule[];
  };
}

export interface ConfiguredRule {
  id: string;
  name: string;
  ruleType: string;
  value: unknown;
  isRequired: boolean;
  disposition: string;
  calculation: unknown;
  enforcement: {
    status: "SUPPORTED" | "LIMITED" | "UNSUPPORTED";
    details: string;
  };
}

export interface PublicRuleset {
  id: string;
  name: string;
  description: string | null;
  versions: Array<{ id: string; version: string; status: string }>;
}

export type PublicApiFailureCode =
  | "INVALID_IDENTIFIER"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE";

export interface PublicApiFailure {
  success: false;
  code: PublicApiFailureCode;
  error: string;
  correlationId: string;
}

export interface PublicProductsResponse {
  success: true;
  products: CatalogProduct[];
}

export interface PublicRulesetsResponse {
  success: true;
  rulesets: PublicRuleset[];
}

export interface PublicRulesResponse {
  success: true;
  rules: ConfiguredRule[];
}

export interface ProductRules {
  productId: string;
  stages: ConfiguredProductStage[];
  operatingRulesetVersion: ConfiguredProductStage["rulesetVersion"] | null;
  unavailable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isPositiveAmount(value: unknown): value is string | number {
  return (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0)
    || (typeof value === "number" && Number.isFinite(value) && value > 0);
}

function isConfiguredRule(value: unknown): value is ConfiguredRule {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.ruleType === "string"
    && typeof value.isRequired === "boolean"
    && (value.disposition === "REQUIRED" || value.disposition === "OPTIONAL" || value.disposition === "UNRESOLVED")
    && value.isRequired === (value.disposition === "REQUIRED")
    && "value" in value
    && "calculation" in value
    && isRecord(value.enforcement)
    && (value.enforcement.status === "SUPPORTED" || value.enforcement.status === "LIMITED" || value.enforcement.status === "UNSUPPORTED")
    && typeof value.enforcement.details === "string"
    && value.enforcement.details.trim() !== "";
}

function isPublishedRulesetVersion(value: unknown): value is ConfiguredProductStage["rulesetVersion"] {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.version === "string"
    && value.status === "PUBLISHED"
    && isRecord(value.ruleset)
    && typeof value.ruleset.id === "string"
    && typeof value.ruleset.name === "string"
    && Array.isArray(value.rules)
    && value.rules.every(isConfiguredRule);
}

function isConfiguredProductStage(value: unknown): value is ConfiguredProductStage {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.stageKey === "string"
    && typeof value.displayName === "string"
    && typeof value.stageOrder === "number"
    && Number.isFinite(value.stageOrder)
    && isPublishedRulesetVersion(value.rulesetVersion);
}

function hasPublishableRuleDisclosures(rules: ConfiguredRule[]): boolean {
  return rules.every((rule) => {
    if (rule.disposition === "UNRESOLVED") return false;
    if (rule.disposition === "OPTIONAL") {
      return !rule.isRequired && (rule.value === null || rule.value === undefined)
        && (rule.calculation === null || rule.calculation === undefined);
    }
    return rule.disposition === "REQUIRED"
      && rule.isRequired
      && rule.enforcement.status !== "UNSUPPORTED";
  });
}

function isCatalogProduct(value: unknown): value is CatalogProduct {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.code === "string"
    && typeof value.name === "string"
    && isNullableText(value.description)
    && typeof value.category === "string"
    && typeof value.evaluationStructure === "string"
    && value.status === "ACTIVE"
    && isPositiveAmount(value.accountSize)
    && typeof value.denominationCurrency === "string"
    && value.denominationCurrency.trim() !== ""
    && isPositiveAmount(value.price)
    && typeof value.currency === "string"
    && value.currency.trim() !== ""
    && value.category !== "DIRECT_FUNDED"
    && value.evaluationStructure !== "DIRECT_FUNDED"
    && (value.ruleset === null || (isRecord(value.ruleset) && typeof value.ruleset.name === "string"))
    && Array.isArray(value.stages)
    && value.stages.every((stage) => isConfiguredProductStage(stage) && hasPublishableRuleDisclosures(stage.rulesetVersion.rules))
    && (value.operatingRulesetVersion === null || (isPublishedRulesetVersion(value.operatingRulesetVersion) && hasPublishableRuleDisclosures(value.operatingRulesetVersion.rules)))
    && value.isActive === true
    && typeof value.displayOrder === "number"
    && Number.isFinite(value.displayOrder);
}

export function isPublicProductsResponse(value: unknown): value is PublicProductsResponse {
  return isRecord(value)
    && value.success === true
    && Array.isArray(value.products)
    && value.products.every(isCatalogProduct);
}

export function isPublicRulesResponse(value: unknown): value is PublicRulesResponse {
  return isRecord(value)
    && value.success === true
    && Array.isArray(value.rules)
    && value.rules.every(isConfiguredRule);
}

export function pathwayIdForCategory(category: string | null): AccountPathwayId | "other" {
  switch (category) {
    case "BEGINNER": return "beginner";
    case "PRO": return "pro";
    case "EXPERT": return "expert";
    case "DIRECT_FUNDED": return "direct-funded";
    default: return "other";
  }
}

export function pathwayById(id: AccountPathwayId) {
  return ACCOUNT_PATHWAYS.find((pathway) => pathway.id === id)!;
}

export function formatMoney(value: number | string | null, currency: string, maximumFractionDigits = 2): string {
  if (value === null || value === undefined) return "Not published";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not published";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US")} ${currency}`;
  }
}

export function formatAccountSize(value: number | string | null): string {
  if (value === null || value === undefined) return "Not published";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not published";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
}

export function formatRuleValue(value: unknown): string {
  if (value === null || value === undefined) return "Not published";
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return String(value);
  try {
    return JSON.stringify(value, null, 2) ?? "Details unavailable";
  } catch {
    return "Details unavailable";
  }
}

const calculationLabels: Record<string, string> = {
  metric: "Metric",
  method: "Method",
  reference: "Reference point",
  breachComparison: "Breach threshold",
  evaluationTiming: "Check timing",
  requiredInputs: "Data required",
  timezone: "Time zone",
  resetSchedule: "Reset schedule",
  includedPnlComponents: "P&L includes",
};

function formatCalculationValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatCalculationValue).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${calculationLabels[key] ?? key.replace(/([A-Z])/g, " $1")}: ${formatCalculationValue(item)}`)
      .join("; ");
  }
  return value === null || value === undefined ? "Not published" : String(value);
}

export function formatRuleCalculation(value: unknown): string {
  if (value === null || value === undefined) return "Calculation details not published";
  if (typeof value !== "object" || Array.isArray(value)) return formatCalculationValue(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "Calculation details not published";
  return entries
    .map(([key, item]) => `${calculationLabels[key] ?? key.replace(/([A-Z])/g, " $1")}: ${formatCalculationValue(item)}`)
    .join(" · ");
}

export function ruleGroup(ruleType: string): string {
  switch (ruleType) {
    case "PROFIT_TARGET": return "Profit targets";
    case "MAX_DAILY_LOSS": return "Daily loss";
    case "DRAWDOWN_LIMIT": return "Maximum loss and drawdown";
    case "MIN_TRADES": return "Minimum trade count";
    case "MAX_OPEN_TRADES": return "Open trades";
    case "MAX_LEVERAGE": return "Leverage";
    case "TRADING_SESSION": return "Trading sessions";
    case "TRADING_HOURS": return "Trading hours";
    default: return "Other rules";
  }
}

export function structureKey(structure: string | null): string {
  switch (structure) {
    case "THREE_STEP": return "3";
    case "FOUR_STEP": return "4";
    case "TWO_STEP": return "2";
    case "ONE_STEP": return "1";
    case "DIRECT_FUNDED": return "none";
    default: return "unknown";
  }
}

export function configuredRuleFor(
  rules: ConfiguredRule[],
  ruleTypes: string[],
  namePattern?: RegExp,
): ConfiguredRule[] {
  return rules.filter((rule) => ruleTypes.includes(rule.ruleType) || Boolean(namePattern?.test(rule.name)));
}
