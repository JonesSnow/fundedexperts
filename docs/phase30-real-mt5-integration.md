# Phase 30 — Real MT5 Integration

**Status:** Complete
**Last Updated:** 2026-09-27
**Related:** docs/architecture.md, docs/mt5-poc-results.md

## 1. Summary

Real MT5 connectivity has been established for the monitoring pipeline via `RealMT5Adapter`, a Python subprocess bridge using the official MetaTrader5 package. The adapter connects to a live XM demo account (login 346266128), fetches account data, and maps it to the existing `ProviderSnapshot` type consumed by the rule engine.

No changes were made to the rule engine, monitoring architecture, or API routes. Only the adapter boundary was extended.

## 2. Architecture

### Component Overview

```
┌─────────────────────────────────────────────────┐
│           Worker Process (Node.js)              │
│                                                  │
│  RealMT5Adapter (lib/monitoring/real-mt5-adapter.ts) │
│    • Decrypts AES-256-GCM credentials            │
│    • Spawns Python subprocess via stdin            │
│    • Parses JSON response                          │
│    • Maps to ProviderSnapshot                      │
│                                                  │
│  normalizeSnapshot (lib/monitoring/normalize.ts) │
│    • ProviderSnapshot → MonitoringSnapshot        │
│    • Validates NaN/Infinity/null                  │
│    • Masks account login                          │
│                                                  │
│  Monitoring Pipeline (lib/monitoring-pipeline.ts) │
│    • Feeds snapshot to rule engine                 │
│    • Creates rule events, evaluation outcomes      │
└─────────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│           Python Subprocess                │
│                                            │
│  MetaTrader5 package v5.0.6180            │
│    • mt5.initialize(login, password, server) │
│    • mt5.account_info()                     │
│    • mt5.positions_get()                    │
│    • mt5.orders_get()                       │
│    • mt5.history_deals_get()                │
│    • JSON output to stdout                 │
│    • Credentials via stdin (NOT env/args)  │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│           MT5 Terminal (Windows)           │
│                                            │
│  terminal64.exe @ D:\programs\MetaTrader 5  │
│    • Logged in with XM demo account         │
│    • Connected to XMGlobal-MT5 10 server    │
└────────────────────────────────────────────┘
```

### Security Boundary

1. **Credential storage:** `MT5Account.credentials` field stores AES-256-GCM encrypted JSON `{login, password, server}` using `MT5_ENCRYPTION_KEY`
2. **Credential decryption:** Only occurs in `RealMT5Adapter.decryptCredentials()` — the worker context, never in API routes
3. **Credential transmission to Python:** Encrypted credentials are decrypted and passed as JSON to Python subprocess via `stdin` (NOT as command arguments or environment variables)
4. **No credential logging:** `sanitizeCredentialMessage()` redacts `password=` and `login=` patterns from all error messages; logger's `sanitizeSensitiveValue()` provides additional redaction layer
5. **No credentials in snapshots:** `ProviderSnapshot` and `MonitoringSnapshot` contain only account metadata (balance, equity, positions, etc.) — no passwords

### Adapter Interface

```typescript
// lib/monitoring/adapter.ts
export abstract class MT5Adapter {
  abstract readonly providerName: ProviderName;
  abstract fetchSnapshot(input: AdapterAccountInput, options?: AdapterFetchOptions): Promise<ProviderSnapshot>;
  abstract testConnection(accountId: string): Promise<{ connected: boolean; message: string }>;
  abstract disconnect(accountId: string): Promise<void>;
}
```

### Adapter Factory

```typescript
// lib/monitoring/adapter-factory.ts
export function createMT5Adapter(config?: { mode?: "mock" | "real" | "auto" }): MT5Adapter
```

- `"mock"` (default): Returns `MockMT5Adapter` for testing
- `"real"`: Returns `RealMT5Adapter` for production
- `"auto"`: Returns `RealMT5Adapter` if `MT5_USE_REAL_ADAPTER=true`, otherwise `MockMT5Adapter`

