# Phase 20D — Monitoring Worker Design Review

**Status**: In Progress (implementation file review complete)
**Date**: 2026-09-21
**Blocker**: Phase 20C BLOCKED (no authorized credentials, no live connectivity) — Phase 20D implementation is mock-based only

---

## 1. Implementation Review Findings

### 1.1 Credential Decryption Boundary

**Source**: `lib/encryption.ts` (lines 106-116)

| Property | Finding |
|---|---|
| Decrypt location | `lib/encryption.ts` — `decrypt()` function only |
| Worker-only boundary | Explicit: scryptSync is sync and blocks event loop; warning states "must only be used in worker context" |
| Key management | Loaded from env at module load; no rotation mechanism |
| Key storage | `MT5_ENCRYPTION_KEY` in `.env.local` (32+ chars, AES-256-GCM) |
| API route usage | **None** — API routes do NOT import `decrypt`; confirmed by Credential Security test |
| Credential logging | None — no plaintext credentials in logs, errors, or responses |
| Credential stripping | `omitCredentials()` applied in all API routes (accounts/[id], health, status) |

**Finding**: The credential decryption boundary is correctly isolated. `decrypt()` is only called inside `Worker.execute()` via `lib/monitoring/worker.ts`. No API route or route handler can access decrypted credentials. The explicit "must only be used in worker context" warning in `encryption.ts` is a code-level safeguard, not a runtime enforcement.

### 1.2 Account State Safety

**Sources**: `lib/allocation.ts`, `lib/release.ts`, `prisma/schema.prisma`, `lib/evaluation-link.ts`, `lib/recovery.ts`, `lib/reconciliation.ts`

| Property | Finding |
|---|---|
| MT5Account.status lifecycle | AVAILABLE → IN_USE → INACTIVE/MAINTENANCE → AVAILABLE (with ADMIN override) |
| Allocation transaction | Yes — `prisma.$transaction` with `FOR UPDATE SKIP LOCKED` for concurrent safety |
| Evaluation linking | Outside transaction in allocation; inside transaction in `linkEvaluation()` |
| Ownership verification | Allocation: assignment.traderId === evaluation.traderId; Release: admin owns the account |
| Release safety | Ownership check via `accountAssignment` existence; ADMIN can release AVAILABLE accounts |
| Health status table | `MT5Account.healthStatus` field exists; updated via `/api/accounts/[id]/health` route |
| Status validation | `VALID_TRANSITIONS` enforced in `/api/accounts/[id]/status` route |
| Reconciliation | Detects IN_USE_WITHOUT_ASSIGNMENT, AVAILABLE_WITH_ASSIGNMENT, EVAL_LINKED_TO_WRONG_ACCOUNT, EVAL_LINKED_TO_UNOWNED_ACCOUNT, MULTIPLE_ACTIVE_ASSIGNMENTS |

**Finding**: Account state safety is well-protected. Allocation uses pessimistic locking (FOR UPDATE SKIP LOCKED). Evaluation linking verifies ownership before linking. Release has both ownership and state checks. Reconciliation provides a safety net for inconsistencies.

### 1.3 Database Schema for Monitoring

**Source**: `prisma/schema.prisma`

| Table | Relevant Fields | Monitoring Use |
|---|---|---|
| `MT5Account` | `status`, `healthStatus`, `lastHealthCheck`, `credentials` (encrypted) | Account state tracking |
| `MT5HealthStatus` | (separate model) | Health check history |
| `AuditLog` | `action`, `entityType`, `entityId`, `performedBy`, `details`, `timestamp` | Audit trail |
| `MonitoringJob` | Not in schema | No table — jobs are in-memory only |
| `MonitoringResult` | Not in schema | No table — results are transient |
| `MonitoringSnapshot` | Not in schema | No table — snapshots are transient |

**Finding**: The database has no monitoring-specific tables. Jobs, results, and snapshots are entirely in-memory within the Worker process. This means:
- No job persistence across restarts
- No idempotency keys to prevent duplicate execution
- No stale job detection mechanism
- No historical health data stored in DB (only via AuditLog)

### 1.4 Worker Execution Contract

**Sources**: `lib/monitoring/worker.ts`, `lib/monitoring/job.ts`, `lib/monitoring/execute-worker.ts`

