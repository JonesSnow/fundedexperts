import { Prisma, type PrismaClient } from "@prisma/client";
import { validateRulesetForPublication } from "./product-domain";

export type ActivationFailureCode =
  | "ORDER_NOT_FOUND"
  | "FORBIDDEN"
  | "ORDER_NOT_PAID"
  | "NO_RULESET_VERSION"
  | "TERMS_REVIEW_REQUIRED"
  | "ACTIVE_ASSIGNMENT_EXISTS"
  | "NO_MATCHING_INVENTORY"
  | "ACTIVATION_CONFLICT"
  | "ACTIVATION_FAILED";

export interface ActivationOrderItem {
  productId: string;
  unitPrice: unknown;
  currency: string;
  productSnapshot: unknown;
}

export interface ActivationOrder {
  id: string;
  traderId: string;
  status: string;
  rulesetVersionId: string | null;
  orderItems: ActivationOrderItem[];
}

export interface ActivationRule {
  id: string;
  name: string;
  ruleType: string;
  disposition: string;
  value: unknown;
  calculation: unknown;
}

export interface ActivationRulesetVersion {
  id: string;
  version: string;
  status: string;
  rules: ActivationRule[];
}

export interface ActivationEvaluation {
  id: string;
  orderId: string | null;
  traderId: string;
  rulesetVersionId: string;
  productStageId: string | null;
  accountId: string | null;
  status: "IN_PROGRESS" | "PASSED" | "FAILED" | "ABANDONED";
  startedAt: Date;
}

export interface ActivationAccount {
  id: string;
  accountNumber: string;
  accountSize: unknown;
  currency: string;
  status: string;
  purpose: string | null;
}

export interface ActivationAssignment {
  id: string;
  traderId: string;
  accountId: string;
  status: string;
  assignedAt: Date;
}

export interface ActivationTransaction {
  getOrder(orderId: string): Promise<ActivationOrder | null>;
  getRulesetVersion(versionId: string): Promise<ActivationRulesetVersion | null>;
  getEvaluationForOrder(orderId: string): Promise<ActivationEvaluation | null>;
  getAccount(accountId: string): Promise<ActivationAccount | null>;
  getAssignment(traderId: string, accountId: string): Promise<ActivationAssignment | null>;
  lockTraderActivation(traderId: string): Promise<void>;
  hasActiveAssignment(traderId: string): Promise<boolean>;
  reserveMatchingAccount(accountSize: number, denominationCurrency: string): Promise<ActivationAccount | null>;
  createEvaluation(data: Omit<ActivationEvaluation, "id" | "startedAt"> & { startedAt: Date; startingBalance: number }): Promise<ActivationEvaluation>;
  createAssignment(data: { traderId: string; accountId: string; status: "ASSIGNED" }): Promise<ActivationAssignment>;
  markAccountInUse(accountId: string): Promise<void>;
  createInitialRuleEvaluations(evaluationId: string, rules: ActivationRule[]): Promise<void>;
  writeActivationAudit(data: { evaluationId: string; traderId: string; orderId: string; productId: string; productStageId: string; rulesetVersionId: string; snapshotSchemaVersion: number; ruleCount: number; accountId: string; assignmentId: string }): Promise<void>;
  writeReviewAudit(data: { orderId: string; traderId: string; code: ActivationFailureCode; reasons: string[] }): Promise<void>;
}

export interface ActivationRepository {
  transaction<T>(orderId: string, work: (tx: ActivationTransaction) => Promise<T>): Promise<T>;
}

export type ActivationResult =
  | { success: true; evaluation: ActivationEvaluation; account: ActivationAccount; assignment: ActivationAssignment; duplicate: boolean }
  | { success: false; code: ActivationFailureCode; error: string; reviewRequired?: boolean };

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

function priceString(value: unknown): string | null {
  if (typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value)) return Number(value).toFixed(2);
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (value && typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    const rendered = value.toString();
    return /^\d+(?:\.\d{1,2})?$/.test(rendered) ? Number(rendered).toFixed(2) : null;
  }
  return null;
}

export interface PurchasedTerms {
  snapshotSchemaVersion: number;
  productId: string;
  productName: string;
  accountSize: number;
  denominationCurrency: string;
  stageId: string;
  stageKey: string;
  rulesetVersionId: string;
  rules: Array<{ id: string; type: string; disposition: string; name: string; value: unknown; calculation: unknown }>;
}

