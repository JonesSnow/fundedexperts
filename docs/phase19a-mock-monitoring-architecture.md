# Phase 19A: Mock MT5 Monitoring Architecture

## Objective

Provide a deterministic, testable monitoring layer that isolates evaluation from unreliable external MT5 connectivity, enabling E2E evaluation success even when MT5 is unavailable.

---

## Problem Statement

All POC methods for connecting to live MT5 and XM terminals failed (Phase 18). Evaluation depends on monitoring snapshots; without a reliable source, evaluation cannot proceed. The monitoring layer must be mockable for testing while remaining swappable for live providers.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Monitoring Layer                          │
│                                                              │
│  ProviderSnapshot (raw) ──► Normalize ──► MonitoringSnapshot │
│       │                     (normalize.ts)      │             │
│       │                                              │         │
│  ┌────┴──────────────┐                      ┌────────┴──────┐ │
│  │ MT5Adapter        │                      │ evaluateHealth│ │
│  │ (abstract)        │                      │ (health.ts)   │ │
│  │  ▲                │                      └───────────────┘ │
│  │  │                │                                             │
│  │  ├─ MockMT5Adapter │ ◄── Deterministic, configurable         │
│  │  ├─ XMAdapter      │    (mock-adapter.ts)                    │
│  │  └─ OtherAdapter   │                                         │
│  └───────────────────┘                                             │
│                                                              │
│  MonitoringResult (result.ts) ◄── Retry Policy (retry.ts)       │
└──────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. `lib/monitoring/types.ts` — Provider-Neutral Interface

Defines all types shared across providers:

| Type | Purpose |
|---|---|
| `ProviderSnapshot` | Raw provider response (before normalization) |
| `ProviderAccountInfo` | Raw account data from provider |
| `ProviderPosition/Order/Deal` | Raw position/order/deal types |
| `MonitoringSnapshot` | Normalized snapshot (post-normalization) |
| `MonitoringAccountInfo` | Normalized account info with masked login |
| `MonitoringPosition/Order/HistorySummary` | Normalized position/order/history types |
| `HealthStatus` | `HEALTHY \| DEGRADED \| DISCONNECTED \| STALE \| ERROR \| UNKNOWN` |
| `SnapshotStatus` | `SUCCESS \| PARTIAL \| VALIDATION_FAILURE \| PROVIDER_FAILURE \| TIMEOUT \| DISCONNECTED \| UNSUPPORTED_FIELD \| UNKNOWN_ACCOUNT` |
| `ProviderName` | `"MT5" \| "XM" \| "OTHER"` |
| `Retryability` | `RETRYABLE \| NON_RETRYABLE` |

Key design: `MonitoringSnapshot` uses masked login (`accountLoginMasked`) and explicit `provider` field — never contains raw credentials.

### 2. `lib/monitoring/result.ts` — Result/Error Model

| Type | Purpose |
|---|---|
| `MonitoringResult` | Result of a monitoring request (success, status, error, snapshot, accountId) |
| `HealthResult` | Result of health evaluation (health status, reasons, timestamp, dataAgeMs) |
| `HealthReason` | Individual reason for a health status (code, severity, category) |
| `ProviderErrorDetail` | Provider error with code, severity, category, retryability |
| `RetryPolicyConfig` / `RetryResult` | Retry policy configuration and results |

Key design: `HealthReason.category` uses data-quality categories (`FRESH_DATA`, `STALE_DATA`, `MISSING_ACCOUNT`, etc.) — never provider-specific categories.

### 3. `lib/monitoring/adapter.ts` — Abstract Interface

`MT5Adapter` abstract class defines the provider interface:

- `fetchSnapshot(input, options): Promise<ProviderSnapshot>`
- `testConnection(accountId): Promise<{ connected: boolean; message: string }>`
- `disconnect(accountId): Promise<void>`

Any provider (MT5, XM, future) implements this interface. Evaluation depends on this abstraction, not on specific providers.

### 4. `lib/monitoring/mock-adapter.ts` — Deterministic Mock

