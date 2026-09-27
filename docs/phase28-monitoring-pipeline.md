# Phase 28 — Connect Trading Data to Evaluation Rule Engine

**Status:** Complete  
**Last Updated:** 2026-09-27

## 1. Missing Connection Identified

The existing monitoring infrastructure (`lib/monitoring/`) had:
- Worker, Scheduler, Adapter, Mock adapter, Normalization, Health, Eligibility, Retry, Credential boundary
- Monitoring job persistence (`lib/monitoring/monitoring-job.ts`)

But it was **not connected** to:
- `Evaluation` lifecycle (pass/fail transitions via `lib/release.ts`)
- `Rule` / `RulesetVersion` rule evaluation
- `RuleEvaluation` persistence
- `RuleEvent` creation
- Email notifications for rule breaches (`lib/email/templates`)
- Audit logging for monitoring decisions

## 2. New/Modified Files

| File | Status | Description |
|------|--------|-------------|
| `lib/rule-engine.ts` | **NEW** | Pure rule evaluation engine for all 8 RuleType variants |
| `lib/monitoring-pipeline.ts` | **NEW** | `processMonitoringSnapshot()` — connects snapshot to rules to state transitions |
| `lib/monitoring/monitoring-runner.ts` | **NEW** | Worker/Scheduler integration — finds eligible accounts, fetches snapshots, normalizes, evaluates, releases accounts |
| `app/api/monitoring/[accountId]/process/route.ts` | **NEW** | Admin API to trigger monitoring with mock adapter support |
| `app/api/monitoring/[accountId]/status/route.ts` | **NEW** | Admin visibility API for monitoring state |
| `tests/monitoring-pipeline.test.ts` | **NEW** | 80 deterministic test checks across 20 test cases (A–T) |
| `package.json` | MODIFIED | Added `test:monitoring` script |

## 3. Trading Data Model

```
ProviderSnapshot (raw MT5 data from adapter)
    ↓ normalizeSnapshot()
MonitoringSnapshot (normalized, internal format)
    ↓ computeTotalPnl, computeCurrentDrawdown
Evaluation metrics (PnL, drawdown, trade counts)
    ↓ evaluateAllRules()
RuleEvaluationOutcome[] (per-rule results)
    ↓ getOverallResult()
"PASS" | "FAIL" | "WARNING"
    ↓ processMonitoringSnapshot()
RuleEvaluation (upserted) + RuleEvent (created on breach)
    ↓
Evaluation status transition via releaseAccount()
```

## 4. Metric Definitions

| Metric | Calculation | Basis |
|--------|------------|-------|
| **Total PnL** | `realizedPnl + sum(position.profit)` | `historySummary.totalRealizedPnl + positions[].profit` |
| **Current Drawdown** | `max(0, balance - equity)` | `balance` and `equity` from snapshot |
| **Open Trade Count** | `positions.length + openOrders.length` | Positions + orders in PLACED/PARTIAL state |
| **Daily Loss** | `abs(totalRealizedPnl)` (all history in mock) | `historySummary.totalRealizedPnl` |
| **Profit Target Progress** | `totalPnL / target` | `computeTotalPnl() / rule.value.target` |

### Documented Interpretation Decisions
- **Starting balance** is not tracked separately — drawdown is computed from `balance` (current) vs `equity` (current)
- **Day boundaries** are handled at the adapter level — the mock adapter returns all history as "today"
- **Realized vs unrealized P&L** — `totalRealizedPnl` from history + `position.profit` for floating
- **Equity-based drawdown** — `max(0, balance - equity)` captures both realized and unrealized losses

## 5. RuleValue JSON Format

Each `Rule.value` (Json? field) uses a structured JSON format:

```json
{
  "PROFIT_TARGET": { "target": 5000 },
  "DRAWDOWN_LIMIT": { "maxDrawdown": 20000 }  
    OR { "maxDrawdownPercent": 10, "startingBalance": 100000 }
  "MIN_TRADES": { "minTrades": 3 },
  "MAX_DAILY_LOSS": { "maxLoss": 5000 },
  "MAX_OPEN_TRADES": { "maxTrades": 3 },
  "TRADING_HOURS": { "startHour": 6, "endHour": 22, "timezone": "UTC" },
  "MAX_LEVERAGE": { "maxLeverage": 500 },
  "TRADING_SESSION": { "sessionRules": [...], "allowedSymbols": [...] }
}
```

## 6. Rule Evaluation Behavior

- Rules are evaluated from the evaluation's `RulesetVersion.rules`
- Each rule type has a pure evaluator function in `lib/rule-engine.ts`
- `PROFIT_TARGET` returns FAIL when not met, PASS when met
- `PROFIT_TARGET` should be configured as `isRequired: false` — not meeting a goal is not a violation
- Violation rules (DRAWDOWN_LIMIT, MAX_DAILY_LOSS, MAX_OPEN_TRADES) fail the evaluation when breached and `isRequired: true`

## 7. Pass/Fail Behavior

### Pass
When `overallResult === "PASS"` AND `PROFIT_TARGET` outcome is PASS:
1. `releaseAccount(prisma, { reason: "EVALUATION_COMPLETED" })`
2. Sends `EVALUATION_PASSED` email
3. Audit log: `SYSTEM_EVENT` with event `EVALUATION_PASSED`

