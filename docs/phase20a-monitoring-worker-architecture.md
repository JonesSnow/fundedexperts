# Phase 20A — Monitoring Worker Architecture & Security Boundary Review

**Date:** 2026-09-21
**Phase:** 20A
**Overall Status:** DESIGN ONLY — Architecture Reviewed, Not Implemented
**Classification:** Architecture review and security boundary design for future MT5 monitoring worker

---

## 1. Objective

Review and design the architecture required for a secure, reliable MT5 monitoring worker. This phase is preparation for future live MT5/XM integration.

The following remain BLOCKED:
- Authorized XM credentials
- Live MT5 connectivity
- Runtime broker compatibility
- Real terminal session validation

This phase does NOT implement the complete production monitoring worker. It designs the architecture, security boundary, and operational model required before implementation.

---

## 2. Scope and Non-Goals

### In Scope
- Worker boundary design and security review
- Credential encryption/decryption boundary
- Worker process model for Windows
- Monitoring scheduler design
- Snapshot persistence decision
- Account ownership and authorization review
- Failure recovery design
- Audit and evidence design
- Observability and logging design
- Testing strategy
- Database and migration policy

### Out of Scope
- Full production monitoring worker implementation
- Live MT5/XM connectivity
- Real broker compatibility testing
- Trading or account write operations
- Production deployment
- Rule engine implementation (monitoring/rule separation boundary only)

---

## 3. Existing Baseline

### 3.1 Current State

| Component | Status | Notes |
|---|---|---|
| Prisma schema | Valid | PostgreSQL via Neon |
| TypeScript | 0 errors | `tsc --noEmit` clean |
| ESLint | 0 errors | Pre-existing warnings only |
| Next.js build | Pass | 21 routes |
| Monitoring types | Implemented | `lib/monitoring/` (7 modules, 5 test files, 49 tests) |
| Encryption | Implemented | `lib/encryption.ts` (AES-256-GCM) |
| Allocation | Implemented | `lib/allocation.ts` (transaction + evaluation linking) |
| Release | Implemented | `lib/release.ts` (6 reasons, transaction-based) |
| MT5 Adapter | Implemented | `lib/monitoring/adapter.ts` (abstract) |
| Mock Adapter | Implemented | `lib/monitoring/mock-adapter.ts` (deterministic) |
| Normalization | Implemented | `lib/monitoring/normalize.ts` |
| Health Evaluation | Implemented | `lib/monitoring/health.ts` |
| Retry Policy | Implemented | `lib/monitoring/retry.ts` |
| POC Bridge | Read-only | `poc-mt5-bridge/poc_bridge.py` (no write methods) |
| Live MT5 | BLOCKED | No credentials, no terminal session |

### 3.2 Key Models (from prisma/schema.prisma)

| Model | Key Fields | Relevance |
|---|---|---|
| `MT5Account` | id, accountNumber, broker, server, login, status, healthStatus, credentials, lastHealthCheck | Target of monitoring |
| `AccountAssignment` | traderId, accountId, status, assignedAt, returnedAt | Ownership |
| `Evaluation` | traderId, rulesetVersionId, accountId, status, totalPnl, maxDrawdown | Evaluation context |
| `FundedAccount` | traderId, accountId, rulesetVersionId, status | Funded state |
| `AuditLog` | action, entityType, entityId, performedBy, details, timestamp | Audit trail |
| `RuleEvent` | accountId, eventType, severity, message, occurredAt, acknowledged | Rule violations |
| `Trader` | id, email, role, status | Authorization |

### 3.3 Existing Authorization Patterns

- All API routes use `getAuthenticatedUser()` which validates JWT session and trader status
- MT5Account admin routes require `role === "ADMIN"`
- Trader routes use trader ID from session (`session.sub`)
- Credentials are omitted from API responses via `omitCredentials()`
- `lib/encryption.ts` explicitly forbids decryption from API routes

---

## 4. Proposed Architecture

### 4.1 Component Separation

```
┌──────────────────┐
│  Web Application │  (Next.js API routes, admin/dashboard)
└────────┬─────────┘
         │ HTTP/REST (authenticated)
         ▼
┌──────────────────┐
│  Database        │  (Neon PostgreSQL)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────────┐
│  Monitoring      │────▶│  Scheduler           │
│  Scheduler       │     │  (cron/interval)     │
└────────┬─────────┘     └──────────────────────┘
         │ triggers job
         ▼
┌──────────────────┐
│  Monitoring      │  (isolated worker process)
│  Worker          │
└────────┬─────────┘
         │
         │ credential decryption boundary
         ▼
┌──────────────────┐     ┌──────────────────────┐
│  Credential      │────▶│  MT5 Terminal/Bridge │  (terminal64.exe)
│  Store (encrypted│     │  (MT5 Python bridge) │
│  in DB)          │     └──────────────────────┘
└──────────────────┘
         │ read-only data
         ▼
┌──────────────────┐
│  Normalization   │  (ProviderSnapshot → MonitoringSnapshot)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Health/Risk     │  (evaluateHealth, risk calculations)
│  Evaluation      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────────┐
│  Audit/Events    │────▶│  Database Write      │  (safe metadata only)
│  Boundary        │     │  (AuditLog, events)  │
└──────────────────┘     └──────────────────────┘
```

