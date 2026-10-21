import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { buildEvaluationPassedMessage } from "../lib/email/templates/evaluation-passed";
import { isRuleInitializationComplete } from "../lib/evaluation-rule-initialization";
import { releaseAccount } from "../lib/release";
import {
  purchasedStageRulesMatchVersion,
  resolveEvaluationStageProgression,
  resolveEvaluationStageProgressionFromProduct,
} from "../lib/evaluation-stage-progression";

const stageRules = [
  {
    id: "stage-2-rule",
    name: "Stage two target",
    type: "PROFIT_TARGET",
    disposition: "REQUIRED",
    value: { targetPercent: 8 },
    calculation: { schemaVersion: 1, method: "CUMULATIVE_PNL_PERCENT" },
  },
];

const firstStageRules = [{
  id: "stage-1-rule",
  name: "Stage one target",
  type: "PROFIT_TARGET",
  disposition: "REQUIRED",
  value: { targetPercent: 10 },
  calculation: { schemaVersion: 1, method: "CUMULATIVE_PNL_PERCENT" },
}];

const productSnapshot = {
  schemaVersion: 1,
  productId: "product-1",
  accountSize: "25000.00",
  denominationCurrency: "USD",
  stages: [
    {
      id: "stage-1",
      key: "phase-one",
      displayName: "Phase One",
      order: 1,
      rulesetVersionId: "version-1",
      rulesetVersion: "1.0",
      rules: firstStageRules,
    },
    {
      id: "stage-2",
      key: "phase-two",
      displayName: "Phase Two",
      order: 2,
      rulesetVersionId: "version-2",
      rulesetVersion: "2.0",
      rules: stageRules,
    },
  ],
};

const orderItems = [{ productId: "product-1", productSnapshot }];

test("next-stage allocation excludes inventory without encrypted credentials", () => {
  const source = readFileSync(new URL("../lib/release.ts", import.meta.url), "utf8");
  const start = source.indexOf('nextAccount = await tx.$queryRaw');
  const end = source.indexOf('if (nextAccount.length === 0)', start);
  const selection = source.slice(start, end);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(selection, /"credentials" IS NOT NULL/);
  assert.match(selection, /BTRIM\("credentials"\) <> ''/);
  assert.match(selection, /FOR UPDATE SKIP LOCKED/);
});

const nextRulesetVersion = {
  id: "version-2",
  version: "2.0",
  status: "PUBLISHED",
  rules: [{
    id: "stage-2-rule",
    name: "Stage two target",
    ruleType: "PROFIT_TARGET",
    disposition: "REQUIRED",
    value: { targetPercent: 8 },
    calculation: { schemaVersion: 1, method: "CUMULATIVE_PNL_PERCENT" },
  }],
};

test("purchased stage progression selects the next immutable stage and account terms", () => {
  const result = resolveEvaluationStageProgression(orderItems, "stage-1");
  assert.equal(result.kind, "NEXT");
  if (result.kind !== "NEXT") return;
  assert.equal(result.productId, "product-1");
  assert.equal(result.accountSize, "25000.00");
  assert.equal(result.denominationCurrency, "USD");
  assert.equal(result.stage.id, "stage-2");
  assert.equal(result.stage.rulesetVersionId, "version-2");
});

test("purchased stage progression treats the last purchased stage as final", () => {
  const result = resolveEvaluationStageProgression(orderItems, "stage-2");
  assert.equal(result.kind, "FINAL");
  if (result.kind === "FINAL") {
    assert.equal(result.productId, "product-1");
    assert.equal(result.stage.id, "stage-2");
  }
});

test("purchased stage progression fails closed for missing or inconsistent snapshots", () => {
  assert.equal(resolveEvaluationStageProgression([], "stage-1").kind, "INVALID");
  assert.equal(resolveEvaluationStageProgression(orderItems, "unlisted-stage").kind, "INVALID");
  assert.equal(resolveEvaluationStageProgression([{ productId: "another-product", productSnapshot }], "stage-1").kind, "INVALID");
  assert.equal(resolveEvaluationStageProgression([{ productId: "product-1", productSnapshot: { ...productSnapshot, schemaVersion: 0 } }], "stage-1").kind, "INVALID");
});