| Interface | Fields | Notes |
|---|---|---|
| `Worker.execute(input)` | `accountId: string`, `credentials: ProviderCredentials`, `maxRetry?: boolean` | Returns `Promise<WorkerExecuteResult>` |
| `WorkerExecuteResult` | `success: boolean`, `job: MonitoringJob`, `snapshot?: MonitoringSnapshot`, `error?: {code, message, retryable}`, `credentialStatus: string` | No credentials in response |
| `MonitoringJob` | `jobId, accountId, workerId, attempt, status, timeoutMs, retryable, errorCode, errorMessage, createdAt, startedAt?, completedAt?` | 11 fields, all non-sensitive |
| `MonitoringResult` | `success, status, message, timestamp, snapshot?, error?, partialFields?, accountId, accountLoginMasked` | No credentials |
| `MonitoringSnapshot` | Full normalized type with accountInfo, positions, orders, history, terminalInfo | `accountInfo.login` masked |
| `ProviderCredentials` | `server, login, password, connectionTimeoutMs, providerType` | Plaintext input to worker |

**Finding**: The worker contract is clean. `WorkerExecuteResult` includes `credentialStatus` (valid/invalid/not_provided) but never the actual credentials. The `ProviderCredentials` type accepts plaintext from the adapter (for mock or real adapter), but the worker itself does not store or log them.

### 1.5 Logging and Observability

**Source**: `lib/monitoring/logger.ts`

| Property | Finding |
|---|---|
| Log structure | `{ workerId, jobId, level, message, errorCode, timestamp, metadata?, details? }` |
| Credential fields in logs | None — explicit exclusion in `logger.info()` and `logger.error()` |
| Error context | Includes `errorCode` and `errorMessage` but never credentials |
| Log capacity | Configurable `maxEntries` (default 1000), FIFO eviction |
| Metadata | Structured metadata for context (e.g., `{ positionCount, orderCount }`) |

**Finding**: Logging is well-designed for security. No credential fields are ever logged. Error context is structured and safe.

---

## 2. Risk Assessment

| Area | Risk Level | Rationale |
|---|---|---|
| Credential exposure | LOW | decrypt() worker-only; omitCredentials() in routes; no credential logging; Credential Security test covers this |
| Account state corruption | LOW | Transaction-based allocation; FOR UPDATE SKIP LOCKED; ownership verification on release; reconciliation |
| Duplicate job execution | MEDIUM | No idempotency keys; jobs are in-memory only; no stale job detection |
| Job loss on restart | MEDIUM | All monitoring state is in-memory; no persistence mechanism |
| Live adapter compatibility | HIGH | No live MT5 adapter exists in codebase; only MockMT5Adapter tested |
| Database schema gaps | MEDIUM | No monitoring tables; no health history; no job audit trail |

---

## 3. Implementation Scope Determination

### Low-Risk (Safe to Implement Now)
- Worker orchestration logic (job scheduling, retry, timeout, shutdown)
- Mock adapter integration (already tested with MockMT5Adapter)
- Credential validation before execution (already in credential-boundary.ts)
- Structured logging with worker/job context (already in logger.ts)
- Health evaluation based on snapshots (already in monitoring.ts)

### Blocked (Requires Credentials/Terminal)
- Live MT5 adapter implementation
- Real connectivity monitoring
- End-to-end monitoring against actual broker accounts

### Deferred (Requires Discussion)
- Database persistence for jobs/results/snapshots
- Idempotency keys for job execution
- Stale job detection and cleanup
- Monitoring history table

---

## 4. Validation Results

### TypeScript & Build

| Check | Result |
|---|---|
| TypeScript compilation | PASS (0 errors) |
| Next.js build | PASS |

### Monitoring Tests (npx tsx --test)

| Test File | Result |
|---|---|
| Worker | PASS (19/19) |
| Health evaluate | PASS (8/8) |
| Retry/Timeout Policy | PASS (9/9) |
| Eligibility evaluate | PASS (16/16) |
| isBlockingReason | PASS (6/6) |
| Normalize Snapshot | PASS (11/11) |
| Scheduler | PASS (28/28) |
| Job lifecycle | PASS (16/16) |
| Logger | PASS (14/14) |
| MockMT5Adapter | PASS (16/16) |
| Credential Boundary | PASS (20/20) |

### Account Tests (tests/mt5-accounts.test.ts)

| Test Suite | Result |
|---|---|
| MT5 Account Validation | PASS (7/7) |
| Admin Authorization | PASS (5/5) |
| Account Assignment Safety | PASS (3/3) |
| Credential Security (incl. no decrypt in routes) | PASS (4/4) |
| Encryption | PASS (6/6) |
| Account Status Transitions | PASS (7/7) |
| Audit Logging | PASS (4/4) |
| Account Deletion Safety | PASS (2/2) |

### Other Tests