### 4.2 Flow Description

```
Database account record (MT5Account with encrypted credentials)
    ↓ authorized scheduler selects eligible accounts
Monitoring Scheduler (determines what to check, when)
    ↓ triggers job with account reference
Isolated Monitoring Worker (separate process, no API access)
    ↓ retrieves encrypted credentials from DB
Credential Retrieval/Decryption Boundary (credentials NEVER leave worker)
    ↓ decrypted credentials used only in worker memory
MT5 Terminal/Bridge (terminal64.exe via Python MT5 bridge)
    ↓ read-only account data (positions, orders, account info)
Normalization (ProviderSnapshot → MonitoringSnapshot, login masked)
    ↓
Health/Risk Calculations (evaluateHealth, rule evaluation triggers)
    ↓
Validated Monitoring Result (safe, no credentials)
    ↓ Audit/Event Boundary (safe metadata only)
Database/Event Write (AuditLog, RuleEvent, MT5Account.healthStatus)
```

### 4.3 Boundary Analysis

| Boundary | Input | Output | Auth | Failure | Logging | Secret Risk | Verification |
|---|---|---|---|---|---|---|---|
| Web → DB | API request | Query result | JWT + role | 401/403/500 | Request ID, route | LOW (no creds in routes) | Runtime-verified |
| Scheduler → Worker | Account ID, schedule | Job accepted | Worker token | Job queued | Job ID, time | LOW | Design-only |
| Worker → Credential DB | Account ID | Encrypted credentials | Worker auth | Retry/fail | Job ID (no creds) | CRITICAL (decryption point) | Design-only |
| Worker → MT5 Terminal | Decrypted credentials | ProviderSnapshot | N/A | Timeout/disconnect | Terminal state | HIGH (creds in memory) | Design-only |
| Normalization → Health | Normalized snapshot | HealthResult | N/A | Data error | N/A | LOW | Runtime-verified (mock) |
| Worker → Audit DB | Safe event metadata | Audit record | Worker auth | Fail/retry | Event ID | LOW | Design-only |
| Worker → Web | Monitoring results | API response | JWT + role | 401/403 | Request ID | LOW | Design-only |

---

## 5. Credential Security Boundary

### 5.1 Current Encryption Implementation

`lib/encryption.ts` implements AES-256-GCM encryption with the following properties:

| Property | Detail |
|---|---|
| Algorithm | AES-256-GCM |
| Key derivation | scrypt (master key → data key per record with random salt) |
| Key source | `MT5_ENCRYPTION_KEY` environment variable (≥32 chars) |
| Salt | 16 bytes random per encryption |
| IV | 12 bytes random per encryption |
| Auth tag | 16 bytes per encryption |
| Encrypted format | base64(salt + iv + authTag + ciphertext) |

### 5.2 Current State Assessment

| Item | Status | Classification |
|---|---|---|
| Encryption on write | Implemented | Implemented |
| Decryption function exists | Implemented | Implemented (in lib/encryption.ts) |
| Decryption called from API routes | Never | Verified: `lib/encryption.ts` docstring forbids it |
| `omitCredentials()` in API routes | Implemented | Implemented |
| `MT5_ENCRYPTION_KEY` in .env.local | Set | Source-verified |
| Key rotation mechanism | Not implemented | Design-only |
| Credential revocation mechanism | Not implemented | Design-only |
| Decryption in isolated worker | Not yet implemented | Design-only |
| Worker existence | Not yet implemented | Design-only |
| Runtime verification of boundary | Not yet possible | Runtime-unverified |

### 5.3 Decryption Boundary Design

**Rule:** Decryption occurs ONLY inside the isolated monitoring worker. No other component may call `decrypt()`.

Proposed flow:
1. Worker starts job for account X
2. Worker queries DB for encrypted credentials (MT5Account.credentials)
3. Worker calls `decrypt(credentials)` in worker memory only
4. Decrypted credentials used to initialize MT5 terminal bridge
5. Decrypted credentials exist only in worker process memory (no cache, no logging)
6. On job completion, credentials remain in memory until worker process terminates
7. Worker process termination clears memory (OS handles)

### 5.4 Security Rules for the Boundary

