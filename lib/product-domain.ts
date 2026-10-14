/** Pure product and ruleset validation shared by server routes and isolated tests. */

export const PRODUCT_CATEGORIES = ["BEGINNER", "PRO", "EXPERT", "DIRECT_FUNDED"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const EVALUATION_STRUCTURES = ["THREE_STEP", "FOUR_STEP", "TWO_STEP", "ONE_STEP", "DIRECT_FUNDED"] as const;
export type EvaluationStructure = (typeof EVALUATION_STRUCTURES)[number];

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "UNAVAILABLE", "RETIRED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const RULE_DISPOSITIONS = ["REQUIRED", "OPTIONAL", "UNRESOLVED"] as const;
export type RuleDisposition = (typeof RULE_DISPOSITIONS)[number];

export const RULE_TYPES = [
  "PROFIT_TARGET",
  "DRAWDOWN_LIMIT",
  "TRADING_HOURS",
  "MIN_TRADES",
  "MIN_TRADING_DAYS",
  "MAX_DAILY_LOSS",
  "MAX_OPEN_TRADES",
  "MAX_LEVERAGE",
  "TRADING_SESSION",
] as const;
export type ProductRuleType = (typeof RULE_TYPES)[number];

export interface RuleCalculationDefinition {
  metric: string;
  method: string;
  reference: string;
  breachComparison: string;
  evaluationTiming: string;
  requiredInputs: string[];
  timezone?: string;
  resetSchedule?: string;
  includedPnlComponents?: string[];
}

export interface ProductRuleConfiguration {
  id?: string;
  name: string;
  ruleType: string;
  disposition: string;
  value: unknown;
  calculation: unknown;
}

export interface PublishedRulesetConfiguration {
  id: string;
  version: string;
  status: string;
  rules: ProductRuleConfiguration[];
  rulesetId?: string;
}

export interface ProductStageConfiguration {
  id?: string;
  stageKey: string;
  displayName: string;
  stageOrder: number;
  rulesetVersion: PublishedRulesetConfiguration;
}

export interface ProductConfiguration {
  id?: string;
  code: string | null;
  name: string;
  category: string | null;
  evaluationStructure: string | null;
  status?: string;
  accountSize: unknown;
  denominationCurrency: string | null;
  price: unknown;
  currency: string | null;
  stages: ProductStageConfiguration[];
  operatingRulesetVersion?: PublishedRulesetConfiguration | null;
  /** Legacy relation is read-only. Stage mappings are authoritative for evaluations. */
  rulesetId?: string | null;
}

export interface ProductDraftInput {
  name: string;
  code?: string;
  description?: string | null;
  category?: ProductCategory;
  evaluationStructure?: EvaluationStructure;
  accountSize?: string | null;
  price?: string | null;
  currency?: string;
  denominationCurrency?: string;
  displayOrder?: number;
}

export interface RuleDraftInput {
  name: string;
  ruleType: ProductRuleType;
  disposition: RuleDisposition;
  value: unknown;
  calculation: unknown;
  effectiveDate?: string | null;
}

const EXPECTED_STRUCTURE: Record<ProductCategory, EvaluationStructure[]> = {
  BEGINNER: ["THREE_STEP", "FOUR_STEP"],
  PRO: ["TWO_STEP"],
  EXPERT: ["ONE_STEP"],
  DIRECT_FUNDED: ["DIRECT_FUNDED"],
};

const STAGE_COUNT: Record<EvaluationStructure, number> = {
  THREE_STEP: 3,
  FOUR_STEP: 4,
  TWO_STEP: 2,
  ONE_STEP: 1,
  DIRECT_FUNDED: 0,
};

const SAFE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONEY = /^\d{1,16}(?:\.\d{1,2})?$/;

function decimalString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    const rendered = value.toString();
    return rendered === "[object Object]" ? null : rendered;
  }
  return null;
}

function validPositiveMoney(value: unknown): boolean {
  const text = decimalString(value);
  return text !== null && MONEY.test(text) && Number(text) > 0;
}

function validCurrency(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) return false;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: value }).resolvedOptions().currency === value;
  } catch {
    return false;
  }
}

function validDecimalInput(value: unknown): value is string {
  return typeof value === "string" && MONEY.test(value) && Number(value) > 0;
}

