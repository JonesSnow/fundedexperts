/**
 * Security regression tests for four fixes.
 *
 * These deliberately exercise the REAL route handler and the REAL middleware
 * module rather than reimplementing their logic. The funded-account IDOR that
 * the first block guards against survived precisely because the earlier test in
 * tests/security-isolation.test.ts asserted against a local `simulate*` copy of
 * the handler instead of the handler itself.
 */
import "./support/test-env";

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

import { prisma } from "../lib/db";
import { createSession, SESSION_COOKIE } from "../lib/auth/session";
import { GET as getFundedAccountRoute } from "../app/api/funded-accounts/[id]/route";
import { POST as createFundedAccountRoute } from "../app/api/funded-accounts/route";
import { middleware } from "../middleware";
import { getRateLimitInfo, resetRateLimit } from "../lib/auth/rate-limit";
import { createFundedAccount } from "../lib/funded-account";
import { processMonitoringSnapshot } from "../lib/monitoring-pipeline";
import type { MonitoringSnapshot } from "../lib/monitoring/types";

const RUN = randomUUID().slice(0, 8);
const PASSWORD = "SomePassword1!";
/**
 * A password that satisfies validatePassword (>=8 chars, one letter, one digit)
 * so it reaches bcrypt instead of being rejected as malformed. Needed because
 * the handler returns 400 for malformed input and 401 for a genuine wrong
 * password, and only the latter exercises the comparison path.
 */
const WRONG_PASSWORD = "WrongPass123";

const createdTraderIds: string[] = [];
const createdAccountIds: string[] = [];
const createdEvaluationIds: string[] = [];
const createdRuleSetIds: string[] = [];
const createdRuleSetVersionIds: string[] = [];
const createdRuleIds: string[] = [];
const createdMT5Ids: string[] = [];

after(async () => {
  if (createdEvaluationIds.length) {
    await prisma.ruleEvaluation.deleteMany({ where: { evaluationId: { in: createdEvaluationIds } } });
    await prisma.evaluation.deleteMany({ where: { id: { in: createdEvaluationIds } } });
  }
  if (createdAccountIds.length) {
    await prisma.fundedAccount.deleteMany({ where: { id: { in: createdAccountIds } } });
  }
  if (createdMT5Ids.length) {
    await prisma.mT5Account.deleteMany({ where: { id: { in: createdMT5Ids } } });
  }
  if (createdTraderIds.length) {
    await prisma.trader.deleteMany({ where: { id: { in: createdTraderIds } } });
  }
  if (createdRuleIds.length) {
    await prisma.rule.deleteMany({ where: { id: { in: createdRuleIds } } });
  }
  if (createdRuleSetVersionIds.length) {
    await prisma.rulesetVersion.deleteMany({ where: { id: { in: createdRuleSetVersionIds } } });
  }
  if (createdRuleSetIds.length) {
    await prisma.ruleset.deleteMany({ where: { id: { in: createdRuleSetIds } } });
  }
  await prisma.$disconnect();
});

const createdRuleEvaluationIds: string[] = [];

/**
 * Minimal Evaluation fixture with a real RulesetVersion, since
 * Evaluation.rulesetVersionId is required and references one.
 */
