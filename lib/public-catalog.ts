import { Prisma } from "@prisma/client";
import { getRuleCapability } from "@/lib/rule-capabilities";
import {
  validateProductForPublication,
} from "@/lib/product-domain";
import type {
  CatalogProduct,
  ConfiguredRule,
  PublicApiFailure,
  PublicApiFailureCode,
  PublicRuleset,
} from "@/lib/product-experience";

export const PUBLIC_PRODUCT_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  category: true,
  evaluationStructure: true,
  status: true,
  accountSize: true,
  denominationCurrency: true,
  price: true,
  currency: true,
  displayOrder: true,
  isActive: true,
  stages: {
    orderBy: { stageOrder: "asc" },
    select: {
      id: true,
      stageKey: true,
      displayName: true,
      stageOrder: true,
      rulesetVersion: {
        select: {
          id: true,
          version: true,
          status: true,
          isActive: true,
          ruleset: { select: { id: true, name: true, description: true, isActive: true } },
          rules: {
            select: {
              id: true,
              name: true,
              ruleType: true,
              value: true,
              isRequired: true,
              disposition: true,
              calculation: true,
            },
          },
        },
      },
    },
  },
  operatingRulesetVersion: {
    select: {
      id: true,
      version: true,
      status: true,
      isActive: true,
      ruleset: { select: { id: true, name: true, description: true, isActive: true } },
      rules: {
        select: {
          id: true,
          name: true,
          ruleType: true,
          value: true,
          isRequired: true,
          disposition: true,
          calculation: true,
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

export type PublicProductRecord = Prisma.ProductGetPayload<{
  select: typeof PUBLIC_PRODUCT_SELECT;
}>;

export const PUBLIC_PRODUCT_WHERE: Prisma.ProductWhereInput = {
  isActive: true,
  status: "ACTIVE",
  code: { not: null },
  category: { not: null },
  evaluationStructure: { not: null },
  denominationCurrency: { not: null },
  accountSize: { not: null },
  price: { not: null },
};

export function approvedPublicProducts(products: readonly PublicProductRecord[]): PublicProductRecord[] {
  return products.filter((product) => (
    product.isActive
    && product.status === "ACTIVE"
    && product.code !== null
    && product.category !== null
    && product.evaluationStructure !== null
    && product.denominationCurrency !== null
    && product.accountSize !== null
    && product.price !== null
    && product.evaluationStructure !== "DIRECT_FUNDED"
    && product.stages.every((stage) => (
      stage.rulesetVersion.status === "PUBLISHED"
      && stage.rulesetVersion.isActive
      && stage.rulesetVersion.ruleset.isActive
    ))
    && validateProductForPublication(product).length === 0
  ));
}

function requiredString(value: string | null, field: string): string {
  if (value === null || value.trim() === "") {
    throw new Error(`Public product is missing ${field}`);
  }
  return value;
}

export function serializePublicProduct(product: PublicProductRecord): CatalogProduct {
  return {
    id: product.id,
    code: requiredString(product.code, "code"),
    name: product.name,
    description: product.description,
    category: requiredString(product.category, "category"),
    evaluationStructure: requiredString(product.evaluationStructure, "evaluation structure"),
    status: product.status,
    accountSize: product.accountSize?.toString() ?? null,
    denominationCurrency: requiredString(product.denominationCurrency, "denomination currency"),
    price: product.price?.toString() ?? null,
    currency: product.currency,
    displayOrder: product.displayOrder,
    isActive: product.isActive,
    ruleset: null,
    stages: product.stages.map((stage) => ({
      id: stage.id,
      stageKey: stage.stageKey,
      displayName: stage.displayName,
      stageOrder: stage.stageOrder,
      rulesetVersion: {
        id: stage.rulesetVersion.id,
        version: stage.rulesetVersion.version,
        status: stage.rulesetVersion.status,
        ruleset: {
          id: stage.rulesetVersion.ruleset.id,
          name: stage.rulesetVersion.ruleset.name,
        },
        rules: stage.rulesetVersion.rules.map(serializePublicRule),
      },
    })),
    operatingRulesetVersion: product.operatingRulesetVersion ? {
      id: product.operatingRulesetVersion.id,
      version: product.operatingRulesetVersion.version,
      status: product.operatingRulesetVersion.status,
      ruleset: {
        id: product.operatingRulesetVersion.ruleset.id,
        name: product.operatingRulesetVersion.ruleset.name,
      },
      rules: product.operatingRulesetVersion.rules.map(serializePublicRule),
    } : null,
  };
}

export function serializePublicRule(rule: PublicProductRecord["stages"][number]["rulesetVersion"]["rules"][number]): ConfiguredRule {
  const capability = getRuleCapability(rule.ruleType);
  return {
    id: rule.id,
    name: rule.name,
    ruleType: rule.ruleType,
    value: rule.value,
    isRequired: rule.isRequired,
    disposition: rule.disposition,
    calculation: rule.calculation,
    enforcement: {
      status: capability?.status ?? "UNSUPPORTED",
      details: capability?.reason ?? "No evaluator capability is registered for this rule type.",
    },
  };
}

export function publicRulesetsForProducts(
  products: readonly PublicProductRecord[],
): PublicRuleset[] {
  const byRulesetId = new Map<string, PublicRuleset>();
  for (const product of products) {
    for (const stage of product.stages) {
      const ruleset = stage.rulesetVersion.ruleset;
      const result = byRulesetId.get(ruleset.id) ?? {
        id: ruleset.id,
        name: ruleset.name,
        description: ruleset.description,
        versions: [],
      };
      if (!result.versions.some((version) => version.id === stage.rulesetVersion.id)) {
        result.versions.push({
          id: stage.rulesetVersion.id,
          version: stage.rulesetVersion.version,
          status: stage.rulesetVersion.status,
        });
      }
      byRulesetId.set(ruleset.id, result);
    }
  }
  return [...byRulesetId.values()]
    .map((ruleset) => ({
      ...ruleset,
      versions: ruleset.versions.sort((left, right) => left.version.localeCompare(right.version)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function publicRulesForVersion(
  products: readonly PublicProductRecord[],
  rulesetId: string,
  version: string,
): ConfiguredRule[] | null {
  for (const product of products) {
    for (const stage of product.stages) {
      const published = stage.rulesetVersion;
      if (published.ruleset.id === rulesetId && published.version === version) {
        return published.rules.map(serializePublicRule);
      }
    }
  }
  return null;
}

export function publicApiFailure(
  code: PublicApiFailureCode,
  error: string,
  correlationId: string,
): PublicApiFailure {
  return { success: false, code, error, correlationId };
}

export function safePrismaErrorCode(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021") return "SCHEMA_TABLE_MISSING";
    if (error.code === "P2022") return "SCHEMA_COLUMN_MISSING";
    return `PRISMA_${error.code}`;
  }
  if (error instanceof Prisma.PrismaClientValidationError) return "PRISMA_QUERY_INVALID";
  if (error instanceof Prisma.PrismaClientInitializationError) {
    switch (error.errorCode) {
      case "P1000": return "DATABASE_AUTHENTICATION_REJECTED";
      case "P1001": return "DATABASE_UNREACHABLE";
      case "P1002": return "DATABASE_TIMEOUT";
      case "P1003": return "DATABASE_NOT_FOUND";
      default: return "DATABASE_INITIALIZATION";
    }
  }
  if (error instanceof TypeError) return "RESPONSE_SERIALIZATION_FAILED";
  return "UNEXPECTED";
}

export function safePrismaErrorTable(error: unknown): string | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2021") {
    return undefined;
  }

  const table = error.meta?.table;
  if (
    typeof table !== "string"
    || table.length > 128
    || !/^(?:"?[A-Za-z_][A-Za-z0-9_$]*"?\.)?"?[A-Za-z_][A-Za-z0-9_$]*"?$/.test(table)
  ) {
    return undefined;
  }
  return table;
}

export function isValidPublicRulesetIdentifier(id: string, version: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    && /^[A-Za-z0-9._-]{1,64}$/.test(version);
}

export function publicApiStatus(code: PublicApiFailureCode): number {
  switch (code) {
    case "INVALID_IDENTIFIER": return 400;
    case "NOT_FOUND": return 404;
    case "RATE_LIMITED": return 429;
    case "SERVICE_UNAVAILABLE": return 503;
  }
}