### Fail
When a required rule returns FAIL (`hasRequiredFailure === true`):
1. Creates `RuleEvent` for each unacknowledged breach
2. `releaseAccount(prisma, { reason: "EVALUATION_FAILED" })`
3. Sends `sendRuleBreachEmail`
4. Audit log: `SYSTEM_EVENT` with event `EVALUATION_FAILED`

### Idempotency
- `releaseAccount` checks for non-terminal evaluations before transitioning
- `RuleEvaluation.upsert` prevents duplicate evaluations (unique on `evaluationId + ruleId`)
- `RuleEvent` creation checks for existing unacknowledged events of same type
- Terminal evaluations (PASSED/FAILED) are skipped — pipeline returns early

## 8. Worker/Scheduler Integration

`lib/monitoring/monitoring-runner.ts` `MonitoringRunner` class:
1. Finds evaluations with `IN_PROGRESS` status and assigned accounts
2. Creates monitoring jobs via `scheduleMonitoringJob()` (DB-based deduplication)
3. Uses existing `Worker` to fetch snapshots via adapter
4. Normalizes via `normalizeSnapshot()`
5. Processes via `processMonitoringSnapshot()`
6. Persists monitoring state via `updateMonitoringState()`
7. Handles failures gracefully — worker errors don't crash the cycle

## 9. Concurrency Protections

| Risk | Protection |
|------|-----------|
| Duplicate evaluation fail | `releaseAccount` queries only IN_PROGRESS/PASSED evaluations |
| Duplicate RuleEvent | Check for unacknowledged events before creating |
| Concurrent monitoring | `scheduleMonitoringJob` checks for existing PENDING/RUNNING jobs |
| Race on rule evaluation | `$transaction` around RuleEvaluation upserts and RuleEvent creation |

## 10. Admin Changes

New API: `GET /api/monitoring/[accountId]/status`
- Returns account info, in-progress evaluation, rule evaluations, rule events, and monitoring job history
- Admin-only access

Existing API: `POST /api/monitoring/[accountId]/process`
- Triggers monitoring with mock adapter support
- Admin-only access

## 11. Email Integration

Reuses existing `lib/email/templates/index.ts`:
- `sendRuleBreachEmail` — on rule breach (EVALUATION_FAILED path)
- `sendEvaluationPassedEmail` equivalent — on EVALUATION_PASSED via `sendRuleBreachEmail` with `violationType: "EVALUATION_PASSED"`
- Emails sent with `try/catch` — failures logged but do not roll back state transitions

## 12. Database Changes

**None.** No Prisma schema changes required. All new code uses existing models:
- `Rule`, `Ruleset`, `RulesetVersion`, `RuleEvaluation`, `RuleEvent`
- `Evaluation`, `MT5Account`, `MonitoringJob`, `AuditLog`

## 13. Test Matrix Results

| Test | Scenario | Result |
|------|----------|--------|
| A | Normal profitable trading (PnL below target) | PASS |
| B | Profit target reached → evaluation PASSED | PASS |
| C | Drawdown breach → evaluation FAILED | PASS |
| D | Max drawdown breach with positions | PASS |
| E | Still-active evaluation (no terminal) | PASS |
| F | Multiple rules mixed results | PASS |
| G | No trading data | PASS |
| H | Invalid trading data (null values) | PASS |
| I | Duplicate monitoring cycle (no dup RuleEvent) | PASS |
| J | Duplicate breach prevention | PASS |
| K | Idempotent evaluation failure | PASS |
| L | Idempotent evaluation pass | PASS |
| M | Correct RuleEvaluation creation | PASS |
| N | Correct RuleEvent creation on breach | PASS |
| O | Monitoring state updated on account | PASS |
| P | No in-progress evaluation — skip gracefully | PASS |
| Q | Terminal evaluation — no processing | PASS |
| R | RuleEvaluation updated on re-processing | PASS |
| S | Monitoring retry behavior | PASS |
| T | Terminal evaluations not monitored | PASS |
| Rule Engine Unit Tests (16 cases) | Profit target, drawdown, min trades, max daily loss, max open trades, overall result | PASS |

**Total: 80/80 checks pass**

## 14. Real MT5 Integration Boundary

The architecture supports swapping the mock adapter:
- **Required credentials**: `ProviderCredentials` (providerType, server, login, password, connectionTimeoutMs)
- **Required trading data**: `ProviderSnapshot` (accountInfo, positions, orders, history, terminalInfo)
- **Adapter interface**: `MT5Adapter.fetchSnapshot()` and `MT5Adapter.testConnection()`
- **Polling frequency**: Worker timeout configured via `WorkerConfig.timeoutMs` (default 10s)
- **Failure behavior**: Errors are caught, jobs marked failed with `retryable` flag, stale jobs recovered via lease expiry
- **Authentication boundary**: Credentials validated via `validateCredentials()`, never logged

## 15. Remaining Limitations

1. **Real MT5 adapter not implemented** — mock adapter only; a production `MT5Adapter` subclass can be plugged in
2. **Single polling per cycle** — `MonitoringRunner.runAllEligible()` processes accounts sequentially, not concurrently
3. **Email on pass uses sendRuleBreachEmail** — could be separated to use `sendEvaluationPassedEmail` template once email templates are audited for exact match
4. **Daily loss calculation** — uses total history rather than actual day boundaries (mock adapter returns all history as "today")
5. **Scheduled monitoring** — `MonitoringRunner` requires manual or cron invocation; not yet wired to a recurring scheduler