export function validateProductDraftInput(input: Record<string, unknown>): {
  valid: boolean;
  errors: Record<string, string>;
  data?: ProductDraftInput;
} {
  const errors: Record<string, string> = {};
  if (typeof input.name !== "string" || input.name.trim().length === 0 || input.name.trim().length > 100) {
    errors.name = "Name is required and must be at most 100 characters.";
  }
  if (input.status !== undefined && input.status !== "DRAFT") errors.status = "New products must be created as drafts.";
  if (input.isActive === true) errors.isActive = "Products cannot be activated during draft creation.";
  if (input.code !== undefined && (typeof input.code !== "string" || !SAFE_CODE.test(input.code))) errors.code = "Code must use lowercase letters, digits, and hyphens.";
  if (input.category !== undefined && !PRODUCT_CATEGORIES.includes(input.category as ProductCategory)) errors.category = "Unsupported product category.";
  if (input.evaluationStructure !== undefined && !EVALUATION_STRUCTURES.includes(input.evaluationStructure as EvaluationStructure)) errors.evaluationStructure = "Unsupported evaluation structure.";
  if (input.accountSize !== undefined && input.accountSize !== null && !validDecimalInput(input.accountSize)) errors.accountSize = "Account size must be a positive decimal string with at most two fractional digits.";
  if (input.price !== undefined && input.price !== null && !validDecimalInput(input.price)) errors.price = "Price must be a positive decimal string with at most two fractional digits.";
  if (input.currency !== undefined && !validCurrency(input.currency)) errors.currency = "Price currency must be a valid ISO 4217 code.";
  if (input.denominationCurrency !== undefined && !validCurrency(input.denominationCurrency)) errors.denominationCurrency = "Account denomination currency must be a valid ISO 4217 code.";
  if (input.description !== undefined && input.description !== null && (typeof input.description !== "string" || input.description.length > 2000)) errors.description = "Description must be at most 2000 characters.";
  if (Object.prototype.hasOwnProperty.call(input, "rulesetId")) errors.rulesetId = "The legacy product ruleset field is read-only; use stage-specific ruleset versions.";
  if (input.displayOrder !== undefined && (typeof input.displayOrder !== "number" || !Number.isInteger(input.displayOrder))) errors.displayOrder = "Display order must be an integer.";

  const category = input.category as ProductCategory | undefined;
  const structure = input.evaluationStructure as EvaluationStructure | undefined;
  if (category && structure && !EXPECTED_STRUCTURE[category].includes(structure)) errors.evaluationStructure = `${category} cannot use ${structure}.`;

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  const data: ProductDraftInput = { name: (input.name as string).trim() };
  if (typeof input.code === "string") data.code = input.code;
  if (input.description === null || typeof input.description === "string") data.description = input.description as string | null;
  if (category) data.category = category;
  if (structure) data.evaluationStructure = structure;
  if (input.accountSize === null || typeof input.accountSize === "string") data.accountSize = input.accountSize as string | null;
  if (input.price === null || typeof input.price === "string") data.price = input.price as string | null;
  if (typeof input.currency === "string") data.currency = input.currency;
  if (typeof input.denominationCurrency === "string") data.denominationCurrency = input.denominationCurrency;
  if (typeof input.displayOrder === "number") data.displayOrder = input.displayOrder;
  return { valid: true, errors, data };
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isPlainRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

export function validateRuleDraftInput(input: Record<string, unknown>): {
  valid: boolean;
  errors: Record<string, string>;
  data?: RuleDraftInput;
} {
  const errors: Record<string, string> = {};
  if (typeof input.name !== "string" || input.name.trim().length === 0 || input.name.trim().length > 100) errors.name = "Rule name is required and must be at most 100 characters.";
  if (typeof input.ruleType !== "string" || !RULE_TYPES.includes(input.ruleType as ProductRuleType)) errors.ruleType = "Unsupported rule type.";
  if (input.disposition !== undefined && (typeof input.disposition !== "string" || !RULE_DISPOSITIONS.includes(input.disposition as RuleDisposition))) errors.disposition = "Disposition must be REQUIRED, OPTIONAL, or UNRESOLVED.";
  if (input.value !== undefined && !isJsonValue(input.value)) errors.value = "Rule value must be valid JSON.";
  if (input.calculation !== undefined && !isJsonValue(input.calculation)) errors.calculation = "Calculation must be valid JSON.";
  if (input.effectiveDate !== undefined && input.effectiveDate !== null && (typeof input.effectiveDate !== "string" || Number.isNaN(Date.parse(input.effectiveDate)))) errors.effectiveDate = "Effective date must be a valid date string.";

  const ruleType = input.ruleType as ProductRuleType;
  const disposition = (input.disposition ?? "UNRESOLVED") as RuleDisposition;
  if (disposition === "OPTIONAL") {
    if (input.value !== undefined && input.value !== null) errors.value = "Optional rules cannot have an active threshold.";
    if (input.calculation !== undefined && input.calculation !== null) errors.calculation = "Optional rules cannot have an active calculation.";
  }
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  const data: RuleDraftInput = {
    name: (input.name as string).trim(),
    ruleType,
    disposition,
    value: input.value ?? null,
    calculation: input.calculation ?? null,
  };
  if (input.effectiveDate === null || typeof input.effectiveDate === "string") data.effectiveDate = input.effectiveDate;
  return { valid: true, errors, data };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateRuleValue(ruleType: ProductRuleType, value: unknown): string | null {
  if (!isPlainRecord(value)) return "Required rule values must be an object with explicit fields.";
  switch (ruleType) {
    case "PROFIT_TARGET":
      return finitePositive(value.target) ? null : "Profit target must be a positive number.";
    case "DRAWDOWN_LIMIT":
      return finitePositive(value.maxDrawdown) || finitePositive(value.maxDrawdownPercent)
        ? null
        : "Drawdown requires a positive maxDrawdown or maxDrawdownPercent.";
    case "MAX_DAILY_LOSS":
      return finitePositive(value.maxLoss) ? null : "Daily loss requires a positive maxLoss.";
    case "MIN_TRADES":
      return typeof value.minTrades === "number" && Number.isInteger(value.minTrades) && value.minTrades >= 0
        ? null
        : "Minimum trades must be a non-negative integer.";
    case "MIN_TRADING_DAYS":
      return typeof value.minTradingDays === "number" && Number.isInteger(value.minTradingDays) && value.minTradingDays >= 0
        ? null
        : "Minimum trading days must be a non-negative integer.";
    case "MAX_OPEN_TRADES":
      return typeof value.maxTrades === "number" && Number.isInteger(value.maxTrades) && value.maxTrades > 0
        ? null
        : "Maximum open trades must be a positive integer.";
    case "MAX_LEVERAGE":
      return finitePositive(value.maxLeverage) ? null : "Maximum leverage must be a positive number.";
    case "TRADING_HOURS": {
      if (typeof value.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime) ||
          typeof value.endTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.endTime) || value.startTime === value.endTime) {
        return "Trading hours require distinct HH:mm startTime and endTime values.";
      }
      if (typeof value.timezone !== "string" || !validTimeZone(value.timezone)) return "Trading hours require a valid IANA timezone.";
      if (!Array.isArray(value.allowedDays) || value.allowedDays.length === 0 || value.allowedDays.some((day) => typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6)) return "Trading hours require explicit allowedDays from 0 (Sunday) to 6 (Saturday).";
      return null;
    }
    case "TRADING_SESSION":
      return Array.isArray(value.allowedSymbols) && value.allowedSymbols.length > 0 && value.allowedSymbols.every((symbol) => typeof symbol === "string" && symbol.trim().length > 0)
        ? null
        : "Trading session requires a non-empty list of explicit allowed symbols; other session rules are unsupported.";
  }
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function validateCalculationDefinition(ruleType: ProductRuleType, value: unknown): string[] {
  const errors: string[] = [];
  if (!isPlainRecord(value)) return ["A calculation definition is required for each required rule."];
  for (const field of ["metric", "method", "reference", "breachComparison", "evaluationTiming"] as const) {
    if (typeof value[field] !== "string" || value[field].trim().length === 0) {
      errors.push(`Calculation definition is missing ${field}.`);
    }
  }
  if (value.schemaVersion !== 1) errors.push("Calculation definition must set schemaVersion to 1.");
  if (!Array.isArray(value.requiredInputs) || value.requiredInputs.length === 0 || value.requiredInputs.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    errors.push("Calculation definition must name at least one required input.");
  }
  if (ruleType === "MAX_DAILY_LOSS") {
    if (typeof value.timezone !== "string" || !validTimeZone(value.timezone)) errors.push("Daily loss calculation requires a valid IANA timezone.");
    if (typeof value.resetTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.resetTime)) errors.push("Daily loss calculation requires an explicit HH:mm resetTime.");
    if (!Array.isArray(value.includedPnlComponents) || value.includedPnlComponents.length === 0 || value.includedPnlComponents.some((component) => !["realizedPnl", "floatingPnl", "commissionCosts", "swapPnl", "otherFees"].includes(String(component)))) errors.push("Daily loss calculation must declare supported included PnL components.");
    if (value.method !== "NET_PNL_COMPONENTS") errors.push("Daily loss calculation method is unsupported.");
    if (!finitePositive(value.maxSnapshotAgeMs)) errors.push("Daily loss calculation requires an explicit positive data freshness limit in milliseconds.");
  }
  if (ruleType === "DRAWDOWN_LIMIT") {
    if (value.method !== "STATIC_STARTING_EQUITY" && value.method !== "TRAILING_PEAK_EQUITY") errors.push("Drawdown calculation must select a supported static or trailing equity model.");
    if (!finitePositive(value.maxSnapshotAgeMs)) errors.push("Drawdown calculation requires an explicit positive data freshness limit in milliseconds.");
    if (value.breachComparison !== "STRICTLY_GREATER_THAN" && value.breachComparison !== "GREATER_THAN_OR_EQUAL") errors.push("Drawdown calculation requires an explicit supported breach comparison.");
  }
  const expectedMethods: Partial<Record<ProductRuleType, string>> = {
    PROFIT_TARGET: "REALIZED_PLUS_FLOATING_PNL",
    MIN_TRADES: "COUNT_DISTINCT_COMPLETED_TRADES",
    MIN_TRADING_DAYS: "COUNT_DISTINCT_COMPLETED_TRADE_DATES",
    MAX_OPEN_TRADES: "COUNT_OPEN_POSITIONS_AND_PENDING_ORDERS",
    MAX_LEVERAGE: "SNAPSHOT_ACCOUNT_LEVERAGE",
    TRADING_HOURS: "EVENT_WITHIN_WEEKLY_WINDOW",
    TRADING_SESSION: "ALLOWED_SYMBOLS",
  };
  const expectedComparisons: Partial<Record<ProductRuleType, string[]>> = {
    PROFIT_TARGET: ["GREATER_THAN_OR_EQUAL"],
    MIN_TRADES: ["GREATER_THAN_OR_EQUAL"],
    MIN_TRADING_DAYS: ["GREATER_THAN_OR_EQUAL"],
    MAX_OPEN_TRADES: ["GREATER_THAN"],
    MAX_LEVERAGE: ["GREATER_THAN"],
    TRADING_HOURS: ["OUTSIDE_CONFIGURED_POLICY"],
    TRADING_SESSION: ["OUTSIDE_CONFIGURED_POLICY"],
  };
  if (expectedMethods[ruleType] && value.method !== expectedMethods[ruleType]) errors.push(`${ruleType} calculation method is unsupported.`);
  if (expectedComparisons[ruleType] && !expectedComparisons[ruleType]!.includes(String(value.breachComparison))) {
    errors.push(`${ruleType} breach comparison policy is unsupported.`);
  }
  if (["PROFIT_TARGET", "MIN_TRADES", "MIN_TRADING_DAYS", "MAX_OPEN_TRADES", "MAX_LEVERAGE", "TRADING_HOURS", "TRADING_SESSION"].includes(ruleType) && !finitePositive(value.maxSnapshotAgeMs)) {
    errors.push(`${ruleType} calculation requires an explicit positive data freshness limit in milliseconds.`);
  }
  if (ruleType === "MIN_TRADING_DAYS" && (typeof value.timezone !== "string" || !validTimeZone(value.timezone))) errors.push("Minimum trading days requires an explicit valid IANA timezone.");
  if (ruleType === "TRADING_HOURS") {
    if (typeof value.timezone !== "string" || !validTimeZone(value.timezone)) errors.push("Trading-hours calculation requires an explicit valid IANA timezone.");
    if (typeof value.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime)) errors.push("Trading-hours calculation requires an explicit HH:mm startTime.");
    if (typeof value.endTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.endTime)) errors.push("Trading-hours calculation requires an explicit HH:mm endTime.");
    if (!Array.isArray(value.allowedDays) || value.allowedDays.length === 0) errors.push("Trading-hours calculation requires explicit weekdays.");
  }
  return errors;
}