test("next stage rules must still match the published purchased version", () => {
  const result = resolveEvaluationStageProgression(orderItems, "stage-1");
  assert.equal(result.kind, "NEXT");
  if (result.kind !== "NEXT") return;
  assert.equal(purchasedStageRulesMatchVersion(result.stage, nextRulesetVersion), true);
  assert.equal(purchasedStageRulesMatchVersion(result.stage, { ...nextRulesetVersion, status: "DRAFT" }), false);
  assert.equal(purchasedStageRulesMatchVersion(result.stage, { ...nextRulesetVersion, rules: [] }), false);
  assert.equal(purchasedStageRulesMatchVersion(result.stage, { ...nextRulesetVersion, version: "other" }), false);
});

test("version 2 progression checks requiredness and effective dates against the purchased rules", () => {
  const version2Snapshot = {
    ...productSnapshot,
    schemaVersion: 2,
    stages: productSnapshot.stages.map((stage) => ({
      ...stage,
      rules: stage.rules.map((rule) => ({ ...rule, isRequired: true, effectiveDate: "2026-01-01T00:00:00.000Z" })),
    })),
  };
  const result = resolveEvaluationStageProgression([{ productId: "product-1", productSnapshot: version2Snapshot }], "stage-1");
  assert.equal(result.kind, "NEXT");
  if (result.kind !== "NEXT") return;

  const matchingVersion = {
    ...nextRulesetVersion,
    rules: nextRulesetVersion.rules.map((rule) => ({ ...rule, isRequired: true, effectiveDate: new Date("2026-01-01T00:00:00.000Z") })),
  };
  assert.equal(purchasedStageRulesMatchVersion(result.stage, matchingVersion), true);
  assert.equal(purchasedStageRulesMatchVersion(result.stage, {
    ...matchingVersion,
    rules: matchingVersion.rules.map((rule) => ({ ...rule, effectiveDate: new Date("2026-02-01T00:00:00.000Z") })),
  }), false);
  assert.equal(purchasedStageRulesMatchVersion(result.stage, {
    ...matchingVersion,
    rules: matchingVersion.rules.map((rule) => ({ ...rule, isRequired: false })),
  }), false);
});

test("current stage rules match their immutable published snapshot", () => {
  const firstStageOnlyOrderItems = [{
    productId: "product-1",
    productSnapshot: { ...productSnapshot, stages: [productSnapshot.stages[0]] },
  }];
  const currentStage = resolveEvaluationStageProgression(firstStageOnlyOrderItems, "stage-1");
  assert.equal(currentStage.kind, "FINAL");
  if (currentStage.kind !== "FINAL") return;
  assert.equal(purchasedStageRulesMatchVersion(currentStage.stage, {
    version: "1.0",
    status: "PUBLISHED",
    rules: [{
      id: "stage-1-rule",
      name: "Stage one target",
      ruleType: "PROFIT_TARGET",
      disposition: "REQUIRED",
      value: { targetPercent: 10 },
      calculation: { schemaVersion: 1, method: "CUMULATIVE_PNL_PERCENT" },
    }],
  }), true);
});

test("later-stage product references retain the published stage chain after the unique order link is used", () => {
  const product = {
    id: "product-1",
    accountSize: "25000.00",
    denominationCurrency: "USD",
    stages: [
      {
        id: "stage-1",
        stageKey: "phase-one",
        displayName: "Phase One",
        stageOrder: 1,
        rulesetVersionId: "version-1",
        rulesetVersion: "1.0",
        rules: [{ id: "stage-1-rule", name: "Stage one target", ruleType: "PROFIT_TARGET", disposition: "REQUIRED", value: { targetPercent: 10 }, calculation: { schemaVersion: 1, method: "CUMULATIVE_PNL_PERCENT" } }],
      },
      {
        id: "stage-2",
        stageKey: "phase-two",
        displayName: "Phase Two",
        stageOrder: 2,
        rulesetVersionId: "version-2",
        rulesetVersion: "2.0",
        rules: nextRulesetVersion.rules,
      },
    ],
  };
  const progression = resolveEvaluationStageProgressionFromProduct(product, "stage-1");
  assert.equal(progression.kind, "NEXT");
  if (progression.kind === "NEXT") assert.equal(progression.stage.id, "stage-2");
});