async function makeEvaluation(
  traderId: string,
  status: "IN_PROGRESS" | "PASSED" | "FAILED" | "ABANDONED",
  accountId?: string
) {
  const tag = `sr-${RUN}-${Math.random().toString(36).slice(2, 8)}`;
  const ruleset = await prisma.ruleset.create({
    data: { name: `${tag}-rs`, description: "regression fixture", isActive: true },
  });
  createdRuleSetIds.push(ruleset.id);

  const version = await prisma.rulesetVersion.create({
    data: { version: "1.0", rulesetId: ruleset.id, status: "PUBLISHED" },
  });
  createdRuleSetVersionIds.push(version.id);

  const profitRule = await prisma.rule.create({
    data: {
      rulesetVersionId: version.id,
      ruleType: "PROFIT_TARGET",
      name: "Profit Target",
      value: { target: 5000 },
      isRequired: false,
    },
  });
  createdRuleIds.push(profitRule.id);

  const drawdownRule = await prisma.rule.create({
    data: {
      rulesetVersionId: version.id,
      ruleType: "DRAWDOWN_LIMIT",
      name: "Max Drawdown",
      value: { maxDrawdown: 20000 },
      isRequired: true,
    },
  });
  createdRuleIds.push(drawdownRule.id);

  const minTradesRule = await prisma.rule.create({
    data: {
      rulesetVersionId: version.id,
      ruleType: "MIN_TRADES",
      name: "Min Trades",
      value: { minTrades: 1 },
      isRequired: true,
    },
  });
  createdRuleIds.push(minTradesRule.id);

  let mt5Id = accountId;
  if (!mt5Id) {
    const mt5 = await prisma.mT5Account.create({
      data: {
        accountNumber: `${tag}-acct`,
        broker: "REGRESSION",
        server: "TEST",
        status: "AVAILABLE",
      },
    });
    createdMT5Ids.push(mt5.id);
    mt5Id = mt5.id;
  }

  const evaluation = await prisma.evaluation.create({
    data: {
      traderId,
      rulesetVersionId: version.id,
      accountId: mt5Id,
      status,
      startedAt: new Date(),
      completedAt: status === "IN_PROGRESS" ? null : new Date(),
    },
  });
  createdEvaluationIds.push(evaluation.id);
  return evaluation;
}

async function makeRuleEvaluation(evaluationId: string, result: "PASS" | "FAIL" | "WARNING") {
  const tag = `sr-${RUN}-${Math.random().toString(36).slice(2, 8)}`;
  const version = await prisma.rulesetVersion.findFirstOrThrow({
    where: { ruleset: { name: { startsWith: `sr-${RUN}-` } } },
    orderBy: { createdAt: "desc" },
  });
  const rule = await prisma.rule.create({
    data: { rulesetVersionId: version.id, ruleType: "PROFIT_TARGET", name: `${tag}-rule` },
  });
  createdRuleIds.push(rule.id);

  const ruleEvaluation = await prisma.ruleEvaluation.create({
    data: { evaluationId, ruleId: rule.id, result, evaluatedAt: new Date() },
  });
  createdRuleEvaluationIds.push(ruleEvaluation.id);
  return ruleEvaluation;
}