| Rule | Enforcement | Classification |
|---|---|---|
| No `decrypt()` in API route handlers | Code review + docstring warning | Source-verified |
| No decrypted credentials in logs | Worker code must not log them | Design-only |
| No decrypted credentials in API responses | API routes never see decrypted values | Design-only |
| No plaintext credential cache | Worker must not persist decrypted values | Design-only |
| No decrypted credentials in snapshots | MonitoringSnapshot has no credential field | Implemented (by design) |
| Encryption key not in source code | .env.local is gitignored | Source-verified |
| Missing key → reject | `getMasterKey()` throws Error | Implemented |
| Invalid key → fail | Auth tag verification fails on decrypt | Implemented |
| Key rotation | Requires re-encryption of all records | Design-only |
| Credential revocation | Delete MT5Account.credentials, re-encrypt | Design-only |

### 5.5 Security Risks

- **CRITICAL:** If `decrypt()` is accidentally called from an API route, plaintext credentials would be exposed. This is prevented by code review and documentation, but not by code-level enforcement (no runtime guard).
- **MEDIUM:** Worker process crash while credentials are in memory could potentially expose them via memory dump. Mitigation: minimize credential lifetime in memory, use secure memory where possible.
- **MEDIUM:** No key rotation mechanism exists. If the key is compromised, all encrypted credentials must be re-encrypted.

---

## 6. Worker Process Model

### 6.1 Options Evaluated

| Option | Isolation | Crash Recovery | Credential Exposure | Terminal Lifecycle | Resources | Logging | Concurrency | Complexity | Windows |
|---|---|---|---|---|---|---|---|---|---|
| One worker per terminal | HIGH | MEDIUM | LOW (isolated) | Per-worker | HIGH per account | Per-worker | Limited by processes | HIGH | Requires multi-process mgmt |
| Shared worker, isolated sessions | MEDIUM | MEDIUM | MEDIUM | Shared | LOW | Central | HIGH | MEDIUM | Complex session mgmt |
| Separate service + scheduler | HIGH | HIGH | LOW | Decoupled | MEDIUM | Structured | HIGH | HIGH | Requires service setup |
| Node.js + Python bridge | MEDIUM | LOW | MEDIUM | Via Python | MEDIUM | Split | MEDIUM | HIGH | Python process mgmt |
| Windows service | HIGH | HIGH | LOW | Service-based | MEDIUM | Event log | HIGH | HIGH | Windows-specific |

### 6.2 Provisional Selection: Separate Scheduler + Node.js Worker + Python MT5 Bridge

**Architecture:**
1. **Scheduler** (Node.js, future service): Runs on schedule, selects eligible accounts, prevents duplicates, dispatches jobs
2. **Worker** (Node.js, future process): Receives job, decrypts credentials, manages terminal bridge, runs normalization/health, reports results
3. **MT5 Bridge** (Python subprocess, per-worker): `poc-mt5-bridge/poc_bridge.py` pattern, one per worker

**Why selected:**
- Clear separation between scheduling logic and terminal interaction
- Each worker can be restarted independently
- Python bridge can be killed/restarted without affecting Node worker
- Credentials exist only in Node worker memory, passed to Python bridge as needed (not persisted)
- Scheduler can detect worker crashes and re-dispatch

**What remains unverified:**
- Process crash recovery (design-only, no runtime test)
- Terminal lifecycle management (no live terminal to test)
- Credential exposure prevention under crash (no worker exists)
- Concurrent account monitoring performance (no load test)
- Windows service compatibility (not tested on Windows service host)

### 6.3 Process Lifecycle

```
Scheduler dispatches job → Worker starts → Worker decrypts creds → Worker starts Python bridge →
Worker runs checks → Worker reports results → Worker clears creds → Worker exits

Crash scenarios:
- Worker crash before completion → Scheduler detects missing completion → Re-dispatches
- Worker crash during check → Terminal bridge killed → Account marked for retry
- Python bridge crash → Worker detects exit code → Retry or fail with safe error
- Scheduler crash → Jobs remain in pending state → Recovered on scheduler restart
```

---

## 7. Scheduler Design

### 7.1 Design (No Database Tables Proposed)

The scheduler uses existing models. No new tables are proposed in this phase.

**Job tracking** uses a proposed new approach: leverage `RuleEvent` for monitoring events and `MT5Account.lastHealthCheck` for scheduling context. If formal job tracking is needed in a future phase, a new `MonitoringJob` table would be justified.

### 7.2 Scheduler Responsibilities

| Responsibility | Mechanism | Verification |
|---|---|---|
| Select eligible accounts | Query MT5Account where healthStatus IN (DISCONNECTED, ERROR) and status IN (AVAILABLE, IN_USE) | Design-only |
| Avoid duplicate active jobs | Track running jobs in memory or DB flag | Design-only |
| Prevent overlapping checks | Account-level lock using MT5Account.lastHealthCheck timestamp | Design-only |
| Respect account status | Skip SUSPENDED/INACTIVE trader accounts | Design-only |
| Handle disabled/inactive | Skip accounts with trader status INACTIVE/SUSPENDED | Design-only |
| Retry temporary failures | Exponential backoff via retry.ts policy | Design-only |
| Record job start/end | AuditLog entries (MONITORING_STARTED/SUCCEEDED/FAILED) | Design-only |
| Prevent unbounded retries | Max 3 attempts per policy, then mark as PERMANENT_FAILURE | Design-only |
| Handle worker crashes | Scheduler detects missing completion within timeout, re-dispatches | Design-only |
| Support future intervals | Configurable interval per account (future enhancement) | Design-only |