export function resolvePurchasedTerms(order: ActivationOrder, version: ActivationRulesetVersion): { terms: PurchasedTerms | null; errors: string[] } {
  const errors: string[] = [];
  const item = order.orderItems[0];
  if (!item || order.orderItems.length !== 1) return { terms: null, errors: ["Order must contain exactly one product item."] };
  const snapshot = plainRecord(item.productSnapshot);
  if (!snapshot) return { terms: null, errors: ["Order is missing its immutable product snapshot."] };
  const rawSchemaVersion = snapshot.schemaVersion;
  const schemaVersion = typeof rawSchemaVersion === "number" ? rawSchemaVersion : rawSchemaVersion === undefined ? 0 : Number.NaN;
  if (schemaVersion !== 0 && schemaVersion !== 1) errors.push("Order snapshot schema version is unsupported.");
  if (schemaVersion === 1 && (typeof snapshot.capturedAt !== "string" || !Number.isFinite(Date.parse(snapshot.capturedAt)))) errors.push("Versioned order snapshot is missing its capture timestamp.");
  if (snapshot.productId !== item.productId) errors.push("Order snapshot product identity does not match its order item.");
  const accountSize = typeof snapshot.accountSize === "string" ? Number(snapshot.accountSize) : Number.NaN;
  if (!Number.isFinite(accountSize) || accountSize <= 0) errors.push("Order snapshot account size is missing or invalid.");
  const denominationCurrency = typeof snapshot.denominationCurrency === "string" && /^[A-Z]{3}$/.test(snapshot.denominationCurrency)
    ? snapshot.denominationCurrency
    : "";
  if (!denominationCurrency) errors.push("Order snapshot account-denomination currency is missing or invalid.");
  const snapshotPrice = priceString(snapshot.price);
  if (!snapshotPrice || priceString(item.unitPrice) !== snapshotPrice) errors.push("Order item price does not match the purchased product snapshot.");
  if (snapshot.priceCurrency !== item.currency) errors.push("Order item currency does not match the purchased product snapshot.");
  if (typeof snapshot.name !== "string" || !snapshot.name.trim()) errors.push("Order snapshot product name is missing.");
  const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
  const firstStage = stages.map(plainRecord).find((stage) => stage?.order === 1) ?? null;
  if (!firstStage) errors.push("Order snapshot has no first evaluation stage.");
  const stageId = typeof firstStage?.id === "string" ? firstStage.id : "";
  const stageKey = typeof firstStage?.key === "string" ? firstStage.key : "";
  const snapshotVersionId = typeof firstStage?.rulesetVersionId === "string" ? firstStage.rulesetVersionId : "";
  if (!stageId || !stageKey) errors.push("Order snapshot stage identity is incomplete.");
  if (!order.rulesetVersionId || snapshotVersionId !== order.rulesetVersionId || version.id !== order.rulesetVersionId) errors.push("Order, snapshot, and published ruleset version identities do not match.");
  if (version.status !== "PUBLISHED" && version.status !== "ARCHIVED") errors.push("The order references a ruleset version that was never published.");
  if (firstStage?.rulesetVersion !== version.version) errors.push("Snapshot ruleset version label does not match its immutable version ID.");

  const snapshotRules = Array.isArray(firstStage?.rules) ? firstStage.rules.map(plainRecord).filter((rule): rule is Record<string, unknown> => rule !== null) : [];
  const dbRules = [...version.rules].sort((a, b) => a.id.localeCompare(b.id));
  if (dbRules.length === 0) errors.push("Referenced published ruleset version contains no rules.");
  const savedRules = [...snapshotRules].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (savedRules.length !== dbRules.length) errors.push("Snapshot rule count does not match the referenced ruleset version.");
  for (let index = 0; index < Math.min(savedRules.length, dbRules.length); index += 1) {
    const saved = savedRules[index];
    const current = dbRules[index];
    const expected = { id: current.id, name: current.name, type: current.ruleType, disposition: current.disposition, value: current.value, calculation: current.calculation };
    const actual = { id: saved.id, name: saved.name, type: saved.type, disposition: saved.disposition, value: saved.value ?? null, calculation: saved.calculation ?? null };
    if (canonicalJson(actual) !== canonicalJson(expected)) errors.push(`Snapshot rule ${String(saved.id)} does not match its referenced published ruleset version.`);
  }
  if (errors.length > 0 || !firstStage) return { terms: null, errors };

  return {
    terms: {
      snapshotSchemaVersion: schemaVersion,
      productId: item.productId,
      productName: snapshot.name as string,
      accountSize,
      denominationCurrency,
      stageId,
      stageKey,
      rulesetVersionId: version.id,
      rules: dbRules.map((rule) => ({ id: rule.id, type: rule.ruleType, disposition: rule.disposition, name: rule.name, value: rule.value, calculation: rule.calculation })),
    },
    errors: [],
  };
}