// No rule type is activated by default. The current evaluator has known semantic gaps
// in several types and the rest lack isolated freshness/failure-mode verification.

export function validateRulesetForPublication(
  rules: ProductRuleConfiguration[],
  evaluatorVerifiedRuleTypes: readonly ProductRuleType[] = [],
): string[] {
  const errors: string[] = [];
  if (rules.length === 0) return ["A ruleset version must explicitly define at least one rule before publication."];
  if (!rules.some((rule) => rule.disposition === "REQUIRED")) {
    errors.push("A ruleset version must include at least one required rule.");
  }

  for (const [index, rule] of rules.entries()) {
    const label = rule.name?.trim() || `Rule ${index + 1}`;
    if (!RULE_TYPES.includes(rule.ruleType as ProductRuleType)) {
      errors.push(`${label}: unsupported rule type.`);
      continue;
    }
    if (!RULE_DISPOSITIONS.includes(rule.disposition as RuleDisposition)) {
      errors.push(`${label}: required/optional/unresolved disposition must be explicit.`);
      continue;
    }
    if (rule.disposition === "UNRESOLVED") {
      errors.push(`${label}: rule is unresolved.`);
      continue;
    }
    if (rule.disposition === "OPTIONAL") {
      if (rule.value !== null && rule.value !== undefined) errors.push(`${label}: optional rules must not carry an active threshold.`);
      if (rule.calculation !== null && rule.calculation !== undefined) errors.push(`${label}: optional rules must not carry an active calculation.`);
      continue;
    }
    const ruleType = rule.ruleType as ProductRuleType;
    const valueError = validateRuleValue(ruleType, rule.value);
    if (valueError) errors.push(`${label}: ${valueError}`);
    errors.push(...validateCalculationDefinition(ruleType, rule.calculation).map((error) => `${label}: ${error}`));
    if (!evaluatorVerifiedRuleTypes.includes(ruleType)) {
      errors.push(`${label}: evaluator enforcement is not verified; this rule cannot be activated yet.`);
    }
  }

  return errors;
}