## 3. Implementation Details

### RealMT5Adapter (lib/monitoring/real-mt5-adapter.ts)

The adapter:

1. Decrypts credentials from the encrypted JSON stored in `MT5Account.credentials`
2. Spawns a Python subprocess with `spawn(pythonPath, ["-c", PYTHON_SCRIPT])`
3. Writes credentials JSON to subprocess `stdin`
4. Reads JSON response from `stdout`
5. Maps the response to `ProviderSnapshot` via `mapToProviderSnapshot()`

**MT5 Error Code Mapping:**

| MT5 Code | Mapped Code      | Severity  | Category       | Retryable |
|----------|-----------------|-----------|----------------|-----------|
| 1, 2     | TERMINAL_NOT_RUNNING | CRITICAL | CONNECTION | RETRYABLE |
| 4        | INVALID_CREDENTIALS  | CRITICAL | AUTHENTICATION | NON_RETRYABLE |
| 5        | ACCOUNT_DISABLED     | CRITICAL | PROVIDER | NON_RETRYABLE |
| 6        | SERVER_NOT_FOUND     | CRITICAL | PROVIDER | NON_RETRYABLE |
| 7        | ACCOUNT_NOT_FOUND    | CRITICAL | PROVIDER | NON_RETRYABLE |
| 129, 64  | PROVIDER_TIMEOUT     | HIGH     | TIMEOUT | RETRYABLE |

### Python Script (embedded in PYTHON_SCRIPT constant)

The Python script:

1. Reads credentials from `stdin` as JSON
2. Calls `mt5.initialize(login, password, server, timeout=10000)`
3. Fetches `account_info`, `positions_get`, `orders_get`, `history_deals_get` (last 7 days)
4. Outputs all data as JSON to `stdout`
5. Calls `mt5.shutdown()` before exiting

**Bug fix (commit f3e1950):** The Python script initially used `ai.get("is_demo")` and `ai.get("account_type")` for demo account detection. These fields do not exist in the MetaTrader5 Python API's `account_info` result. The fix uses `ai.get("trade_mode", 0) == 0` to detect demo accounts (where `trade_mode=0` indicates a demo account, `trade_mode=1` indicates a real account).

## 4. Real MT5 Smoke Test Results

**Date:** 2026-09-27

| Operation | Result | Details |
|-----------|--------|---------|
| `testConnection()` | PASS | "MT5 terminal connected successfully" |
| `fetchSnapshot()` | PASS | Login: 346266128, Server: "XMGlobal-MT5 10", Balance: 5000, Equity: 5000, Currency: USD, Leverage: 1000, isDemo: true, Terminal connected: true, Build: 6230 |
| `normalizeSnapshot()` | PASS | success=true, no errors, login masked as "[MASKED-34***]", all numeric values finite |

## 5. Testing

### Test Suite: tests/monitoring/real-mt5-adapter.test.ts

49 tests across 13 describe blocks, all passing:

- **Interface Compliance (7 tests):** Adapter extends `MT5Adapter`, factory modes work correctly
- **Credential Decryption & Security (5 tests):** Decryption works, invalid/missing credentials handled securely, no plaintext in errors, login masking works
- **Credential Error Sanitization (2 tests):** Credential patterns sanitized in error messages, error codes map correctly
- **Data Transformation (5 tests):** Valid output mapped correctly, empty data handled, null account info handled, position types mapped, timestamps converted
- **Error Mapping (13 tests):** All MT5 error codes map correctly, severity/category/retryability mappings verified
- **Timeout Behavior (1 test):** Python process timeout produces `PROVIDER_TIMEOUT` error
- **Connection Failure Handling (2 tests):** Python not found handled, invalid JSON output handled
- **Data Validation (3 tests):** NaN, Infinity, and null values caught during normalization
- **Mock Adapter Regression (2 tests):** Mock adapter still works, both adapters share interface
- **Account Identity Verification (2 tests):** Login and server matching verified
- **Worker Isolation (2 tests):** No credentials stored in adapter instance state
- **Full Evaluation Flow (2 tests):** Snapshot passes through normalizeSnapshot correctly, no credential data in normalized output
- **API Authorization Boundary (3 tests):** Credential decryption not available in API context, encrypted credentials don't contain plaintext, decrypted credentials never logged