### 7.3 Job Identifier Design

If formal job tracking is added:

| Field | Type | Purpose |
|---|---|---|
| id | String (uuid) | Job identifier |
| accountId | String | Account reference |
| attemptNumber | Int | Current attempt |
| startedAt | DateTime | Start timestamp |
| completedAt | DateTime? | Completion timestamp |
| timeoutState | Enum | PENDING/RUNNING/TIMEOUT/COMPLETED/FAILED |
| retryState | Json? | Retry history |
| workerIdentity | String? | Worker that processed |
| safeErrorCode | String? | Safe error (no creds) |

### 7.4 Idempotency Requirements

- Same account + same attempt = same result (idempotent)
- Duplicate job detection by account + status flag
- Re-run after crash produces same result as initial run
- Audit events are append-only (cannot be silently rewritten)

---

## 8. Snapshot Persistence Decision

### 8.1 Options Evaluated

| Option | Storage | DB Growth | Query Perf | Audit | Privacy | Debugging | Recovery | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|
| A. Current state only | 1 row/account | MINIMAL | FAST | LOW | HIGH | LOW | LOW | NONE | Insufficient |
| B. Every snapshot | Every check | HIGH | SLOW | HIGH | LOW | HIGH | HIGH | HIGH | Excessive |
| C. Periodic + events | Periodic + events | MEDIUM | MEDIUM | HIGH | MEDIUM | MEDIUM | MEDIUM | MEDIUM | **Selected** |
| D. Violations only | Minimal | MINIMAL | FAST | LOW | HIGH | LOW | LOW | LOW | Insufficient |

### 8.2 Provisional Selection: C — Periodic Snapshots Plus Events

**Design:**
- Store current state in `MT5Account` (healthStatus, lastHealthCheck, balance, equity, etc.)
- Store significant events in `AuditLog` (MONITORING_SUCCEEDED, MONITORING_FAILED, CONNECTION_LOST, etc.)
- Store `RuleEvent` for violations
- If periodic snapshots are needed: store in a future `MonitoringSnapshot` table (not proposed now)

### 8.3 What Must Be Decided Before Production

1. **Snapshot frequency**: How often to store full snapshots vs. only changes
2. **Retention policy**: How long to retain historical snapshots
3. **Snapshot table design**: If full snapshots are needed, what schema
4. **Indexing strategy**: How to query historical snapshots efficiently
5. **Storage cost**: Expected DB growth at various frequencies
6. **Business requirement**: Whether financial evidence requires full history

---

## 9. Account Ownership and Authorization

### 9.1 Existing Authorization Rules

| Rule | Implementation | Status |
|---|---|---|
| Trader accesses only own data | `WHERE traderId = session.sub` in queries | Runtime-verified |
| Admin access is role-controlled | `role === "ADMIN"` checks in API routes | Runtime-verified |
| Monitoring results cannot be reassigned silently | AuditLog + AccountAssignment status transitions | Runtime-verified |
| Account release doesn't expose previous data | `releaseAccount()` preserves history, releases assignment | Runtime-verified |
| Evaluation/funded account consistency | `evaluationLinked` flag, transaction safety | Runtime-verified |
| Audit events cannot be edited via routes | AuditLog has no UPDATE route; append-only | Source-verified |
| Worker operations cannot bypass ownership | Worker would use accountId directly; ownership checked in scheduler | Design-only |

### 9.2 Monitoring-Specific Authorization

| Action | Required Role | Verification | Notes |
|---|---|---|---|
| View monitoring results | TRADER (own) / ADMIN (all) | Design-only | Would use same patterns as existing routes |
| Trigger manual check | ADMIN | Design-only | Admin-only operation |
| Configure monitoring interval | ADMIN | Design-only | Admin-only operation |
| View audit events for monitoring | TRADER (own) / ADMIN (all) | Design-only | Uses existing AuditLog patterns |
| Worker dispatches check | N/A (service) | Design-only | Worker has no trader identity; uses account reference |

### 9.3 Critical Distinction

Worker-level access is NOT equivalent to trader-level access. The worker operates on account references only — it has no trader identity. All data the worker produces must be filtered by ownership when accessed through API routes.

---

## 10. Failure Recovery Design

### 10.1 Failure Catalog