function releaseFixture(withNextAccount = true, finalStage = false, laterStage = false) {
  const writes: string[] = [];
  const currentAssignment = {
    id: "assignment-current",
    traderId: "trader-1",
    accountId: "account-current",
    status: "ASSIGNED",
    assignedAt: new Date("2026-10-01T00:00:00.000Z"),
    trader: null,
    account: { id: "account-current", accountNumber: "DEMO-CURRENT", accountSize: "25000.00", currency: "USD", purpose: "EVALUATION" },
  };
  const nextAccount = { id: "account-next", accountNumber: "DEMO-NEXT" };
  const evaluation: Record<string, unknown> = {
    id: "evaluation-current",
    traderId: "trader-1",
    orderId: laterStage ? null : "order-1",
    productId: "product-1",
    productStageId: finalStage ? "stage-2" : "stage-1",
    rulesetVersionId: finalStage ? "version-2" : "version-1",
    accountId: "account-current",
    startingBalance: "25000.00",
    totalPnl: "2000.00",
    rulesetVersion: finalStage ? {
      ...nextRulesetVersion,
      ruleset: { name: "Two stage evaluation" },
    } : {
      version: "1.0",
      status: "PUBLISHED",
      rules: [{
        id: "stage-1-rule",
        name: "Stage one target",
        ruleType: "PROFIT_TARGET",
        disposition: "REQUIRED",
        value: { targetPercent: 10 },
        calculation: { schemaVersion: 1, method: "CUMULATIVE_PNL_PERCENT" },
      }],
      ruleset: { name: "Two stage evaluation" },
    },
    productStage: finalStage
      ? { id: "stage-2", productId: "product-1", stageOrder: 2, rulesetVersionId: "version-2" }
      : { id: "stage-1", productId: "product-1", stageOrder: 1, rulesetVersionId: "version-1" },
    order: laterStage ? null : { orderItems },
    status: "IN_PROGRESS",
  };

  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes('FROM "MT5Account"')) return withNextAccount ? [nextAccount] : [];
      return [];
    },
    accountAssignment: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.accountId === "account-current") return currentAssignment;
        writes.push("checked-other-assignment");
        return null;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(`returned-current-assignment:${String(data.status)}`);
        return { ...currentAssignment, ...data, trader: null };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push("created-next-assignment");
        return { id: "assignment-next", assignedAt: new Date(), ...data };
      },
    },
    evaluation: {
      findFirst: async () => evaluation,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(`passed-current-evaluation:${String(data.status)}`);
        Object.assign(evaluation, data);
      },
      findUnique: async () => evaluation,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push("created-next-evaluation");
        return { id: "evaluation-next", ...data };
      },
    },
    rulesetVersion: { findUnique: async () => nextRulesetVersion },
    product: {
      findUnique: async () => ({
        id: "product-1",
        accountSize: "25000.00",
        denominationCurrency: "USD",
        stages: [
          {
            id: "stage-1",
            stageKey: "phase-one",
            displayName: "Phase One",
            stageOrder: 1,
            rulesetVersionId: "version-1",
            rulesetVersion: {
              version: "1.0",
              rules: [{ id: "stage-1-rule", name: "Stage one target", ruleType: "PROFIT_TARGET", disposition: "REQUIRED", value: { targetPercent: 10 }, calculation: { schemaVersion: 1, method: "CUMULATIVE_PNL_PERCENT" } }],
            },
          },
          {
            id: "stage-2",
            stageKey: "phase-two",
            displayName: "Phase Two",
            stageOrder: 2,
            rulesetVersionId: "version-2",
            rulesetVersion: { version: "2.0", rules: nextRulesetVersion.rules },
          },
        ],
      }),
    },
    mT5Account: {
      updateMany: async () => {
        writes.push("reserved-next-account");
        return { count: withNextAccount ? 1 : 0 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(`released-current-account:${String(data.status)}`);
        return { id: "account-current", accountNumber: "DEMO-CURRENT", ...data };
      },
    },
    ruleEvaluation: { createMany: async ({ data }: { data: unknown[] }) => { writes.push(`initialized-next-rules:${data.length}`); } },
    fundedAccount: {
      findUnique: async () => null,
      create: async () => { writes.push("created-funded-account"); return { id: "funded-account-1" }; },
    },
    auditLog: { create: async () => { writes.push("wrote-audit"); } },
  };

  const prisma = {
    $transaction: async (work: (client: unknown) => Promise<unknown>) => work(tx),
  } as unknown as PrismaClient;
  return { prisma, writes };
}