`MockMT5Adapter` extends `MT5Adapter` and provides deterministic responses based on `MockAccountConfig`:

**Behavior per config flag:**

| Flag | Behavior |
|---|---|
| `healthy: true` (default) | Returns full snapshot with balance=100000, equity=100000 |
| `reducedEquity: true` | equity=5000, balance=10000 |
| `positions: [...]` | Returns specified positions (direction derived from type) |
| `disconnected: true` | Returns null accountInfo, terminalInfo.connected=false |
| `missingData: true` | Returns accountInfo with all fields null (not null itself) |
| `staleData: true` | Timestamp set 10 minutes ago |
| `timeout: true` | Delays 11s then throws "Provider request timed out" |
| `providerError: true` | Returns empty snapshot (null accountInfo) |
| `malformed: true` | Returns malformed snapshot (login as string, casts to proper types) |

**Key properties:**
- Each account has independent state — no sharing between accounts
- `disconnect()` mutates `disconnected` on the config, reflected in subsequent calls
- Unknown accounts return a valid snapshot with null accountInfo

### 5. `lib/monitoring/normalize.ts` — Normalization Layer

`normalizeSnapshot(accountId, accountNumber, provider, raw): NormalizeResult` transforms a `ProviderSnapshot` into a `MonitoringSnapshot`:

**Processing:**
1. Null check on raw response → `NULL_PROVIDER_RESPONSE` error
2. `normalizeAccountInfo()` — extracts/masks login, validates numeric fields
3. `normalizePositions()` — maps type→direction, handles nulls
4. `normalizeOrders()` — maps state→status string, handles nulls
5. `normalizeHistory()` — aggregates deal summary
6. Partial snapshot detection if HIGH/CRITICAL errors found

**Security:**
- Login numbers masked as `[MASKED-12***]` (first 2 digits visible, rest masked)
- Short logins (≤2 digits): `[MASKED-XX***]`
- No raw login numbers appear in output or errors
- Error messages never contain credentials

**Normalization:**
- Direction: `0→BUY`, `1→SELL`, other→null
- Order state: `0→PENDING`, `1→PLACED`, `2→PARTIAL`, `3→FILLED`, `4→CANCELED`, `5→EXPIRED`, other→null

### 6. `lib/monitoring/health.ts` — Health Evaluation

`evaluateHealth(result, config): HealthResult` evaluates a `MonitoringResult` into a health status:

**Evaluation logic:**

| Condition | Health | Reason |
|---|---|---|
| No snapshot | `UNKNOWN` | `NO_SNAPSHOT` (HIGH) |
| Status DISCONNECTED | `DISCONNECTED` | `TERMINAL_DISCONNECTED` (CRITICAL) |
| Status TIMEOUT | `ERROR` | `PROVIDER_TIMEOUT` (HIGH) |
| Status PROVIDER_FAILURE | `ERROR` | `PROVIDER_ERROR` (HIGH) |
| Status VALIDATION_FAILURE | `ERROR` | `INVALID_SNAPSHOT` (HIGH) |
| Critical provider error | `ERROR` | `CRITICAL_PROVIDER_ERROR` (CRITICAL) |
| Stale data (>5min) | `DEGRADED` | `STALE_DATA` (MEDIUM) |
| Unknown account | `DEGRADED` | `UNKNOWN_ACCOUNT` (HIGH) |
| No account data | `DEGRADED` | `NO_ACCOUNT_DATA` (HIGH) |
| Terminal not connected | `DEGRADED` | `TERMINAL_NOT_CONNECTED` (HIGH) |
| Fresh valid data | `HEALTHY` | — |
| PARTIAL status | `DEGRADED` | Override |

**Configuration:**
- `staleDataThresholdMs`: Default 300000 (5 minutes)
- `missingAccountThresholdMs`: Default 600000 (10 minutes)

### 7. `lib/monitoring/retry.ts` — Retry/Timeout Policy

