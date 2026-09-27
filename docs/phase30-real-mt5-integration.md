# Phase 30: Real MT5 Adapter Integration

## Objective
Connect the existing monitoring system to real MT5 account data via a real MT5
adapter boundary (Python MetaTrader5 subprocess bridge), without rewriting the
rule engine or replacing the monitoring architecture.

## Architecture

The integration follows the existing adapter boundary pattern established in
Phase 29. The `MT5Adapter` abstract class (in `lib/monitoring/adapter.ts`)
defines the contract; the `RealMT5Adapter` (in
`lib/monitoring/real-mt5-adapter.ts`) implements it for production MT5
connectivity via a Python subprocess.

```
┌─────────────────────────────────────────────────────────┐
│                    Monitoring Runner                    │
│         (lib/monitoring/monitoring-runner.ts)           │
│                                                         │
│   ProviderCredentials ───────────────────────────┐      │
│        (decrypted from MT5Account.credentials)    │      │
│                                                         │
│   ┌──────────────────────────────────────────┐        │
│   │         RealMT5Adapter (worker)          │        │
│   │  (lib/monitoring/real-mt5-adapter.ts)    │        │
│   │                                          │        │
│   │  decryptCredentials()                    │        │
│   │       └─ decrypt() / lib/encryption.ts    │        │
│   │                                          │        │
│   │  executePythonBridge()                   │        │
│   │       └─ spawn Python subprocess          │  ◀──┐  │
│   │          (MetaTrader5 package)            │     │  │
│   │                                          │     │  │
│   │  mapToProviderSnapshot()                 │     │  │
│   │       └─ MT5 raw data → ProviderSnapshot  │     │  │
│   │                                          │        │
│   │  mapPythonError()                        │        │
│   │       └─ MT5 error codes → MtnError      │        │
│   │                                          │        │
│   └──────────────────────────────────────────┘        │
│             │                                         │
│             ▼                                         │
│   ┌──────────────────────────────────────────┐        │
│   │         normalizeSnapshot()              │        │
│   │  (lib/monitoring/normalize.ts)           │        │
│   │                                          │        │
│   │  ProviderSnapshot → MonitoringSnapshot    │        │
│   │  + validation (NaN, Infinity, null)       │        │
│   └──────────────────────────────────────────┘        │
│                                                         │
│   ┌──────────────────────────────────────────┐        │
│   │         evaluateEligibility()            │        │
│   │  (lib/monitoring/eligibility.ts)         │        │
│   │                                          │        │
│   │  MonitoringSnapshot → EligibilityResult │        │
│   └──────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

## Adapter Interface

Defined in `lib/monitoring/adapter.ts`:

```typescript
export abstract class MT5Adapter {
  abstract fetchSnapshot(input: AdapterAccountInput, options?: AdapterFetchOptions): Promise<ProviderSnapshot>;
  abstract testConnection(): Promise<{ connected: boolean; message: string }>;
  abstract disconnect(): Promise<void>;
}
```

The `RealMT5Adapter` extends this interface. Both adapters share the same
contract, so switching between mock and real modes is configuration-only.

## Factory Pattern

`lib/monitoring/adapter-factory.ts` provides `createMT5Adapter()`:

```typescript
createMT5Adapter({ mode: "auto" })  // Picks real if MT5_ENCRYPTION_KEY + credentials available
createMT5Adapter({ mode: "real" })   // Forces real adapter
createMT5Adapter({ mode: "mock" })   // Forces mock adapter (default)
```

## Credential Handling

Credentials are stored encrypted in the `MT5Account` Prisma model:

| Field | Description |
|---|---|
| `credentials` (String) | AES-256-GCM encrypted JSON `{login, password, server}` |
| `login` (String) | Plaintext MT5 login number (for identity verification) |
| `server` (String) | Server name (for identity verification) |
| `accountNumber` (String) | Account display number |

### Decryption Flow

1. `monitoring-runner.ts` calls `resolveCredentials(account)` which decrypts
   `account.credentials` using `decrypt()` from `lib/encryption.ts`
2. The decrypted credentials are passed to `adapter.fetchSnapshot()` as
   `ProviderCredentials` (providerType, server, login, password)
3. `RealMT5Adapter.fetchSnapshot()` calls `decryptCredentials()` to parse the
   JSON and build `Mt5Credentials`
4. Credentials are passed to the Python subprocess via stdin (never as
   command-line arguments to avoid process list exposure)
5. `sanitizeCredentialMessage()` redacts password-like and login-like patterns
   in any error messages

### Security Properties

- Credentials are decrypted ONLY in worker context (inside the adapter)
- No credentials appear in logs
- No credentials in `ProviderSnapshot` output
- `MT5_ENCRYPTION_KEY` (64-char hex) required for decryption
- `sanitizeCredentialMessage()` redacts patterns like `password=...` and
  `login=...`

## Python Subprocess Bridge

The Python script is embedded as a string in `real-mt5-adapter.ts`
(`pythonScript` property). It uses the `MetaTrader5` Python package:

1. Reads credentials JSON from stdin
2. Calls `mt5.initialize()` with login, password, server
3. Fetches:
   - `account_info()` — account balance, equity, margin, etc.
   - `positions_get()` — open positions
   - `orders_get()` — active orders
   - `history_deals_get()` — deal history
4. Outputs JSON via stdout

### MT5 Error Code Mapping

| MT5 Code | Error Name | Mapped Code | Retryable | Severity | Category |
|---|---|---|---|---|---|
| 2 | TERMINAL_NOT_RUNNING | TERMINAL_NOT_RUNNING | RETRYABLE | HIGH | INFRASTRUCTURE |
| 4 | INVALID_CREDENTIALS | INVALID_CREDENTIALS | NON_RETRYABLE | CRITICAL | AUTHENTICATION |
| 5 | ACCOUNT_DISABLED | ACCOUNT_DISABLED | NON_RETRYABLE | CRITICAL | ACCOUNT |
| 6 | SERVER_NOT_FOUND | SERVER_NOT_FOUND | RETRYABLE | HIGH | INFRASTRUCTURE |
| 7 | ACCOUNT_NOT_FOUND | ACCOUNT_NOT_FOUND | NON_RETRYABLE | CRITICAL | ACCOUNT |
| 129 | PROVIDER_TIMEOUT | PROVIDER_TIMEOUT | RETRYABLE | HIGH | TIMEOUT |
| N/A | MT5_PACKAGE_NOT_FOUND | TERMINAL_NOT_INSTALLED | RETRYABLE | HIGH | INFRASTRUCTURE |
| N/A | INITIALIZATION_FAILED | INITIALIZATION_FAILED | RETRYABLE | HIGH | INFRASTRUCTURE |

## Data Transformation

`mapToProviderSnapshot()` converts the Python output (`Mt5PythonResult`) to
`ProviderSnapshot`:

- `Mt5RawAccountInfo` → `ProviderAccountInfo` (with type coercion)
- `Mt5RawPosition` → `ProviderPosition` (numeric type preserved)
- `Mt5RawOrder` → `ProviderOrder` (state stays numeric, normalized later)
- `Mt5RawHistoryDeal` → `ProviderDeal`
- Unix timestamp → `Date` object

## Normalization & Validation

`normalizeSnapshot()` in `lib/monitoring/normalize.ts` validates and converts
`ProviderSnapshot` to `MonitoringSnapshot`:

- NaN and Infinity values are detected and flagged as errors
- Null account info triggers `CRITICAL` severity error
- Position types are normalized (0=BUY, 1=SELL) via `normalizeDirection()`
- Order states are normalized (0=PENDING, 1=PLACED, etc.)

## Testing Strategy

49 tests in `tests/monitoring/real-mt5-adapter.test.ts` covering:

| Category | Tests |
|---|---|
| Interface Compliance | 1-7 |
| Credential Decryption & Security | 8-12 |
| Credential Error Sanitization | 13-14 |
| Data Transformation | 15-19 |
| Error Mapping | 20-32 |
| Timeout Behavior | 33 |
| Connection Failure Handling | 34-35 |
| Data Validation | 36-38 |
| Mock Adapter Regression | 39-40 |
| Account Identity Verification | 41-42 |
| Worker Isolation | 43-44 |
| Full Evaluation Flow | 45-46 |
| API Authorization Boundary | 47-49 |

Run tests:
```bash
npx tsx tests/monitoring/real-mt5-adapter.test.ts
```

## Deployment Requirements

For real MT5 connectivity to work in production:

1. Install Python 3 with MetaTrader5 package: `pip install MetaTrader5`
2. Set environment variables:
   - `MT5_ENCRYPTION_KEY`: 64-character hex string for credential encryption
   - `DATABASE_URL`: PostgreSQL connection string (for account lookup)
3. MT5 terminal must be installed and running on the host
4. XM demo or live credentials stored encrypted in `MT5Account.credentials`
5. Worker process must have access to the MT5 terminal's API port

## Known Limitations

1. **No live MT5 smoke test**: Cannot connect to real MT5 terminal — terminal
   is not logged in, and no XM demo credentials are available in the
   environment. The adapter is structurally complete but unverified against a
   live MT5 instance.
2. **Python availability**: The adapter assumes `python` is on PATH. In the
   test environment, Python was available (test 34 verifies graceful failure
   when Python is not found).
3. **MT5 terminal dependency**: The Python `MetaTrader5` package requires the
   MT5 terminal to be installed and running. Without it, error code 2
   (TERMINAL_NOT_RUNNING) or 6 (SERVER_NOT_FOUND) will be returned.
4. **Subprocess isolation**: Each snapshot fetch spawns a new Python process.
   For high-frequency polling, this may cause performance overhead. Future
   optimization could persist the Python process (connection pooling) if needed.
5. **Windows-specific**: The subprocess spawning is tested on Windows. The
   adapter uses `spawn` which is cross-platform, but MT5 terminal integration
   is Windows-only.

## Files Changed

| File | Change |
|---|---|
| `lib/monitoring/real-mt5-adapter.ts` | RealMT5Adapter implementation (new) |
| `lib/monitoring/adapter-factory.ts` | `createMT5Adapter()` factory (new) |
| `lib/monitoring/monitoring-runner.ts` | `resolveCredentials()` function |
| `lib/monitoring/normalize.ts` | Added Infinity checks, CRITICAL severity for null account |
| `tests/monitoring/real-mt5-adapter.test.ts` | 49 tests (new) |
| `docs/phase30-real-mt5-integration.md` | This documentation (new) |