| Failure | Category | Retryable | Max Retry | Safe Log | State Impact | Audit | Operator Action | Recovery |
|---|---|---|---|---|---|---|---|---|
| Terminal not installed | INFRASTRUCTURE | NO | 0 | Terminal path check | Account marked ERROR | MONITORING_FAILED | Install terminal | Manual |
| Terminal not running | INFRASTRUCTURE | YES | 3 | Terminal status check | Account marked ERROR | MONITORING_FAILED | Start terminal | Auto-retry |
| Terminal disconnected | CONNECTION | YES | 3 | Disconnect event | Account marked ERROR | CONNECTION_LOST | Reconnect | Auto-retry |
| Initialization timeout | CONNECTION | YES | 3 | Timeout error code | Account marked ERROR | MONITORING_FAILED | Restart bridge | Auto-retry |
| Invalid credentials | AUTH | NO | 0 | "Invalid credentials" | Account marked ERROR | MONITORING_FAILED | Update credentials | Manual |
| Incorrect server | CONNECTION | NO | 0 | "Wrong server" | Account marked ERROR | MONITORING_FAILED | Update server | Manual |
| Missing account | DATA | NO | 0 | "Account not found" | Account marked ERROR | MONITORING_FAILED | Create account | Manual |
| Account status changed | STATE | NO | 0 | Status check | No change | MONITORING_FAILED | Review | Manual |
| Worker crash | INFRASTRUCTURE | YES | 3 | Crash event | Pending recovery | RECOVERY_STARTED | Restart worker | Auto |
| Stale snapshot | DATA | YES | 1 | "Stale snapshot" | Account marked STALE | MONITORING_FAILED | Re-check | Auto-retry |
| Database unavailable | INFRASTRUCTURE | YES | 3 | DB error code | Deferred | MONITORING_FAILED | Fix DB | Auto-retry |
| Decryption failure | SECURITY | NO | 0 | "Decryption failed" | No change | MONITORING_FAILED | Key rotation | Manual |
| Partial provider response | DATA | YES | 2 | "Partial data" | Account marked DEGRADED | MONITORING_PARTIAL | Re-check | Auto-retry |
| Repeated provider failure | CONNECTION | YES | 3 | Error code | Account marked ERROR | MONITORING_FAILED | Investigate | Auto-retry |

### 10.2 Key Principles

- **No account is suspended** solely due to one monitoring failure
- **No trader outcome is altered** based on unverified monitoring data
- **All failures are audited** with safe metadata (no credentials)
- **Temporary failures auto-recover** within bounded time
- **Permanent failures require manual intervention**

---

## 11. Audit and Evidence Design

### 11.1 Existing AuditLog Behavior

`AuditLog` currently supports:
- Action: AuditAction enum (38 values, no monitoring actions yet)
- Entity type and ID
- Performed by (trader ID)
- Details (JSON)
- Timestamp

### 11.2 Proposed Monitoring Audit Events

| Event | Type | Entity | Contains | Credentials |
|---|---|---|---|---|
| MONITORING_STARTED | AuditAction | MT5Account | Job ID, worker ID, masked login | NO |
| MONITORING_SUCCEEDED | AuditAction | MT5Account | Duration, snapshot hash, health | NO |
| MONITORING_FAILED | AuditAction | MT5Account | Error code, attempt, timeout | NO |
| CONNECTION_LOST | AuditAction | MT5Account | Terminal state, duration | NO |
| CONNECTION_RESTORED | AuditAction | MT5Account | Duration disconnected | NO |
| SNAPSHOT_REJECTED | AuditAction | MT5Account | Rejection reason, validation | NO |
| ACCOUNT_MARKED_STALE | AuditAction | MT5Account | Data age, threshold | NO |
| RULE_EVALUATION_TRIGGERED | AuditAction | MT5Account | Rule set reference | NO |
| WORKER_TERMINATED | AuditAction | MT5Account | Worker ID, termination reason | NO |
| RECOVERY_STARTED | AuditAction | MT5Account | Failure type, attempt | NO |
| RECOVERY_SUCCEEDED | AuditAction | MT5Account | Recovery duration | NO |
| RECOVERY_FAILED | AuditAction | MT5Account | Failure reason, final attempt | NO |

### 11.3 Audit Requirements

| Requirement | Status | Notes |
|---|---|---|
| No credentials logged | Design-only | All audit entries exclude credentials |
| Safe references only | Design-only | Use account ID, masked login, error codes |
| Events cannot be silently rewritten | Source-verified | AuditLog has no UPDATE API route |
| Cleanup doesn't delete audit | Design-only | E2E cleanup uses specific IDs |
| Mock vs live distinction | Design-only | Add source field to event type |

### 11.4 Schema Sufficiency

The existing `AuditLog` schema is sufficient for monitoring events. The `details` JSON field can accommodate all proposed event types without schema changes.

---

## 12. Monitoring/Rule Engine Separation

### 12.1 Separation Boundary

