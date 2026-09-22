# Phase 20D — Minimum Worker Contract

**Status**: Defined
**Date**: 2026-09-21
**Review**: Design review complete — see `phase20d-worker-design-review.md`

---

## 1. Purpose

This document defines the minimum contract for the monitoring worker: what it receives, what it returns, what it cannot do, and what is out of scope for Phase 20D.

---

## 2. Worker Execution Input

```typescript
interface WorkerExecuteInput {
  accountId: string;          // Internal account ID (UUID from prisma)
  credentials: ProviderCredentials;  // Validated before adapter execution
  maxRetry?: boolean;          // Whether retry is allowed (default: true)
}
```

### Constraints on Input

| Constraint | Enforcement |
|---|---|
| `accountId` must be non-empty | `Worker.execute()` checks for blank accountId, returns FAILED |
| `credentials` must be valid | `validateCredentials()` called before adapter execution |
| `maxRetry` defaults to true | Explicit default in Worker constructor |
| No sensitive context required | Worker operates independently; no DB access in execute() |

---

## 3. Worker Execution Output

```typescript
interface WorkerExecuteResult {
  success: boolean;                    // true if snapshot obtained (even if partial)
  job: MonitoringJob;                  // Job with final status, timestamps, attempt count
  snapshot?: MonitoringSnapshot;       // Only present on success; credentials stripped
  error?: {
    code: string;                      // Machine-readable error code
    message: string;                   // Human-readable, no credential values
    retryable: boolean;                // Whether this error should trigger retry
  };
  credentialStatus: "valid" | "invalid" | "not_provided";
}
```

### Constraints on Output

| Constraint | Rationale |
|---|---|
| No credentials in response | `snapshot`, `error`, and `job` fields never contain credential values |
| `credentialStatus` is an enum string | Communicates validity without exposing credentials |
| `snapshot.accountInfo.login` is masked | `maskLogin()` applied in normalizeSnapshot |
| `snapshot` only on success | Failed jobs have no snapshot; error context only |
| Error messages exclude credentials | Error codes and generic messages only |
| Job status is one of: PENDING, RUNNING, COMPLETED, FAILED, TIMEOUT, CANCELLED | Defined in `JobStatus` type |

---

## 4. Job Lifecycle

```
PENDING → RUNNING → COMPLETED
                  → FAILED      → (retryable) → PENDING (next attempt)
                  → TIMEOUT     → (retryable) → PENDING (next attempt)
                  → CANCELLED
```

### Job Fields

| Field | Type | Description |
|---|---|---|
| `jobId` | string | Unique job identifier (UUID) |
| `accountId` | string | Target account ID |
| `workerId` | string | Owning worker instance ID |
| `attempt` | number | Current attempt number (starts at 1) |
| `status` | JobStatus | Current lifecycle status |
| `timeoutMs` | number | Per-attempt timeout in milliseconds |
| `retryable` | boolean | Whether failed jobs should be retried |
| `errorCode` | string \| null | Machine-readable error code |
| `errorMessage` | string \| null | Human-readable error message |
| `createdAt` | Date | Job creation timestamp |
| `startedAt` | Date \| null | Execution start timestamp |
| `completedAt` | Date \| null | Execution completion timestamp |

---

## 5. Retry Policy

| Parameter | Value | Description |
|---|---|---|
| `maxAttempts` | 3 (default) | Maximum total attempts including initial |
| `baseTimeoutMs` | 5000 | Initial timeout duration |
| `maxTimeoutMs` | 30000 | Maximum timeout duration (cap) |
| `backoffMultiplier` | 2 | Timeout multiplier between attempts |

### Retryable Error Codes

| Code | Description |
|---|---|
| `PROVIDER_ERROR` | Provider returned error response |
| `TIMEOUT` | Connection or response timeout |
| `CONNECTION_ERROR` | Network/connection failure |
| `VALIDATION_FAILURE` | Data validation failure |

### Non-Retryable Error Codes

| Code | Description |
|---|---|
| `INVALID_CREDENTIALS` | Credentials rejected by adapter |
| `ACCOUNT_NOT_FOUND` | Account does not exist |
| `PROVIDER_NOT_SUPPORTED` | Provider type not supported |
| `ENCRYPTION_ERROR` | Credential decryption failed |

---

## 6. Worker Lifecycle Methods

| Method | Input | Output | Description |
|---|---|---|---|
| `execute()` | `WorkerExecuteInput` | `Promise<WorkerExecuteResult>` | Execute monitoring for one account |
| `retry()` | `accountId`, `MonitoringJob`, `WorkerExecuteInput` | `Promise<WorkerExecuteResult>` | Retry a failed/timed-out job |
| `shutdown()` | `reason: string` | `Promise<{cancelled: string[], errors: string[]}>` | Graceful shutdown; cancels active jobs |
| `getStatus()` | — | `WorkerStatus` | Current worker status and counters |
| `getActiveJobId()` | — | `string \| null` | Currently executing job ID |
| `handleCrashRecovery()` | — | `void` | Reset state after process restart |

