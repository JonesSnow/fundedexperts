type JsonRecord = Record<string, unknown>;

export interface PurchasedEvaluationStage {
  id: string;
  key: string;
  displayName: string;
  order: number;
  rulesetVersionId: string;
  rulesetVersion: string;
  rules: JsonRecord[];
}

export interface ProductStageDefinition {
  id: string;
  stageKey: string;
  displayName: string;
  stageOrder: number;
  rulesetVersionId: string;
  rulesetVersion: string;
  rules: Array<{
    id: string;
    name: string;
    ruleType: string;
    disposition: string;
    isRequired?: boolean;
    effectiveDate?: Date | string | null;
    value: unknown;
    calculation: unknown;
  }>;
}

export type EvaluationStageProgression =
  | { kind: "LEGACY_FINAL" }
  | {
      kind: "FINAL";
      productId: string;
      accountSize: string;
      denominationCurrency: string;
      stage: PurchasedEvaluationStage;
    }
  | {
      kind: "NEXT";
      productId: string;
      accountSize: string;
      denominationCurrency: string;
      currentStage: PurchasedEvaluationStage;
      stage: PurchasedEvaluationStage;
    }
  | { kind: "INVALID"; reason: string };

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function invalid(reason: string): EvaluationStageProgression {
  return { kind: "INVALID", reason };
}

export function canonicalAccountSize(value: unknown): string | null {
  const text = typeof value === "string"
    ? value
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : value !== null && typeof value === "object" && "toString" in value && typeof value.toString === "function"
        ? value.toString()
        : "";
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

/**
 * Resolves the next stage from the immutable order snapshot. A malformed or
 * legacy snapshot is rejected so a stage-based purchase cannot be treated as
 * a one-stage challenge by the completion path.
 */
export function resolveEvaluationStageProgression(
  orderItems: unknown,
  currentStageId: string | null,
): EvaluationStageProgression {
  if (!currentStageId) return invalid("Evaluation has no product stage identity.");
  if (!Array.isArray(orderItems) || orderItems.length !== 1) {
    return invalid("Order must contain exactly one product item.");
  }

  const item = record(orderItems[0]);
  const snapshot = record(item?.productSnapshot);
  if (!item || !snapshot) return invalid("Order is missing its immutable product snapshot.");
  if (snapshot.schemaVersion !== 1 && snapshot.schemaVersion !== 2) return invalid("Order snapshot schema version is unsupported for stage progression.");
  if (typeof item.productId !== "string" || snapshot.productId !== item.productId) {
    return invalid("Order snapshot product identity does not match its order item.");
  }

  const accountSize = canonicalAccountSize(snapshot.accountSize);
  if (!accountSize || accountSize === "0.00") return invalid("Order snapshot account size is missing or invalid.");
  const denominationCurrency = typeof snapshot.denominationCurrency === "string" && /^[A-Z]{3}$/.test(snapshot.denominationCurrency)
    ? snapshot.denominationCurrency
    : "";
  if (!denominationCurrency) return invalid("Order snapshot denomination currency is missing or invalid.");

  if (!Array.isArray(snapshot.stages) || snapshot.stages.length === 0) {
    return invalid("Order snapshot has no evaluation stages.");
  }
  const stages: PurchasedEvaluationStage[] = [];
  for (const value of snapshot.stages) {
    const stage = record(value);
    if (
      !stage
      || typeof stage.id !== "string"
      || !stage.id
      || typeof stage.key !== "string"
      || !stage.key
      || typeof stage.displayName !== "string"
      || !stage.displayName.trim()
      || typeof stage.order !== "number"
      || !Number.isInteger(stage.order)
      || stage.order < 1
      || typeof stage.rulesetVersionId !== "string"
      || !stage.rulesetVersionId
      || typeof stage.rulesetVersion !== "string"
      || !stage.rulesetVersion
      || !Array.isArray(stage.rules)
      || stage.rules.length === 0
      || !stage.rules.every((rule) => {
        const itemRule = record(rule);
        return Boolean(itemRule && typeof itemRule.id === "string" && itemRule.id);
      })
    ) return invalid("Order snapshot contains an incomplete evaluation stage.");
    stages.push(stage as unknown as PurchasedEvaluationStage);
  }

  stages.sort((left, right) => left.order - right.order);
  if (stages.some((stage, index) => stage.order !== index + 1)) {
    return invalid("Order snapshot stage order is not contiguous.");
  }
  if (new Set(stages.map((stage) => stage.id)).size !== stages.length) {
    return invalid("Order snapshot contains duplicate stage identities.");
  }

  const currentIndex = stages.findIndex((stage) => stage.id === currentStageId);
  if (currentIndex < 0) return invalid("Current evaluation stage is not part of the purchased product snapshot.");
  const currentStage = stages[currentIndex];
  const nextStage = stages[currentIndex + 1];
  if (!nextStage) return { kind: "FINAL", productId: item.productId, accountSize, denominationCurrency, stage: currentStage };

  return {
    kind: "NEXT",
    productId: item.productId,
    accountSize,
    denominationCurrency,
    currentStage,
    stage: nextStage,
  };
}

/**
 * Builds the same stage shape from the product linked to a later evaluation.
 * Published product stages and ruleset versions are immutable through the
 * application APIs; this is used only after the first evaluation's unique
 * order link has already been consumed.
 */
export function resolveEvaluationStageProgressionFromProduct(
  product: { id: string; accountSize: unknown; denominationCurrency: string | null; stages: ProductStageDefinition[] },
  currentStageId: string | null,
): EvaluationStageProgression {
  const accountSize = canonicalAccountSize(product.accountSize);
  if (!accountSize || accountSize === "0.00" || !product.denominationCurrency || !/^[A-Z]{3}$/.test(product.denominationCurrency)) {
    return invalid("Published product account terms are missing or invalid.");
  }
  const snapshotStages = product.stages.map((stage) => ({
    id: stage.id,
    key: stage.stageKey,
    displayName: stage.displayName,
    order: stage.stageOrder,
    rulesetVersionId: stage.rulesetVersionId,
    rulesetVersion: stage.rulesetVersion,
    rules: stage.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      type: rule.ruleType,
      disposition: rule.disposition,
      ...(rule.isRequired !== undefined ? { isRequired: rule.isRequired } : {}),
      ...(Object.prototype.hasOwnProperty.call(rule, "effectiveDate") ? { effectiveDate: rule.effectiveDate ?? null } : {}),
      value: rule.value,
      calculation: rule.calculation,
    })),
  }));
  return resolveEvaluationStageProgression([{
    productId: product.id,
    productSnapshot: {
      schemaVersion: 1,
      productId: product.id,
      accountSize,
      denominationCurrency: product.denominationCurrency,
      stages: snapshotStages,
    },
  }], currentStageId);
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