export async function activatePaidOrder(
  repository: ActivationRepository,
  input: { orderId: string; traderId: string },
): Promise<ActivationResult> {
  try {
    return await repository.transaction(input.orderId, async (tx) => {
      const order = await tx.getOrder(input.orderId);
      if (!order) return { success: false, code: "ORDER_NOT_FOUND", error: "Order not found" };
      if (order.traderId !== input.traderId) return { success: false, code: "FORBIDDEN", error: "Order does not belong to this customer" };
      if (order.status !== "PAID") return { success: false, code: "ORDER_NOT_PAID", error: "Order must be paid before activation" };
      if (!order.rulesetVersionId) return { success: false, code: "NO_RULESET_VERSION", error: "Paid order has no ruleset version; administrator review is required", reviewRequired: true };

      const version = await tx.getRulesetVersion(order.rulesetVersionId);
      if (!version) {
        await tx.writeReviewAudit({ orderId: order.id, traderId: order.traderId, code: "TERMS_REVIEW_REQUIRED", reasons: ["Referenced ruleset version is missing."] });
        return { success: false, code: "TERMS_REVIEW_REQUIRED", error: "Purchased ruleset version is missing; administrator review is required", reviewRequired: true };
      }
      const resolved = resolvePurchasedTerms(order, version);
      if (!resolved.terms) {
        await tx.writeReviewAudit({ orderId: order.id, traderId: order.traderId, code: "TERMS_REVIEW_REQUIRED", reasons: resolved.errors });
        return { success: false, code: "TERMS_REVIEW_REQUIRED", error: "Purchased terms are inconsistent; administrator review is required", reviewRequired: true };
      }
      const terms = resolved.terms;
      const ruleReadiness = validateRulesetForPublication(version.rules);
      if (ruleReadiness.length > 0) {
        await tx.writeReviewAudit({ orderId: order.id, traderId: order.traderId, code: "TERMS_REVIEW_REQUIRED", reasons: ruleReadiness });
        return { success: false, code: "TERMS_REVIEW_REQUIRED", error: "Purchased rules are unresolved or not verified for enforcement; administrator review is required", reviewRequired: true };
      }

      const existing = await tx.getEvaluationForOrder(order.id);
      if (existing) {
        const account = existing.accountId ? await tx.getAccount(existing.accountId) : null;
        const assignment = existing.accountId ? await tx.getAssignment(order.traderId, existing.accountId) : null;
        const inProgressButUnassigned = existing.status === "IN_PROGRESS" && (!assignment || assignment.status !== "ASSIGNED" || account?.status !== "IN_USE");
        if (existing.traderId !== order.traderId || existing.rulesetVersionId !== terms.rulesetVersionId || existing.productStageId !== terms.stageId || !existing.accountId || !assignment || !account || inProgressButUnassigned) {
          await tx.writeReviewAudit({ orderId: order.id, traderId: order.traderId, code: "TERMS_REVIEW_REQUIRED", reasons: ["Existing evaluation, account, or assignment state does not satisfy the purchased activation invariant."] });
          return { success: false, code: "TERMS_REVIEW_REQUIRED", error: "Existing activation state is incomplete or inconsistent; administrator review is required", reviewRequired: true };
        }
        return { success: true, evaluation: existing, account, assignment, duplicate: true };
      }

      await tx.lockTraderActivation(order.traderId);
      if (await tx.hasActiveAssignment(order.traderId)) return { success: false, code: "ACTIVE_ASSIGNMENT_EXISTS", error: "Customer already has an active account assignment" };
      const account = await tx.reserveMatchingAccount(terms.accountSize, terms.denominationCurrency);
      if (!account) return { success: false, code: "NO_MATCHING_INVENTORY", error: "No available evaluation account matches the purchased size and denomination currency" };

      const startedAt = new Date();
      const evaluation = await tx.createEvaluation({
        orderId: order.id,
        traderId: order.traderId,
        rulesetVersionId: terms.rulesetVersionId,
        productStageId: terms.stageId,
        accountId: account.id,
        status: "IN_PROGRESS",
        startedAt,
        startingBalance: terms.accountSize,
      });
      const assignment = await tx.createAssignment({ traderId: order.traderId, accountId: account.id, status: "ASSIGNED" });
      await tx.markAccountInUse(account.id);
      await tx.createInitialRuleEvaluations(evaluation.id, version.rules);
      await tx.writeActivationAudit({
        evaluationId: evaluation.id,
        traderId: order.traderId,
        orderId: order.id,
        productId: terms.productId,
        productStageId: terms.stageId,
        rulesetVersionId: terms.rulesetVersionId,
        snapshotSchemaVersion: terms.snapshotSchemaVersion,
        ruleCount: version.rules.length,
        accountId: account.id,
        assignmentId: assignment.id,
      });
      return { success: true, evaluation, account, assignment, duplicate: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, code: "ACTIVATION_CONFLICT", error: "Activation is already being completed; retry to retrieve its result" };
    }
    return { success: false, code: "ACTIVATION_FAILED", error: "Activation could not be completed; no success state was recorded" };
  }
}

export function prismaActivationRepository(prisma: PrismaClient): ActivationRepository {
  return {
  async transaction<T>(orderId: string, work: (tx: ActivationTransaction) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (client) => {
        await client.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`order-activation:${orderId}`}))`;
        const adapter: ActivationTransaction = {
          async getOrder(id) {
            return client.order.findUnique({ where: { id }, include: { orderItems: { select: { productId: true, unitPrice: true, currency: true, productSnapshot: true } } } }) as unknown as Promise<ActivationOrder | null>;
          },
          async getRulesetVersion(id) {
            return client.rulesetVersion.findUnique({ where: { id }, include: { rules: true } }) as unknown as Promise<ActivationRulesetVersion | null>;
          },
          async getEvaluationForOrder(id) {
            return client.evaluation.findUnique({ where: { orderId: id } }) as unknown as Promise<ActivationEvaluation | null>;
          },
          async getAccount(id) {
            return client.mT5Account.findUnique({ where: { id }, select: { id: true, accountNumber: true, accountSize: true, currency: true, status: true, purpose: true } }) as unknown as Promise<ActivationAccount | null>;
          },
          async getAssignment(traderId, accountId) {
            return client.accountAssignment.findFirst({ where: { traderId, accountId }, orderBy: { assignedAt: "desc" } }) as unknown as Promise<ActivationAssignment | null>;
          },
          async lockTraderActivation(traderId) {
            await client.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`trader-activation:${traderId}`}))`;
          },
          async hasActiveAssignment(traderId) {
            return Boolean(await client.accountAssignment.findFirst({ where: { traderId, status: "ASSIGNED" }, select: { id: true } }));
          },
          async reserveMatchingAccount(accountSize, denominationCurrency) {
            const rows = await client.$queryRaw<Array<{ id: string; accountNumber: string; accountSize: unknown; currency: string; status: string; purpose: string | null }>>`
              SELECT "id", "accountNumber", "accountSize", "currency", "status", "purpose"
              FROM "MT5Account"
              WHERE "status" = 'AVAILABLE'
                AND "purpose" = 'EVALUATION'::"MT5AccountPurpose"
                AND "accountSize" = ${accountSize}
                AND "currency" = ${denominationCurrency}
              ORDER BY "createdAt" ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            `;
            return rows[0] ?? null;
          },
          async createEvaluation(data) {
            const { startingBalance, ...createData } = data;
            return client.evaluation.create({ data: { ...createData, startingBalance } }) as unknown as Promise<ActivationEvaluation>;
          },
          async createAssignment(data) {
            return client.accountAssignment.create({ data }) as unknown as Promise<ActivationAssignment>;
          },
          async markAccountInUse(accountId) {
            const updated = await client.mT5Account.updateMany({ where: { id: accountId, status: "AVAILABLE" }, data: { status: "IN_USE" } });
            if (updated.count !== 1) throw new Error("Reserved account is no longer available");
          },
          async createInitialRuleEvaluations(evaluationId, rules) {
            if (rules.length === 0) throw new Error("Published ruleset has no rules");
            await client.ruleEvaluation.createMany({ data: rules.map((rule) => ({
              evaluationId,
              ruleId: rule.id,
              result: "WARNING",
              state: "PENDING",
              actualValue: Prisma.JsonNull,
              expectedValue: Prisma.JsonNull,
              details: "PENDING: awaiting the first complete, fresh monitoring snapshot",
            })) });
          },
          async writeActivationAudit(data) {
            await client.auditLog.create({ data: {
              action: "EVALUATION_STARTED",
              entityType: "Evaluation",
              entityId: data.evaluationId,
              performedBy: data.traderId,
              details: {
                orderId: data.orderId,
                productId: data.productId,
                productStageId: data.productStageId,
                rulesetVersionId: data.rulesetVersionId,
                snapshotSchemaVersion: data.snapshotSchemaVersion,
                ruleCount: data.ruleCount,
                accountId: data.accountId,
                assignmentId: data.assignmentId,
              },
            } });
            await client.auditLog.create({ data: {
              action: "ACCOUNT_ASSIGNED",
              entityType: "MT5Account",
              entityId: data.accountId,
              performedBy: data.traderId,
              details: { evaluationId: data.evaluationId, orderId: data.orderId, assignmentId: data.assignmentId },
            } });
          },
          async writeReviewAudit(data) {
            await client.auditLog.create({ data: {
              action: "SYSTEM_EVENT",
              entityType: "Order",
              entityId: data.orderId,
              performedBy: data.traderId,
              details: { event: "ACTIVATION_REQUIRES_REVIEW", code: data.code, reasons: data.reasons },
            } });
          },
        };
        return work(adapter);
      });
    },
  };
}