export function validateProductForPublication(
  product: ProductConfiguration,
  evaluatorVerifiedRuleTypes: readonly ProductRuleType[] = [],
): string[] {
  const errors: string[] = [];
  if (!product.code || !SAFE_CODE.test(product.code)) errors.push("A stable lowercase product code is required.");
  if (!PRODUCT_CATEGORIES.includes(product.category as ProductCategory)) errors.push("A supported product category is required.");
  if (!EVALUATION_STRUCTURES.includes(product.evaluationStructure as EvaluationStructure)) errors.push("An explicit evaluation structure is required.");
  if (!validPositiveMoney(product.accountSize)) errors.push("A positive account size is required.");
  if (!validCurrency(product.denominationCurrency)) errors.push("A valid account-denomination currency is required.");
  if (!validPositiveMoney(product.price)) errors.push("An approved positive price is required; missing or zero prices are not purchasable.");
  if (!validCurrency(product.currency)) errors.push("A valid price currency is required.");

  const category = product.category as ProductCategory;
  const structure = product.evaluationStructure as EvaluationStructure;
  if (PRODUCT_CATEGORIES.includes(category) && EVALUATION_STRUCTURES.includes(structure) && !EXPECTED_STRUCTURE[category].includes(structure)) {
    errors.push(`${category} products cannot use ${structure} structure.`);
  }

  if (structure === "DIRECT_FUNDED") {
    if (product.stages.length > 0) errors.push("Direct Funded products cannot contain evaluation stages.");
    if (!product.operatingRulesetVersion || product.operatingRulesetVersion.status !== "PUBLISHED") {
      errors.push("Direct Funded products require a distinct published post-activation ruleset.");
    } else {
      if (product.rulesetId && product.operatingRulesetVersion.rulesetId && product.rulesetId !== product.operatingRulesetVersion.rulesetId) {
        errors.push("Legacy Product.rulesetId conflicts with the Direct Funded operating ruleset version.");
      }
      errors.push(...validateRulesetForPublication(product.operatingRulesetVersion.rules, evaluatorVerifiedRuleTypes).map((error) => `Operating rules: ${error}`));
    }
    errors.push("Direct Funded order fulfillment is not implemented; this product cannot be activated.");
    return errors;
  }

  const expectedCount = STAGE_COUNT[structure];
  if (product.stages.length !== expectedCount) errors.push(`${structure} requires exactly ${expectedCount} configured stage(s).`);
  const sortedStages = [...product.stages].sort((left, right) => left.stageOrder - right.stageOrder);
  if (product.rulesetId && sortedStages.some((stage) => stage.rulesetVersion.rulesetId && stage.rulesetVersion.rulesetId !== product.rulesetId)) {
    errors.push("Legacy Product.rulesetId conflicts with stage-specific ruleset versions; resolve the catalog data before publication.");
  }
  sortedStages.forEach((stage, index) => {
    if (stage.stageOrder !== index + 1) errors.push(`Stage order must be contiguous starting at 1 (received ${stage.stageOrder}).`);
    if (!stage.stageKey || !SAFE_CODE.test(stage.stageKey)) errors.push(`Stage ${index + 1} requires a stable lowercase stage key.`);
    if (!stage.displayName?.trim()) errors.push(`Stage ${index + 1} requires a display name.`);
    if (stage.rulesetVersion.status !== "PUBLISHED") errors.push(`Stage ${index + 1} must reference a published ruleset version.`);
    errors.push(...validateRulesetForPublication(stage.rulesetVersion.rules, evaluatorVerifiedRuleTypes).map((error) => `Stage ${index + 1}: ${error}`));
  });
  return errors;
}