/** Confirms that the next stage's rules still match the version in its purchase snapshot. */
export function purchasedStageRulesMatchVersion(
  stage: PurchasedEvaluationStage,
  version: { version: string; status: string; rules: Array<{ id: string; name: string; ruleType: string; disposition: string; isRequired?: boolean; effectiveDate?: Date | string | null; value: unknown; calculation: unknown }> },
): boolean {
  if (stage.rulesetVersion !== version.version || (version.status !== "PUBLISHED" && version.status !== "ARCHIVED")) return false;
  if (version.rules.length === 0 || stage.rules.length !== version.rules.length) return false;

  const savedRules = [...stage.rules].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const currentRules = [...version.rules].sort((left, right) => left.id.localeCompare(right.id));
  return savedRules.every((saved, index) => {
    const current = currentRules[index];
    const savedTerms: JsonRecord = {
      id: saved.id,
      name: saved.name,
      type: saved.type,
      disposition: saved.disposition,
      value: saved.value ?? null,
      calculation: saved.calculation ?? null,
    };
    const currentTerms: JsonRecord = {
      id: current.id,
      name: current.name,
      type: current.ruleType,
      disposition: current.disposition,
      value: current.value,
      calculation: current.calculation,
    };
    if (Object.prototype.hasOwnProperty.call(saved, "isRequired")) {
      savedTerms.isRequired = saved.isRequired;
      currentTerms.isRequired = current.isRequired ?? (current.disposition === "REQUIRED");
    }
    if (Object.prototype.hasOwnProperty.call(saved, "effectiveDate")) {
      savedTerms.effectiveDate = canonicalTimestamp(saved.effectiveDate);
      currentTerms.effectiveDate = canonicalTimestamp(current.effectiveDate);
    }
    return canonicalJson(savedTerms) === canonicalJson(currentTerms);
  });
}

function canonicalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!(value instanceof Date) && typeof value !== "string") return "invalid";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "invalid";
}