| Function | Purpose |
|---|---|
| `isRetryable(result, policy)` | Determines if an error is retryable based on code, category, or explicit flag |
| `shouldRetry(attempt, result, policy)` | Returns true if attempts remain and error is retryable |
| `getTimeoutMs(attempt, policy)` | Calculates timeout with exponential backoff (base × multiplier^attempt, capped at maxTimeoutMs) |

**Default policy:**
- Max attempts: 3
- Base timeout: 5000ms
- Max timeout: 30000ms
- Backoff multiplier: 2
- Retryable codes: PROVIDER_TIMEOUT, CONNECTION_RESET, PROVIDER_UNAVAILABLE, RATE_LIMIT_EXCEEDED, TEMPORARY_UNAVAILABLE
- Non-retryable codes: INVALID_CREDENTIALS, AUTHENTICATION_FAILED, ACCOUNT_NOT_FOUND, ACCOUNT_DISABLED, INVALID_SNAPSHOT, VALIDATION_FAILURE

---

## Data Flow

```
MockMT5Adapter.fetchSnapshot(input)
    ↓
ProviderSnapshot (raw, may have null/partial data)
    ↓
normalizeSnapshot(accountId, accountNumber, provider, snapshot)
    ↓
NormalizeResult { success, snapshot, accountInfo, errors }
    ↓ (on success)
MonitoringSnapshot → evaluateHealth(result)
    ↓
HealthResult { health, reasons, timestamp, accountId, accountLoginMasked, snapshotAvailable, dataAgeMs }
```

---

## Security Design

| Concern | Mitigation |
|---|---|
| Raw login in output | Masked as `[MASKED-12***]` |
| Credentials in errors | Validation checks for password/credential/secret keywords |
| Provider confusion | Explicit `provider` field on all types |
| Mock vs live confusion | Mock uses `provider: "MT5"` explicitly; live adapters set their own |
| Data tampering | All monitoring types are immutable snapshots; no write paths |

---

## Testing Strategy

| File | Tests | Runner |
|---|---|---|
| `tests/monitoring/health.test.ts` | 8 tests (healthy, degraded, disconnected, error, unknown) | node:test |
| `tests/monitoring/retry.test.ts` | 9 tests (retryable, non-retryable, backoff, cap) | node:test |
| `tests/monitoring/normalize.test.ts` | 11 tests (valid, missing fields, invalid, null, mapping, security) | node:test |
| `tests/monitoring/security.test.ts` | 5 tests (no credentials, masking, mock/live distinction) | node:test |
| `tests/monitoring/mock-adapter.test.ts` | 16 tests (healthy, stale, timeout, error, malformed, multi-account, disconnect) | node:test |
| **Total** | **49 tests** | **node:test + tsx** |

All tests use `node:test` (Node.js built-in) — no vitest dependency required.
All imports use `../../lib/monitoring/` path from `tests/monitoring/`.

---

## Phase 18 E2E Results

| Metric | Result |
|---|---|
| E2E tests | 23/23 PASS (2 consecutive runs) |
| E2E connectivity | BLOCKED — Neon connection pool timeout on Step 7 (3rd run) |
| MT5/XM POC | All methods FAIL (Phase 18 confirmed) |
| Mock adapter | All 16 tests PASS |
| TypeScript | 0 errors |
| ESLint | 0 errors (38 pre-existing warnings) |
| Production build | PASS (Next.js 16.3.5, 21 routes) |

---

## Open Issues

| Issue | Severity | Status |
|---|---|---|
| Neon connection pool timeout on repeated E2E runs | BLOCKED | Unresolved — likely pool exhaustion on `prisma.auditLog.findMany` (limit 13, timeout 10s) during Step 7 |
| No production monitoring against live MT5 | N/A | All MT5/XM connectivity POC methods FAIL — mock is only option until connectivity restored |
| Vitest not available in project | INFO | Tests rewritten using node:test (Node.js built-in) |

---

## Future Enhancement: Retry with Backoff

A production retry mechanism with exponential backoff is a separate future phase. The `retry.ts` module provides the policy and decision functions; actual integration with HTTP requests or DB queries would be implemented when live provider connectivity is available.