```
┌────────────────────┐
│ Data Retrieval     │  (MT5 terminal → raw data)
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Normalization      │  (raw → MonitoringSnapshot)
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Account Health     │  (evaluateHealth: HEALTHY/DEGRADED/ERROR)
└────────┬───────────┘
         │
         │ SAFE EVENTS ONLY
         ▼
┌────────────────────┐
│ Rule Calculation   │  (future: rule evaluation against MonitoringSnapshot)
└────────┬───────────┘
         │
         │ PASS/FAIL/WARNING
         ▼
┌────────────────────┐
│ Violation Evidence │  (RuleEvent, AuditLog)
└────────┬───────────┘
         │
         │ VALIDATED STATE CHANGE
         ▼
┌────────────────────┐
│ Evaluation State   │  (Evaluation status update)
└────────────────────┘
```

### 12.2 Monitoring Responsibilities (In Scope)
1. Data retrieval from MT5 terminal (read-only)
2. Data normalization and validation
3. Account health status calculation
4. Safe event generation (MONITORING_* events)
5. Data freshness tracking
6. Connection lifecycle management

### 12.3 Rule Engine Responsibilities (Out of Scope)
1. Profit target evaluation
2. Drawdown limit enforcement
3. Trading hours validation
4. Minimum/maximum trade counting
5. Daily loss tracking
6. Prohibited strategy detection
7. Evaluation pass/fail decision
8. Trader notification

### 12.4 Critical Boundary Rule

Monitoring provides validated data and safe events. It does NOT make trading rule conclusions. Rule enforcement is a separate system that consumes monitoring data.

**Do NOT infer** daily loss, maximum loss, prohibited strategies, or evaluation failure from monitoring data alone. These require validated evaluation context.

---

## 13. Observability and Logging

### 13.1 Safe Structured Log Schema

| Field | Type | Purpose | Sensitive? |
|---|---|---|---|
| workerId | String | Worker identity | NO |
| jobId | String | Job identifier | NO |
| accountId | String | Internal reference | NO |
| accountLoginMasked | String | Masked login | NO |
| startedAt | DateTime | Start timestamp | NO |
| completedAt | DateTime | End timestamp | NO |
| durationMs | Number | Duration | NO |
| status | Enum | PENDING/RUNNING/COMPLETED/FAILED | NO |
| errorCode | String | Safe error code | NO |
| retryAttempt | Number | Current attempt | NO |
| dataAgeMs | Number | Data freshness | NO |
| providerCategory | String | Provider type | NO |
| logLevel | String | Severity | NO |
| correlationId | String | Request tracing | NO |
| message | String | Human-readable | NO |

### 13.2 Never Log

| Forbidden | Reason |
|---|---|
| Passwords | Credential exposure |
| Encryption keys | Security breach |
| Full credentials | Security breach |
| Raw sensitive provider responses | Privacy violation |
| Unredacted private account info | Privacy violation |
| Decrypted values | Security breach |

### 13.3 Observability Design (Not Implemented)

| Feature | Status | Notes |
|---|---|---|
| Log retention | Design-only | Define retention per log level |
| Log severity levels | Design-only | DEBUG/INFO/WARN/ERROR |
| Correlation IDs | Design-only | Trace across worker/scheduler |
| Error aggregation | Design-only | Group by error code |
| Monitoring alerts | Design-only | Alert on repeated failures |

### 13.4 Classification

All observability features are **Design-only** — only the log schema is designed; no implementation exists.

---

## 14. Database and Migration Policy

### 14.1 Schema Changes Proposed

**No schema changes proposed in Phase 20A.** The existing schema is sufficient for the designed architecture.

If formal job tracking is needed in a future phase:

**Proposed table: `MonitoringJob`** (requires justification)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | String | @id @default(uuid()) | Job ID |
| accountId | String | @index | Account reference |
| status | Enum | NOT NULL | PENDING/RUNNING/COMPLETED/FAILED/TIMEOUT |
| attemptNumber | Int | DEFAULT 1 | Current attempt |
| startedAt | DateTime | NOT NULL | Start time |
| completedAt | DateTime? | | End time |
| timeoutAt | DateTime? | | Timeout deadline |
| workerIdentity | String? | | Worker that processed |
| safeErrorCode | String? | | Safe error code |
| resultSummary | Json? | | Safe result summary |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | @updatedAt | |

**Migration safety:** Additive only. No existing data modified. Backfill not required.

### 14.2 Why No Changes Now

1. Monitoring worker doesn't exist yet
2. Job tracking can use memory initially
3. `RuleEvent` and `AuditLog` can cover event needs temporarily
4. `MT5Account.lastHealthCheck` provides basic scheduling context
5. Schema changes without a running worker are speculative

### 14.3 Neon Transaction Considerations

- Serverless transactions have 5-second interactive limit (documented in Phase 17)
- Monitoring checks should be quick (health evaluation is in-memory)
- Database writes should be batched or use separate transactions
- Audit log inserts are lightweight single-row writes

---

## 15. Testing Strategy

### 15.1 Executed Tests (Current Phase)