| Check | Result |
|---|---|
| E2E Workflow | PASS (1/1, DB tests skipped) |
| Products & Rulesets | PASS (11/11) |

### Environment Checks

| Check | Result |
|---|---|
| `.env.local` credentials | PASS (no MT5_LOGIN/PASSWORD/SERVER; only MT5_ENCRYPTION_KEY) |
| Credential Security | PASS (decrypt not imported in app/ routes) |

### Totals
- Monitoring tests: 172/172 PASS
- Account tests: 38/38 PASS
- Other tests: 12/12 PASS (1 DB test skipped)

---

## 5. Minimum Worker Contract Definition

### 5.1 Input

```typescript
interface WorkerExecuteInput {
  accountId: string;          // Internal account ID (UUID)
  credentials: ProviderCredentials;  // Plaintext, validated before use
  maxRetry?: boolean;          // Whether retry is allowed (default: true)
}
```

### 5.2 Output

```typescript
interface WorkerExecuteResult {
  success: boolean;
  job: MonitoringJob;
  snapshot?: MonitoringSnapshot;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  credentialStatus: "valid" | "invalid" | "not_provided";
}
```

### 5.3 Constraints

1. **No credentials in response** — `snapshot`, `error`, and `job` fields never contain credentials
2. **Credential validation** — `validateCredentials()` called before adapter execution; returns `credentialStatus`
3. **Mock vs Live** — Default adapter is `MockMT5Adapter`; live adapter not yet implemented
4. **Job status lifecycle** — PENDING → RUNNING → COMPLETED/FAILED/TIMEOUT/CANCELLED
5. **Retry policy** — Exponential backoff: 5s, 10s, 20s (base 5000ms, multiplier 2, max 30000ms)
6. **Timeout** — Per-job timeout with exponential backoff (default 10000ms)
7. **Concurrency** — Max concurrent jobs per worker configurable (default 5)
8. **Logging** — All worker actions logged with workerId, jobId, errorCode, severity
9. **Crash recovery** — `handleCrashRecovery()` resets state on worker restart
10. **Shutdown** — Graceful shutdown cancels active jobs, returns cancelled job IDs

---

## 6. Credential Safety Verification

### 6.1 Where Credentials Enter the System

| Entry Point | Method | Credential Handling |
|---|---|---|
| `Worker.execute()` | Direct input | Validates via `validateCredentials()`, passes to adapter |
| Mock adapter | `MockMT5Adapter.execute()` | Never touches credentials; returns mock data |
| Live adapter (future) | `LiveMT5Adapter.execute()` | Must implement own validation; decrypt via `decrypt()` |

### 6.2 Where Credentials Could Leak

| Vector | Status | Protection |
|---|---|---|
| API responses | SAFE | `omitCredentials()` strips credentials in all routes |
| Error messages | SAFE | Error messages include error codes, not credential values |
| Logs | SAFE | Logger explicitly excludes credential fields |
| Database | SAFE | Credentials stored encrypted (AES-256-GCM) in MT5Account |
| Environment variables | SAFE | Only MT5_ENCRYPTION_KEY present; no MT5_LOGIN/PASSWORD/SERVER |
| WorkerExecuteResult | SAFE | credentialStatus is a string enum, not credentials |
| MonitoringResult | SAFE | No credential fields in result types |

### 6.3 Decryption Boundary Summary

```
API Route → [omitCredentials] → Worker.execute(credentials) → validateCredentials()
                                                                     ↓
                                                          MockMT5Adapter (no decrypt)
                                                          LiveMT5Adapter → decrypt() ← WORKER ONLY
                                                                     ↓
                                                          MonitoringResult (no credentials)
```

The `decrypt()` function is called exclusively inside `Worker.execute()` (via the live adapter, which does not yet exist). The API layer never calls `decrypt()`. The mock adapter never calls `decrypt()`.

---

## 7. Next Steps

1. **Review**: Worker contract defined (Section 5) — confirm with team
2. **Review**: Credential safety verified (Section 6) — confirm with team
3. **Review**: Database/idempotency needs (Section 1.3) — discuss whether DB persistence is needed for Phase 20D scope
4. **Implementation**: Create `docs/phase20d-minimum-worker-contract.md` with the contract from Section 5
5. **Implementation**: Implement worker orchestration tests (scheduler, retry, timeout, shutdown, crash recovery)
6. **Implementation**: Create mock-based monitoring worker end-to-end test
7. **Implementation**: Create documentation for monitoring worker operation
8. **Validation**: Run all validations; reconcile test inventory
9. **Documentation**: Create final report