### Worker Status

```typescript
interface WorkerStatus {
  workerId: string;
  isRunning: boolean;
  activeJobId: string | null;
  jobsCompleted: number;
  jobsFailed: number;
  jobsTimedOut: number;
}
```

---

## 7. Scheduler Contract

| Method | Input | Output | Description |
|---|---|---|---|
| `schedule()` | `accountId`, `timeoutMs?`, `scheduledAt?` | `MonitoringJob` | Add job to queue with unique scheduleId |
| `getNextJob()` | — | `MonitoringJob \| null` | Dequeue next pending job (respects concurrency limit) |
| `activateJob()` | `jobId` | `void` | Move job from pending to running |
| `completeJob()` | `jobId` | `void` | Mark job as completed |
| `failJob()` | `jobId`, `errorCode`, `errorMessage` | `void` | Mark job as failed; set retryable based on policy |
| `markTimeout()` | `jobId` | `void` | Mark job as TIMEOUT |
| `markCancelled()` | `jobId` | `void` | Mark job as CANCELLED |
| `getRetryableJobs()` | — | `MonitoringJob[]` | Get all failed jobs eligible for retry |
| `requeueJob()` | `jobId` | `MonitoringJob \| null` | Move failed job back to pending |
| `getStatus()` | — | `SchedulerStatus` | Queue and execution status |
| `start()` / `stop()` | — | `void` | Start/stop scheduler loop |
| `isQueueEmpty()` | — | `boolean` | Whether pending queue is empty |

---

## 8. Credential Boundary

### In-Bounds

| Where | What |
|---|---|
| `Worker.execute()` input | Accepts `ProviderCredentials` (plaintext), validates with `validateCredentials()` |
| `MockMT5Adapter` | Never touches credentials; returns mock data |
| `decrypt()` | Called only in worker context for live adapter (not yet implemented) |

### Out-of-Bounds

| Where | Prohibited |
|---|---|
| API routes | No `decrypt()` call; `omitCredentials()` on all responses |
| Logger | No credential fields in any log entry |
| Error messages | No credential values in error messages |
| `WorkerExecuteResult` | No credential fields; only `credentialStatus` string |
| `MonitoringResult` | No credential fields |
| `MonitoringSnapshot` | Login masked via `maskLogin()` |

---

## 9. Logging Contract

Every worker action produces a log entry with:

| Field | Description |
|---|---|
| `workerId` | Which worker instance produced the log |
| `jobId` | Which job the log relates to |
| `level` | DEBUG, INFO, WARN, ERROR |
| `message` | Human-readable description |
| `errorCode` | Machine-readable code (on errors) |
| `timestamp` | ISO 8601 timestamp |
| `metadata` | Optional structured context |
| `details` | Optional additional details |

### Log Level Guidelines

| Level | When to Use |
|---|---|
| DEBUG | Detailed execution steps, retry decisions |
| INFO | Job started, completed, scheduled |
| WARN | Degraded data, partial results |
| ERROR | Failed execution, timeout, invalid credentials |

---

## 10. Out of Scope for Phase 20D

| Item | Reason |
|---|---|
| Live MT5 adapter | Requires authorized credentials and terminal session |
| Database persistence for jobs | Low risk to defer; in-memory sufficient for mock |
| Idempotency keys | No live execution to protect against duplication |
| Stale job detection | No persistent jobs to detect staleness |
| Monitoring history table | No DB schema for historical data |
| Health status persistence | MT5Account.healthStatus field exists but not used by worker |
| Real connectivity monitoring | BLOCKED per Phase 20C |

---

## 11. Mock Execution Flow

```
Worker.execute(accountId, credentials, maxRetry?)
  ├─ 1. Validate credentials (validateCredentials)
  │   └─ If invalid → return {success: false, credentialStatus: "invalid", FAILED job}
  ├─ 2. Create job (PENDING → RUNNING)
  ├─ 3. Call adapter.execute(accountId, credentials)
  │   └─ MockMT5Adapter: returns mock snapshot based on account config
  │   └─ LiveMT5Adapter: (deferred) decrypts credentials, calls MT5 API
  ├─ 4. Normalize snapshot (normalizeSnapshot)
  │   └─ Mask login, validate data quality, detect nulls/partials
  ├─ 5. Evaluate health (evaluateHealth)
  │   └─ HEALTHY, DEGRADED, DISCONNECTED, ERROR, UNKNOWN
  ├─ 6. Build WorkerExecuteResult
  │   └─ success: snapshot has data
  │   └─ credentialStatus: "valid"
  ├─ 7. Mark job COMPLETED
  └─ 8. Return result (no credentials in response)
```

---

## 12. Approval Checklist

- [ ] Worker contract reviewed and approved by team
- [ ] Credential boundary confirmed (decrypt only in worker context)
- [ ] Account state safety verified (allocation, release, reconciliation)
- [ ] Database/idempotency needs discussed and deferred
- [ ] Implementation scope confirmed (mock-based only for Phase 20D)
- [ ] All validations pass (TypeScript, build, tests)