| Test File | Result | Notes |
|---|---|---|
| `tests/monitoring/health.test.ts` | 8/8 PASS | Health evaluation |
| `tests/monitoring/retry.test.ts` | 9/9 PASS | Retry/timeout policy |
| `tests/monitoring/normalize.test.ts` | 11/11 PASS | Normalization + security |
| `tests/monitoring/security.test.ts` | 5/5 PASS | Security tests |
| `tests/monitoring/mock-adapter.test.ts` | 16/16 PASS | Mock adapter scenarios |
| `npx tsc --noEmit` | PASS | 0 errors |
| `npx eslint lib/ tests/` | PASS | 0 errors, warnings only |
| `pnpm exec prisma validate` | PASS | Schema valid |
| `pnpm exec prisma generate` | PASS | Client generated |
| `npm run build` | PASS | 21 routes |
| `tests/auth.test.ts` | 20/20 PASS | From earlier phase |
| `tests/mt5-accounts.test.ts` | 38/38 PASS | From earlier phase |
| `tests/products-and-rulesets.test.ts` | 14/14 PASS | From earlier phase |
| `tests/mt5-accounts.integration.test.ts` | 15/15 PASS | From earlier phase |

### 15.2 Unit Tests Needed (Before Live Deployment)

| Category | Test Areas | Status |
|---|---|---|
| Worker input validation | Account ID format, status checks | Planned |
| Retry classification | isRetryable edge cases | Partially tested (retry.test.ts) |
| Timeout handling | Hard timeout enforcement | Partially tested (mock-adapter) |
| Snapshot validation | Normalize edge cases | Tested (normalize.test.ts) |
| Safe error serialization | No credential leakage | Tested (security.test.ts) |
| Account status eligibility | Scheduler selection logic | Planned |

### 15.3 Integration Tests Needed

| Category | Test Areas | Status |
|---|---|---|
| Scheduler/account selection | Eligible account query | Planned |
| Duplicate job prevention | Concurrent job detection | Planned |
| Audit event creation | Monitoring event logging | Planned |
| Database failure handling | Graceful DB errors | Planned |
| Ownership enforcement | Cross-account isolation | Planned |

### 15.4 Process Tests Needed

| Category | Test Areas | Status |
|---|---|---|
| Worker timeout | Process hang detection | Planned |
| Worker crash | Restart and recovery | Planned |
| Terminal process unavailable | Bridge failure | Planned |
| Safe process termination | Graceful shutdown | Planned |
| Recovery after restart | State consistency | Planned |

### 15.5 Security Tests Needed