test("passing a non-final stage atomically assigns the next stage without creating a funded account", async () => {
  const { prisma, writes } = releaseFixture();
  const result = await releaseAccount(prisma, {
    traderId: "trader-1",
    accountId: "account-current",
    reason: "EVALUATION_COMPLETED",
  });

  assert.equal(result.success, true, result.success ? undefined : result.error);
  if (!result.success) return;
  assert.equal(result.stageAdvanced, true);
  assert.equal(result.nextEvaluationId, "evaluation-next");
  assert.equal(result.fundedAccount, null);
  assert.ok(writes.includes("created-next-evaluation"));
  assert.ok(writes.includes("created-next-assignment"));
  assert.ok(writes.includes("initialized-next-rules:1"));
  assert.ok(writes.includes("released-current-account:AVAILABLE"));
  assert.ok(!writes.includes("created-funded-account"));
  assert.ok(writes.indexOf("returned-current-assignment:RETURNED") < writes.indexOf("created-next-assignment"));
});

test("later-stage progression continues from the published product after the order link is consumed", async () => {
  const { prisma, writes } = releaseFixture(true, false, true);
  const result = await releaseAccount(prisma, {
    traderId: "trader-1",
    accountId: "account-current",
    reason: "EVALUATION_COMPLETED",
  });

  assert.equal(result.success, true, result.success ? undefined : result.error);
  if (!result.success) return;
  assert.equal(result.stageAdvanced, true);
  assert.equal(result.nextEvaluationId, "evaluation-next");
  assert.ok(writes.includes("created-next-evaluation"));
  assert.ok(!writes.includes("created-funded-account"));
});

test("passing a non-final stage does not mark it complete when matching inventory is unavailable", async () => {
  const { prisma, writes } = releaseFixture(false);
  const result = await releaseAccount(prisma, {
    traderId: "trader-1",
    accountId: "account-current",
    reason: "EVALUATION_COMPLETED",
  });

  assert.equal(result.success, false, result.success ? "Expected no matching account to block stage completion" : result.error);
  assert.ok(writes.includes("checked-other-assignment"));
  assert.ok(!writes.some((write) => write.startsWith("passed-current-evaluation:")));
  assert.ok(!writes.some((write) => write.startsWith("released-current-account:")));
  assert.ok(!writes.includes("created-funded-account"));
});

test("passing the final purchased stage creates the funded-account record", async () => {
  const { prisma, writes } = releaseFixture(true, true, true);
  const result = await releaseAccount(prisma, {
    traderId: "trader-1",
    accountId: "account-current",
    reason: "EVALUATION_COMPLETED",
  });

  assert.equal(result.success, true, result.success ? undefined : result.error);
  if (!result.success) return;
  assert.equal(result.stageAdvanced, false);
  assert.equal(result.nextEvaluationId, null);
  assert.ok(result.fundedAccount);
  assert.ok(writes.includes("created-funded-account"));
  assert.ok(!writes.includes("created-next-evaluation"));
});

test("evaluation pass emails explain intermediate-stage and final-review next steps honestly", () => {
  const intermediate = buildEvaluationPassedMessage("trader@example.invalid", {
    email: "trader@example.invalid",
    evaluationId: "evaluation-stage-1",
    productName: "Two stage evaluation",
    stageName: "Phase One",
    nextStageName: "Phase Two",
  });
  assert.match(intermediate.text, /passed Phase One/i);
  assert.match(intermediate.text, /next stage, Phase Two, is now assigned/i);
  assert.doesNotMatch(intermediate.text, /activate your funded account/i);

  const final = buildEvaluationPassedMessage("trader@example.invalid", {
    email: "trader@example.invalid",
    evaluationId: "evaluation-final-stage",
    productName: "Two stage evaluation",
    stageName: "Phase Two",
  });
  assert.match(final.text, /review the result before approving any funded-account activation/i);
  assert.doesNotMatch(final.text, /activate your funded account/i);
});

test("evaluation start accepts complete optional-rule records and rejects incomplete or unexpected records", () => {
  assert.equal(isRuleInitializationComplete(["required", "optional"], ["optional", "required"]), true);
  assert.equal(isRuleInitializationComplete(["required", "optional"], ["required"]), false);
  assert.equal(isRuleInitializationComplete(["required"], ["required", "unexpected"]), false);
  assert.equal(isRuleInitializationComplete(["required", "required"], ["required", "required"]), false);
  assert.equal(isRuleInitializationComplete([], []), false);
});