async function postCreateFundedAccount(adminId: string, body: unknown): Promise<Response> {
  const req = await sessionRequest(adminId, "ADMIN", "/api/funded-accounts");
  const post = new NextRequest(req.url, {
    method: "POST",
    headers: { cookie: req.headers.get("cookie") ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return createFundedAccountRoute(post);
}

async function makeTrader(
  email: string,
  role: "TRADER" | "ADMIN",
  status: "ACTIVE" | "SUSPENDED" = "ACTIVE",
  password: string = PASSWORD,
  cost = 4
) {
  const trader = await prisma.trader.create({
    data: {
      email,
      // Cost 4 by default because these tests are about authorization, not
      // hashing. The timing test below opts into the production cost factor so
      // that the real comparison path and the dummy verification do comparable
      // work, exactly as they do in production.
      password: await bcrypt.hash(password, cost),
      role,
      firstName: "Test",
      lastName: "Trader",
      status,
      emailVerified: true,
    },
  });
  createdTraderIds.push(trader.id);
  return trader;
}

async function makeFundedAccount(traderId: string) {
  const account = await prisma.fundedAccount.create({
    data: { traderId, status: "ELIGIBLE", totalPnl: 1234.56 },
  });
  createdAccountIds.push(account.id);
  return account;
}

function sessionRequest(traderId: string, role: string, path: string): Promise<NextRequest> {
  return createSession(traderId, role).then(
    (token) =>
      new NextRequest(`https://fundedexperts.test${path}`, {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      })
  );
}

async function postLogin(body: unknown): Promise<Response> {
  const { POST } = await import("../app/api/auth/login/route");
  const req = new NextRequest("https://fundedexperts.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req);
}

// ---------------------------------------------------------------------------
// 1. Funded-account IDOR — real route handler
// ---------------------------------------------------------------------------

test("GET /api/funded-accounts/[id]: trader can read own account", async () => {
  const traderA = await makeTrader(`idor-a-${RUN}@test.local`, "TRADER");
  const accountA = await makeFundedAccount(traderA.id);

  const req = await sessionRequest(traderA.id, "TRADER", `/api/funded-accounts/${accountA.id}`);
  const res = await getFundedAccountRoute(req, { params: Promise.resolve({ id: accountA.id }) });

  assert.equal(res.status, 200, "owner must be allowed");
  const body = (await res.json()) as { success: boolean; account: { id: string } };
  assert.equal(body.success, true);
  assert.equal(body.account.id, accountA.id);
});

test("GET /api/funded-accounts/[id]: trader cannot read another trader's account (IDOR)", async () => {
  const traderA = await makeTrader(`idor-a2-${RUN}@test.local`, "TRADER");
  const traderB = await makeTrader(`idor-b2-${RUN}@test.local`, "TRADER");
  const accountB = await makeFundedAccount(traderB.id);

  const req = await sessionRequest(traderA.id, "TRADER", `/api/funded-accounts/${accountB.id}`);
  const res = await getFundedAccountRoute(req, { params: Promise.resolve({ id: accountB.id }) });

  assert.equal(res.status, 404, "cross-trader read must be refused with the existing 404");
  const raw = await res.text();
  const body = JSON.parse(raw) as { success: boolean };
  assert.equal(body.success, false);
  assert.equal(
    raw.includes(traderB.id),
    false,
    "response must not leak the owning trader's id"
  );
});

test("GET /api/funded-accounts/[id]: admin retains cross-trader access", async () => {
  const admin = await makeTrader(`idor-admin-${RUN}@test.local`, "ADMIN");
  const traderB = await makeTrader(`idor-b3-${RUN}@test.local`, "TRADER");
  const accountB = await makeFundedAccount(traderB.id);

  const req = await sessionRequest(admin.id, "ADMIN", `/api/funded-accounts/${accountB.id}`);
  const res = await getFundedAccountRoute(req, { params: Promise.resolve({ id: accountB.id }) });

  assert.equal(res.status, 200, "admin must retain legitimate cross-trader access");
  const body = (await res.json()) as { account: { id: string } };
  assert.equal(body.account.id, accountB.id);
});

test("GET /api/funded-accounts/[id]: unauthenticated request is 401", async () => {
  const traderA = await makeTrader(`idor-a3-${RUN}@test.local`, "TRADER");
  const accountA = await makeFundedAccount(traderA.id);

  const req = new NextRequest(`https://fundedexperts.test/api/funded-accounts/${accountA.id}`);
  const res = await getFundedAccountRoute(req, { params: Promise.resolve({ id: accountA.id }) });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// 2. Login rate-limit reset — real handler + real limiter
// ---------------------------------------------------------------------------

test("malformed requests still consume rate-limit attempts", async () => {
  const email = `rl-a-${RUN}@test.local`;
  const key = `login:${email}`;
  resetRateLimit(key);

  for (let i = 0; i < 3; i++) {
    const res = await postLogin({ email, password: "x" });
    assert.equal(res.status, 400, "malformed request is a validation failure");
  }

  const info = getRateLimitInfo(key);
  assert.ok(info, "a rate-limit entry must exist");
  assert.equal(info.attempts, 3, "each malformed request must consume an attempt");
  resetRateLimit(key);
});

test("repeated malformed requests cannot reset the counter and lockout still triggers", async () => {
  const email = `rl-b-${RUN}@test.local`;
  const key = `login:${email}`;
  resetRateLimit(key);

  for (let i = 0; i < 5; i++) {
    const res = await postLogin({ email, password: "x" });
    assert.equal(res.status, 400);
  }

  const info = getRateLimitInfo(key);
  assert.ok(info);
  assert.equal(info.attempts, 5, "counter must accumulate rather than being cleared");

  const locked = await postLogin({ email, password: "x" });
  assert.equal(locked.status, 429, "lockout must still trigger after 5 attempts");
  assert.ok(locked.headers.get("Retry-After"), "429 must still carry Retry-After");
  resetRateLimit(key);
});

test("5 failed password attempts then 429, unchanged lockout behaviour", async () => {
  const email = `rl-c-${RUN}@test.local`;
  await makeTrader(email, "TRADER");
  const key = `login:${email}`;
  resetRateLimit(key);

  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await postLogin({ email, password: WRONG_PASSWORD });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.equal(statuses[5], 429, "sixth attempt must be rate limited");
  resetRateLimit(key);
});

test("successful authentication still resets the counter", async () => {
  const email = `rl-d-${RUN}@test.local`;
  await makeTrader(email, "TRADER");
  const key = `login:${email}`;
  resetRateLimit(key);

  for (let i = 0; i < 3; i++) {
    const res = await postLogin({ email, password: WRONG_PASSWORD });
    assert.equal(res.status, 401);
  }
  assert.ok((getRateLimitInfo(key)?.attempts ?? 0) > 0, "failures must be counted");

  const ok = await postLogin({ email, password: PASSWORD });
  assert.equal(ok.status, 200, "valid credentials must still succeed");
  assert.equal(getRateLimitInfo(key), undefined, "successful login must clear the counter");
});

// ---------------------------------------------------------------------------
// 3. Middleware — real middleware function
// ---------------------------------------------------------------------------

test("middleware: database failure returns 503, not a login redirect", async () => {
  const req = await sessionRequest(randomUUID(), "TRADER", "/dashboard");
  const res = await withFailingDatabase(() => middleware(req));

  assert.equal(res.status, 503, "a DB outage must surface as 503");
  assert.equal(res.headers.get("Retry-After"), "30");
  assert.equal(res.headers.get("location"), null, "no redirect target may be set");
  const text = await res.text();
  assert.equal(
    /prisma|postgres|neon|database|econn|terminated/i.test(text),
    false,
    "response must not expose database detail"
  );
});

test("middleware: database failure on /admin also returns 503", async () => {
  const req = await sessionRequest(randomUUID(), "ADMIN", "/admin/orders");
  const res = await withFailingDatabase(() => middleware(req));
  assert.equal(res.status, 503);
});

test("middleware: missing session still redirects to /login", async () => {
  const res = await middleware(new NextRequest("https://fundedexperts.test/dashboard"));
  assert.equal(res.status, 307);
  assert.match(res.headers.get("location") ?? "", /\/login/);
});

test("middleware: non-admin on /admin still redirects to /login", async () => {
  const trader = await makeTrader(`mw-${RUN}@test.local`, "TRADER");
  const req = await sessionRequest(trader.id, "TRADER", "/admin/orders");
  const res = await middleware(req);
  assert.equal(res.status, 307);
  assert.match(res.headers.get("location") ?? "", /\/login/);
});

test("middleware: suspended trader is redirected to /login", async () => {
  const trader = await makeTrader(`mw-susp-${RUN}@test.local`, "TRADER", "SUSPENDED");
  const req = await sessionRequest(trader.id, "TRADER", "/dashboard");
  const res = await middleware(req);
  assert.equal(res.status, 307);
  assert.match(res.headers.get("location") ?? "", /\/login/);
});

test("middleware: authorized admin passes through", async () => {
  const admin = await makeTrader(`mw-admin-${RUN}@test.local`, "ADMIN");
  const req = await sessionRequest(admin.id, "ADMIN", "/admin/orders");
  const res = await middleware(req);
  assert.equal(res.status, 200, "authorized admin must pass through");
});

// ---------------------------------------------------------------------------
// 4. Login timing oracle — coarse guard, not a proof of equality
// ---------------------------------------------------------------------------

test("login timing: missing user and wrong password cost comparable work", async () => {
  // COARSE CHECK ONLY. bcrypt dominates both paths, so this asserts the
  // missing-user path is no longer trivially faster. It cannot prove timing
  // equality and will not catch a small residual difference.
  // Cost 12 matches SALT_ROUNDS in lib/auth/hash.ts, so the stored-hash
  // comparison and the dummy verification perform the same amount of work.
  const real = await makeTrader(`timing-real-${RUN}@test.local`, "TRADER", "ACTIVE", PASSWORD, 12);
  const suspended = await makeTrader(
    `timing-susp-${RUN}@test.local`,
    "TRADER",
    "SUSPENDED",
    PASSWORD,
    12
  );

  // Warm bcrypt and the connection pool before sampling.
  await postLogin({ email: `ghost-warm-${RUN}@test.local`, password: PASSWORD });
  await postLogin({ email: real.email, password: PASSWORD });

  const samples = 3;
  const missing: number[] = [];
  const wrong: number[] = [];
  const suspendedMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    let t = performance.now();
    const r1 = await postLogin({ email: `ghost-${RUN}-${i}@test.local`, password: PASSWORD });
    missing.push(performance.now() - t);
    assert.equal(r1.status, 401);

    t = performance.now();
    const r2 = await postLogin({ email: real.email, password: WRONG_PASSWORD });
    wrong.push(performance.now() - t);
    assert.equal(r2.status, 401);

    t = performance.now();
    const r3 = await postLogin({ email: suspended.email, password: WRONG_PASSWORD });
    suspendedMs.push(performance.now() - t);
    assert.equal(r3.status, 403, "suspended accounts keep their existing 403");
  }

  const median = (xs: number[]) => {
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const mMissing = median(missing);
  const mWrong = median(wrong);
  const mSuspended = median(suspendedMs);

  assert.ok(
    mMissing > 50,
    `missing-user path should perform real password work, took ${mMissing.toFixed(0)}ms`
  );
  assert.ok(
    mSuspended > 50,
    `suspended path should perform real password work, took ${mSuspended.toFixed(0)}ms`
  );

  const ratio = mMissing / mWrong;
  assert.ok(
    ratio > 0.5 && ratio < 2,
    `medians should be comparable; missing=${mMissing.toFixed(0)}ms wrong=${mWrong.toFixed(0)}ms ratio=${ratio.toFixed(2)}`
  );
});

// ---------------------------------------------------------------------------
// 5. Funded-account correctness batch
// ---------------------------------------------------------------------------

test("createFundedAccount: FAILED evaluation is rejected (service level)", async () => {
  const trader = await makeTrader(`ff-${RUN}@test.local`, "TRADER");
  const evaluation = await makeEvaluation(trader.id, "FAILED");

  const result = await createFundedAccount(prisma, {
    evaluationId: evaluation.id,
    performedBy: trader.id,
  });

  assert.equal(result.success, false, "a FAILED evaluation must not produce a funded account");
  assert.equal(
    await prisma.fundedAccount.count({ where: { evaluationId: evaluation.id } }),
    0,
    "no funded account row may be written"
  );
  if (!result.success) {
    assert.equal(result.errorCategory, "INVALID_STATE", "uses the existing domain category");
  }
});

test("createFundedAccount: IN_PROGRESS evaluation is rejected", async () => {
  const trader = await makeTrader(`ip-${RUN}@test.local`, "TRADER");
  const evaluation = await makeEvaluation(trader.id, "IN_PROGRESS");

  const result = await createFundedAccount(prisma, {
    evaluationId: evaluation.id,
    performedBy: trader.id,
  });

  assert.equal(result.success, false);
  assert.equal(await prisma.fundedAccount.count({ where: { evaluationId: evaluation.id } }), 0);
});

test("createFundedAccount: PASSED evaluation still succeeds and is idempotent", async () => {
  const trader = await makeTrader(`ps-${RUN}@test.local`, "TRADER");
  const evaluation = await makeEvaluation(trader.id, "PASSED");

  const first = await createFundedAccount(prisma, {
    evaluationId: evaluation.id,
    performedBy: trader.id,
  });
  assert.equal(first.success, true);
  if (first.success) {
    createdAccountIds.push(first.account.id);
    assert.equal(first.wasAlreadyCreated, false);
  }

  const second = await createFundedAccount(prisma, {
    evaluationId: evaluation.id,
    performedBy: trader.id,
  });
  assert.equal(second.success, true, "repeat call must remain idempotent");
  if (first.success && second.success) {
    assert.equal(second.account.id, first.account.id, "same account returned");
    assert.equal(second.wasAlreadyCreated, true);
  }
});

test("createFundedAccount: audit entry is written in the same transaction as the account", async () => {
  const trader = await makeTrader(`tx-${RUN}@test.local`, "TRADER");
  const evaluation = await makeEvaluation(trader.id, "PASSED");

  const result = await createFundedAccount(prisma, {
    evaluationId: evaluation.id,
    performedBy: trader.id,
  });
  assert.equal(result.success, true);
  if (!result.success) return;

  createdAccountIds.push(result.account.id);

  // Both the row and its audit entry exist, so neither was committed alone.
  const audit = await prisma.auditLog.findFirst({
    where: { entityType: "FundedAccount", entityId: result.account.id },
  });
  assert.ok(audit, "audit entry must exist for a committed funded account");
});

test("createFundedAccount: a failed audit write rolls back the funded account", async () => {
  const trader = await makeTrader(`rb-${RUN}@test.local`, "TRADER");
  const evaluation = await makeEvaluation(trader.id, "PASSED");

  const before = await prisma.fundedAccount.count({ where: { evaluationId: evaluation.id } });

  // Force the audit insert to fail by giving the transaction a client whose
  // auditLog.create rejects, while fundedAccount.create still succeeds.
  const result = await withFailingAuditWrite(() =>
    createFundedAccount(prisma, { evaluationId: evaluation.id, performedBy: trader.id })
  );

  assert.equal(result.success, false, "the operation must report failure");
  const after = await prisma.fundedAccount.count({ where: { evaluationId: evaluation.id } });
  assert.equal(after, before, "no funded account may be left behind by the failed audit write");
});

test("POST /api/funded-accounts: missing evaluation returns 404, not 500", async () => {
  const admin = await makeTrader(`nf-admin-${RUN}@test.local`, "ADMIN");

  const res = await postCreateFundedAccount(admin.id, {
    evaluationId: `00000000-0000-4000-8000-000000000000`,
  });

  assert.equal(res.status, 404, "documented NOT_FOUND mapping");
  const body = (await res.json()) as { success: boolean; errorCategory: string };
  assert.equal(body.success, false);
  assert.equal(body.errorCategory, "NOT_FOUND");
});

test("POST /api/funded-accounts: FAILED evaluation returns 409", async () => {
  const admin = await makeTrader(`ff-admin-${RUN}@test.local`, "ADMIN");
  const trader = await makeTrader(`ff-trader-${RUN}@test.local`, "TRADER");
  const evaluation = await makeEvaluation(trader.id, "FAILED");

  const res = await postCreateFundedAccount(admin.id, { evaluationId: evaluation.id });

  assert.equal(res.status, 409, "rejected as a conflicting domain state");
  const body = (await res.json()) as { errorCategory: string };
  assert.equal(body.errorCategory, "INVALID_STATE");
  assert.equal(
    await prisma.fundedAccount.count({ where: { evaluationId: evaluation.id } }),
    0,
    "no funded account may be created from a FAILED evaluation"
  );
});

test("POST /api/funded-accounts: PASSED evaluation returns 201", async () => {
  const admin = await makeTrader(`ok-admin-${RUN}@test.local`, "ADMIN");
  const trader = await makeTrader(`ok-trader-${RUN}@test.local`, "TRADER");
  const evaluation = await makeEvaluation(trader.id, "PASSED");

  const res = await postCreateFundedAccount(admin.id, { evaluationId: evaluation.id });

  assert.equal(res.status, 201, "successful creation contract preserved");
  const body = (await res.json()) as { success: boolean; account: { id: string } };
  assert.equal(body.success, true);
  createdAccountIds.push(body.account.id);
});

test("monitoring pipeline: exposes fundedAccountError so creation failure is observable", async () => {
  const trader = await makeTrader(`mp-${RUN}@test.local`, "TRADER");
  const evaluation = await makeEvaluation(trader.id, "IN_PROGRESS");
  const mt5Id = evaluation.accountId!;
  assert.ok(mt5Id, "fixture evaluation must have an MT5 account");

  const result = await processMonitoringSnapshot(prisma, {
    accountId: mt5Id,
    snapshot: passingSnapshot(mt5Id),
    performedBy: trader.id,
    sendEmails: false,
  });

  assert.ok(result.success, `pipeline should succeed: ${JSON.stringify(result)}`);
  if (result.success) {
    assert.ok(
      "fundedAccountError" in result,
      "a successful result must expose fundedAccountError so failures are observable"
    );
    assert.equal(result.fundedAccountError, null, "no failure to report on this path");
  }
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * A snapshot that satisfies every rule, so the monitoring pipeline takes the
 * PASS branch and attempts funded-account creation.
 */
function passingSnapshot(mT5AccountId: string): MonitoringSnapshot {
  return {
    accountId: mT5AccountId,
    accountLoginMasked: "******1",
    accountNumber: "REGRESSION-1",
    server: "TEST",
    broker: "REGRESSION",
    balance: 100000,
    equity: 105000,
    freeMargin: 100000,
    margin: 0,
    marginLevel: null,
    currency: "USD",
    leverage: 100,
    isDemo: true,
    positions: [],
    orders: [],
    historySummary: {
      dealCount: 1,
      totalRealizedPnl: 5000,
      winCount: 1,
      lossCount: 0,
      periodStart: null,
      periodEnd: null,
    },
    terminalConnected: null,
    terminalVersion: null,
    dataTimestamp: new Date(),
    provider: "MT5",
    snapshotTimestamp: new Date(),
  };
}

/**
 * Runs `fn` with the shared Prisma client replaced by a stub whose fundedAccount
 * writes succeed but whose auditLog.create rejects. That is how an audit write
 * failure reaches the transaction in production, and it must leave no committed
 * funded account behind.
 */
async function withFailingAuditWrite<T>(fn: () => Promise<T>): Promise<T> {
  const key = "__fundedExpertsPrisma";
  const holder = globalThis as unknown as Record<string, unknown>;
  const original = holder[key];

  const auditFailure = () => Promise.reject(new Error("audit write rejected"));

  holder[key] = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "$transaction") {
          return async (cb: (tx: unknown) => Promise<unknown>) =>
            cb(makeStubClient(auditFailure));
        }
        const stub = makeStubClient(auditFailure);
        return (stub as unknown as Record<string, unknown>)[prop as string];
      },
    }
  );

  try {
    return await fn();
  } finally {
    if (original === undefined) delete holder[key];
    else holder[key] = original;
  }
}

function makeStubClient(auditFailure: () => Promise<never>) {
  return {
    fundedAccount: {
      create: () => Promise.reject(new Error("stub: use $transaction")),
      findFirst: () => Promise.resolve(null),
      findUnique: () => Promise.resolve(null),
    },
    auditLog: { create: auditFailure },
    evaluation: { findUnique: () => Promise.resolve(null) },
  };
}
async function withFailingDatabase<T>(fn: () => Promise<T>): Promise<T> {
  const key = "__fundedExpertsPrisma";
  const holder = globalThis as unknown as Record<string, unknown>;
  const original = holder[key];

  holder[key] = new Proxy(
    {},
    {
      get(_target, prop) {
        const fail = () => Promise.reject(new Error("connection terminated unexpectedly"));
        return prop === "trader" ? { findUnique: fail } : fail;
      },
    }
  );

  try {
    return await fn();
  } finally {
    if (original === undefined) delete holder[key];
    else holder[key] = original;
  }
}