export function stageCountForStructure(structure: string | null): number | null {
  return structure && EVALUATION_STRUCTURES.includes(structure as EvaluationStructure)
    ? STAGE_COUNT[structure as EvaluationStructure]
    : null;
}

export function categoryLabel(category: string | null): string {
  switch (category) {
    case "BEGINNER": return "Beginner";
    case "PRO": return "Pro";
    case "EXPERT": return "Expert";
    case "DIRECT_FUNDED": return "Direct Funded";
    default: return "Category awaiting configuration";
  }
}

export function structureLabel(structure: string | null): string {
  const count = stageCountForStructure(structure);
  if (count === 0) return "Direct funded · no evaluation";
  if (count === 1) return "1 stage";
  if (count !== null) return `${count} stages`;
  return "Structure awaiting configuration";
}

export function hasDuplicateProductCode(candidate: string | null, existingCodes: readonly (string | null)[]): boolean {
  return candidate !== null && existingCodes.some((code) => code !== null && code.toLocaleLowerCase("en-US") === candidate.toLocaleLowerCase("en-US"));
}

export function buildProductOrderSnapshot(product: ProductConfiguration, capturedAt: Date = new Date()): Record<string, unknown> {
  return {
    schemaVersion: 1,
    capturedAt: capturedAt.toISOString(),
    productId: product.id ?? null,
    code: product.code,
    name: product.name,
    category: product.category,
    evaluationStructure: product.evaluationStructure,
    accountSize: decimalString(product.accountSize),
    denominationCurrency: product.denominationCurrency,
    price: decimalString(product.price),
    priceCurrency: product.currency,
    stages: product.stages.map((stage) => ({
      id: stage.id ?? null,
      key: stage.stageKey,
      displayName: stage.displayName,
      order: stage.stageOrder,
      rulesetVersionId: stage.rulesetVersion.id,
      rulesetVersion: stage.rulesetVersion.version,
      rules: stage.rulesetVersion.rules.map((rule) => ({
        id: rule.id ?? null,
        name: rule.name,
        type: rule.ruleType,
        disposition: rule.disposition,
        value: rule.value,
        calculation: rule.calculation,
      })),
    })),
    operatingRulesetVersion: product.operatingRulesetVersion
      ? {
          id: product.operatingRulesetVersion.id,
          version: product.operatingRulesetVersion.version,
          rules: product.operatingRulesetVersion.rules.map((rule) => ({
            id: rule.id ?? null,
            name: rule.name,
            type: rule.ruleType,
            disposition: rule.disposition,
            value: rule.value,
            calculation: rule.calculation,
          })),
        }
      : null,
  };
}
