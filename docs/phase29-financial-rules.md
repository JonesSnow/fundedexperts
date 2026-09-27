# Phase 29: Financial Metric Hardening

## Overview

Phase 29 hardens the financial metric calculations and rule engine determinism in the monitoring pipeline. This phase addresses three critical issues identified during the Phase 28 audit:

1. **PROFIT_TARGET semantics bug** — Profit target not being met was returning `FAIL` instead of `WARNING`
2. **Email semantic function misuse** — `sendRuleBreachEmail` was incorrectly called for `EVALUATION_PASSED` events
3. **Decimal precision and drawdown stability** — Floating-point drift and missing `startingBalance` reference

## Changes

### 1. PROFIT_TARGET Returns WARNING (Not FAIL)

**Problem:** When a trader had not yet met the profit target, the rule engine returned `FAIL`. Since `PROFIT_TARGET` is typically configured as a non-required rule (`isRequired: false`), this did not directly cause evaluation failure, but it incorrectly inflated the `overallResult` to `FAIL`, making the monitoring state report `UNHEALTHY` / `ERROR` instead of `DEGRADED` / `DISCONNECTED`.

**Fix:** `PROFIT_TARGET` now returns `WARNING` when the target is not met. `WARNING` is the semantically correct result — not meeting the profit target is not a rule violation; it simply means the evaluation condition has not been satisfied yet.

- `PASS` — Profit target met (actual PnL >= target)
- `WARNING` — Profit target not yet met (actual PnL < target)
- `WARNING` — No target value defined in rule configuration

### 2. Evaluation Email Semantic Function Fix

**Problem:** The monitoring pipeline (`lib/monitoring-pipeline.ts`) called `sendRuleBreachEmail` with `violationType: "EVALUATION_PASSED"` when an evaluation passed. This was incorrect because:

- `sendRuleBreachEmail` uses the `rule-breach` email template, which is designed for rule violations
- Using it for a pass event produced an email with "rule breach" language for a successful evaluation
- `releaseAccount()` in `lib/release.ts` already sends `sendEvaluationPassedEmail` internally

**Fix:** Removed the `sendRuleBreachEmail` call from the evaluation-passed code path. The `releaseAccount` function handles `sendEvaluationPassedEmail` and `sendEvaluationFailedEmail` internally with correct templates and idempotency keys.

The `sendRuleBreachEmail` call remains in the evaluation-failure path, providing specific breach violation details (rule type, actual vs expected values) to the trader. This is complementary to `sendEvaluationFailedEmail` which provides a generic failure notice.

### 3. `startingBalance` Field on Evaluation Model

**Problem:** The `Evaluation` model had no `startingBalance` field. This made drawdown calculations non-deterministic — the peak equity reference was inferred from snapshot data alone, which could vary based on timing.

**Fix:** Added `startingBalance Decimal? @db.Decimal(18, 2)` to the `Evaluation` model. This field:

- Is nullable (backward-compatible, no data loss)
- Is backfilled from `MT5Account.accountSize` for existing evaluations
- Is used as the peak-equity reference for DRAWDOWN_LIMIT calculations
- Provides deterministic, reproducible drawdown calculations

### 4. Decimal-Safe Financial Calculations

**Changes to `lib/rule-engine.ts`:**

- Added `round2()` helper that uses `Math.round((value + Number.EPSILON) * 100) / 100` to prevent floating-point drift
- `computeTotalPnl()` now uses realized PnL from history summary + unrealized position PnL (matching the pipeline's calculation)
- `computeCurrentDrawdown()` now accepts an optional `startingBalance` parameter and uses it as the peak-equity floor reference:
  - `peakEquity = max(balance, equity, startingBalance)`
  - `drawdown = max(0, peakEquity - equity)`

**Changes to `lib/monitoring-pipeline.ts`:**

- `computeTotalPnl()` now uses the same realized + unrealized PnL formula as the rule engine
- `computeCurrentDrawdown()` accepts and uses `evaluation.startingBalance` from the database
- `maxDrawdown` tracking now uses `round2()` for consistent storage

### 5. EvaluateRuleOptions Interface

Added `EvaluateRuleOptions` interface with `startingBalance` field. The `evaluateRule()` and `evaluateAllRules()` functions now accept an optional third parameter to pass evaluation context (currently `startingBalance`) to rule evaluators.

## Test Coverage (Scenarios A–AH)

| Scenario | Description |
|----------|-------------|
| A | PROFIT_TARGET below target returns WARNING, not FAIL |
| B | PROFIT_TARGET at exact target boundary returns PASS |
| C | PROFIT_TARGET slightly above target returns PASS |
| D | PROFIT_TARGET slightly below target returns WARNING |
| E | Drawdown from startingBalance when equity drops below starting balance |
| F | Drawdown within limit from startingBalance (percentage) |
| G | Drawdown with growing account (equity above starting balance) |
| H | Drawdown without startingBalance uses balance as peak |
| I | Total PnL rounding to 2 decimal places |
| J | Drawdown rounding does not allow floating-point drift |
| K | Zero PnL with zero target returns PASS |
| L | PROFIT_TARGET with no target returns WARNING |
| M | DRAWDOWN_LIMIT with no config returns WARNING |
| N | MAX_LEVERAGE with null leverage returns WARNING |
| O | Null balance and equity handled gracefully |
| P | Null/undefined positions handled (empty array fallback) |
| Q | Null profit in position treated as 0 |
| R | PROFIT_TARGET WARNING does not trigger failure (non-required) |
| S | PROFIT_TARGET met triggers evaluation completion |
| T | PROFIT_TARGET not met but required breach triggers failure |
| U | No rule-breach email template used for evaluation pass |
| V | Evaluation passed email uses correct template |
| W | Evaluation totalPnl updated with decimal precision |
| X | Evaluation maxDrawdown tracked correctly (monotonic) |
| Y | RuleEvaluation outcomes persist with correct values |
| Z | Monitoring state reflects WARNING overall result |
| AA | Audit log entries created for rule breaches |
| AB | Idempotent re-processing after failure |
| AC | Starting balance not set — drawdown uses balance as peak |
| AD | Exact drawdown at limit boundary returns PASS |
| AE | One cent over drawdown limit returns FAIL |
| AF | Zero starting balance treated as undefined |
| AG | Negative PnL reduces total correctly |
| AH | Multiple positions profit aggregated correctly |

## Migration

New migration `20260927000000_evaluation_starting_balance` adds the `startingBalance` column and backfills from `MT5Account.accountSize`.

## Architectural Impact

- The monitoring pipeline maintains single source of truth for email notifications (via `releaseAccount`)
- Rule engine is now a pure function with deterministic outputs
- Financial calculations are insulated from floating-point precision issues
- Drawdown calculations are reproducible across monitoring cycles