| Category | Test Areas | Status |
|---|---|---|
| No secret leakage | Log/output scan | Partially tested |
| Unauthorized account access | Cross-trader access | Tested (API routes) |
| Cross-trader isolation | Data separation | Tested (API routes) |
| Invalid role access | Role enforcement | Tested (API routes) |
| Credential decryption boundary | Worker isolation | Planned (worker doesn't exist) |

### 15.6 Live MT5 Tests (Future-Only)

| Category | Test Areas | Status |
|---|---|---|
| Authorized terminal initialization | mt5.initialize() | BLOCKED |
| Account information retrieval | mt5.account_info() | BLOCKED |
| Position retrieval | mt5.positions_get() | BLOCKED |
| Order/history retrieval | mt5.orders_get(), mt5.history_deals_get() | BLOCKED |
| Disconnection/reconnection | mt5.shutdown() + reconnect | BLOCKED |
| Read-only operation verification | All read methods | BLOCKED |

### 15.7 Test Count Reconciliation

| Category | Tests | Source |
|---|---|---|
| Monitoring (health) | 8 | tests/monitoring/health.test.ts |
| Monitoring (retry) | 9 | tests/monitoring/retry.test.ts |
| Monitoring (normalize) | 11 | tests/monitoring/normalize.test.ts |
| Monitoring (security) | 5 | tests/monitoring/security.test.ts |
| Monitoring (mock-adapter) | 16 | tests/monitoring/mock-adapter.test.ts |
| Auth | 20 | tests/auth.test.ts |
| MT5 Accounts | 38 | tests/mt5-accounts.test.ts |
| Products & Rulesets | 14 | tests/products-and-rulesets.test.ts |
| Integration | 15 | tests/mt5-accounts.integration.test.ts |
| **Total Executed** | **136** | **5 test files confirmed** |

Note: Database-dependent tests (phase16-audit, phase17-recovery, e2e-workflow) require PostgreSQL (DATABASE_URL) and skip when database is unavailable. Their known counts from prior phases are documented in their respective docs.

---

## 16. Database and Migration Policy

### 16.1 Current Position

No schema changes are proposed in Phase 20A. The existing Prisma schema supports the designed architecture.

### 16.2 If Schema Changes Are Needed (Future Phases Only)

Every schema change must satisfy:
1. Explain the problem it solves
2. Review existing constraints and indexes
3. Design for transaction safety (Neon 5-second limit)
4. Include migration that is additive and idempotent
5. Add integration tests for the change
6. Validate migration against development database

### 16.3 Avoid

- Unnecessary tables (use AuditLog/RuleEvent for events initially)
- Unbounded snapshot storage (use retention policy)
- Destructive migrations (no DROP, no data deletion)
- Broad audit deletion (append-only)
- Non-idempotent worker state transitions

---

## 17. Runtime Verification Requirements

Before claiming production readiness, the following must be runtime-verified:

| Item | Verification Method | Status |
|---|---|---|
| Worker decrypts credentials in isolation | Runtime test with mock credentials | Runtime-unverified |
| No decrypted credentials in logs | Log scan during live test | Runtime-unverified |
| No decrypted credentials in API responses | HTTP response inspection | Runtime-unverified |
| Worker crash recovery | Crash and restart test | Runtime-unverified |
| Terminal crash recovery | Terminal process kill + reconnect | Runtime-unverified |
| Concurrent account isolation | Multi-account load test | Runtime-unverified |
| Scheduler deduplication | Concurrent job test | Runtime-unverified |
| Audit event integrity | Post-event consistency check | Runtime-unverified |
| Rule/monitoring boundary | Review rule engine source | Runtime-unverified |
| Worker timeout enforcement | Hang test with hard timeout | Runtime-unverified |

---

## 18. Known Limitations

1. **No live MT5 connection**: Cannot verify terminal connectivity
2. **No worker implemented**: All worker design is architectural
3. **No scheduler implemented**: All scheduling design is architectural
4. **No process isolation tested**: Worker/scheduler separation is theoretical
5. **No credential lifecycle tested**: Rotation/revocation not implemented
6. **No crash recovery tested**: Recovery design is theoretical
7. **No load tested**: Concurrent account monitoring performance unknown
8. **No Windows service tested**: Worker service model not validated on Windows
9. **No rule engine separation verified**: Monitoring provides data only; rule engine is future work
10. **No observability implemented**: Logging is design-only
11. **No snapshot persistence**: Current state only in MT5Account; no history table
12. **Phase 19B BLOCKED**: No authorized XM credentials available

---

## 19. Prerequisites for Live MT5 Integration

To proceed from DESIGN ONLY to implementation:

1. **Authorized XM demo account credentials** (MT5 login, password, server)
2. **MT5 terminal running and logged in** to the authorized demo account
3. **Worker host selected and provisioned** (Windows server/VM)
4. **Credential storage designed** (encryption key loaded in worker only)
5. **Worker process implemented** (Node.js, isolated from API)
6. **Scheduler implemented** (job dispatch, deduplication, retry)
7. **Python MT5 bridge validated** (read-only operations confirmed at runtime)
8. **Security boundary verified** (no credential leakage at runtime)
9. **All planned tests pass** (unit, integration, process, security)
10. **Approved for production** (documented approval for live testing)

---

## 20. Recommendation for Phase 20B

**Phase 20B should implement:**
1. The monitoring worker skeleton (Node.js process with job loop)
2. Credential decryption boundary (isolated to worker only)
3. MT5 bridge integration (Python subprocess per worker)
4. Health evaluation pipeline (normalize → health → event)
5. Basic scheduler (interval-based, single account)
6. Audit event generation (MONITORING_STARTED/SUCCEEDED/FAILED)
7. Process lifecycle management (start, stop, restart, timeout)
8. Unit tests for all implemented components

**Do NOT implement in Phase 20B:**
- Full scheduler with account selection
- Snapshot history storage
- Rule engine integration
- Multi-account monitoring
- Windows service packaging
- Production observability stack

---

## Appendix A: Files Referenced

| File | Purpose |
|---|---|
| `lib/encryption.ts` | Credential encryption/decryption |
| `lib/monitoring/types.ts` | Provider-neutral monitoring types |
| `lib/monitoring/adapter.ts` | Abstract MT5 adapter |
| `lib/monitoring/result.ts` | Monitoring result/error types |
| `lib/monitoring/health.ts` | Health evaluation |
| `lib/monitoring/normalize.ts` | Data normalization |
| `lib/monitoring/mock-adapter.ts` | Deterministic mock adapter |
| `lib/monitoring/retry.ts` | Retry/timeout policy |
| `lib/allocation.ts` | Account allocation |
| `lib/release.ts` | Account release |
| `prisma/schema.prisma` | Database schema |
| `poc-mt5-bridge/poc_bridge.py` | Read-only MT5 bridge POC |
| `app/api/accounts/[id]/route.ts` | MT5Account API (admin-only) |
| `app/api/accounts/[id]/status/route.ts` | Status transitions (admin-only) |
| `app/api/accounts/[id]/health/route.ts` | Health status (admin-only) |
| `tests/monitoring/*.test.ts` | Monitoring test suite (49 tests) |
| `docs/phase19a-mock-monitoring-architecture.md` | Phase 19A architecture |
| `docs/phase19b-mt5-connectivity-validation.md` | Phase 19B validation |
| `docs/mt5-data-mapping.md` | MT5 field mapping |
| `docs/architecture.md` | Project architecture |