### Running Tests

```bash
# Run only the MT5 adapter tests
npm run test:mt5-adapter

# Run the full test suite (requires DATABASE_URL)
npm test
```

## 6. Deployment Requirements

### Prerequisites

1. **Windows host** with MT5 terminal installed at `D:\programs\MetaTrader 5\terminal64.exe`
2. MT5 terminal must be logged in with the XM demo account credentials
3. **Python 3.x** with MetaTrader5 package (`pip install MetaTrader5`)
4. **MT5_ENCRYPTION_KEY** environment variable set (minimum 32 characters for AES-256-GCM)
5. **MT5Account** database record with encrypted credentials for login 346266128

### Environment Variables

```
MT5_ENCRYPTION_KEY=your-32-char-key-here
MT5_USE_REAL_ADAPTER=true  # for "auto" mode to use real adapter
```

### Limitations

- The RealMT5Adapter runs on the same host as the MT5 terminal (Windows-only)
- Python subprocess must be available in the worker's PATH or configured via `pythonPath`
- Default script timeout is 15 seconds (`DEFAULT_SCRIPT_TIMEOUT_MS = 15000`)
- Python script fetches last 7 days of deal history only

## 7. Known Limitations

1. **No E2E pipeline test:** The monitoring pipeline end-to-end flow requires database `MT5Account` records with encrypted credentials for the demo account. No such assignment exists in the database, and per Phase 26 rules, no assignment was fabricated.
2. **Windows-only:** The terminal bridge pattern requires MT5 terminal on Windows. Linux/macOS deployment would require Wine or a Windows VM.
3. **Single account per process:** The Python subprocess initializes with one set of credentials per invocation. Concurrent monitoring of multiple accounts requires parallel subprocess instances.
4. **No terminal auto-start:** If the MT5 terminal is not running, `mt5.initialize()` fails with `TERMINAL_NOT_RUNNING`. The adapter does not attempt to start the terminal.
5. **Python dependency:** The worker process depends on Python 3.x and the MetaTrader5 package being installed on the host machine.

## 8. Related Files

| File | Purpose |
|------|---------|
| `lib/monitoring/adapter.ts` | `MT5Adapter` abstract class — adapter interface contract |
| `lib/monitoring/real-mt5-adapter.ts` | `RealMT5Adapter` — real MT5 subprocess bridge implementation |
| `lib/monitoring/adapter-factory.ts` | `createMT5Adapter()` — factory with mock/real/auto modes |
| `lib/monitoring/monitoring-runner.ts` | `resolveCredentials()` — decrypts `MT5Account.credentials` |
| `lib/monitoring/normalize.ts` | `normalizeSnapshot()` — converts `ProviderSnapshot` → `MonitoringSnapshot` |
| `lib/monitoring/types.ts` | `ProviderSnapshot`, `MonitoringSnapshot`, `ProviderName` types |
| `lib/monitoring/mock-adapter.ts` | `MockMT5Adapter` — mock implementation for testing |
| `lib/monitoring/eligibility.ts` | `evaluateEligibility()` — determines if account can be monitored |
| `lib/monitoring/credential-boundary.ts` | `maskLogin()`, `validateCredentials()`, `ProviderCredentials` types |
| `lib/encryption.ts` | AES-256-GCM `encrypt()`/`decrypt()` functions |
| `tests/monitoring/real-mt5-adapter.test.ts` | 49-test suite for adapter |
| `app/api/monitoring/[accountId]/process/route.ts` | Monitoring API endpoint (admin-only) |
| `prisma/schema.prisma` | MT5Account, AccountAssignment, Evaluation schema |
