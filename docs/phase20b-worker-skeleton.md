# Phase 20B: Pre-Live Monitoring Worker Skeleton

## Objective

Create skeleton implementations for the pre-live monitoring worker, providing a foundation for automated MT5 account health monitoring without live connectivity.

## Scope

- Job model and state management
- Structured logging with worker context
- Account eligibility evaluation
- Credential boundary and provider neutrality
- Worker core (execute, retry, shutdown, crash recovery)
- Scheduler skeleton (schedule, queue, activate, complete, fail, requeue)

## Constraints

1. **Mock adapter default** — MockMT5Adapter is the default adapter; no live MT5/XM connectivity required
2. **Provider-neutral** — Worker accepts any provider type via credentials; no broker-specific logic
3. **No schema changes** — No database modifications; pure application layer
4. **No credentials in code/logs** — All credentials masked before logging; raw passwords never stored
5. **Skeleton only** — Scheduler has no cron/interval; worker runs ad-hoc per execute call
6. **node:test pattern** — All tests use Node.js built-in test runner
7. **TypeScript strict** — All code compiles under strict mode with 0 errors

## Implementation

### Files Created

#### `lib/monitoring/job.ts`
- `MonitoringJob` interface: idempotent job record with status, attempt, error details, timestamps
- `JobStatus` type: `PENDING | RUNNING | COMPLETED | FAILED | TIMEOUT | CANCELLED`
- `createJob(input)` — creates PENDING job with unique ID
- `markRunning/markCompleted/markFailed/markTimeout/markCancelled` — state transitions
- `isRetryable(job)` — checks retryability
- Immutability: all mark functions return new objects, never mutate input

#### `lib/monitoring/logger.ts`
- `Logger` class with structured log entries
- `LogEntry` includes: timestamp, workerId, jobId, eventType, status, duration, retryAttempt, errorCode, severity, message, metadata
- Methods: `debug/info/warn/error` + `getEntries/getEntriesByJobId/getRecentEntries/clear`
- Configurable maxEntries with automatic eviction
- WorkerId assigned at construction, never per-entry

#### `lib/monitoring/eligibility.ts`
- `evaluateEligibility(input)` — checks account blocking conditions
- Blocking checks: `ACCOUNT_SUSPENDED`, `DEMO_ACCOUNT`, `ACCOUNT_INACTIVE`
- Non-blocking checks: `OPEN_POSITIONS` (MEDIUM), `HIGH_LEVERAGE` (LOW)
- `isBlockingReason(reason)` — identifies blocking vs advisory reasons
- Uses separate `AccountEligibilityInput` with optional fields for graceful defaults

#### `lib/monitoring/credential-boundary.ts`
- `ProviderCredentials` — typed provider input (providerType, server, login, password, connectionTimeoutMs)
- `CredentialSet` — masked credential output (providerType, maskedLogin)
- `validateCredentials(credentials)` — validates all fields, returns structured errors
- `maskLogin(login)` — masks all but last 4 digits
- `createCredentialSet(credentials)` — creates masked credential set for logging
- `supportsProvider(type)` — provider availability check

#### `lib/monitoring/worker.ts`
- `Worker` class with core lifecycle: execute, retry, shutdown, handleCrashRecovery
- `WorkerExecuteResult` — structured result with job, success, snapshot?, error?
- Constructor accepts optional `MT5Adapter` (defaults to MockMT5Adapter with empty accounts)
- Execute flow: eligibility check → credential validation → adapter fetch with timeout → status transitions
- Retry respects `maxAttempts` from config
- Shutdown cancels active job and returns `{ cancelled, errors }`
- Crash recovery resets all in-flight state
- All errors use structured error codes (INELIGIBLE, INVALID_CREDENTIALS, TIMEOUT, ADAPTER_ERROR, WORKER_ERROR)

#### `lib/monitoring/scheduler.ts`
- `Scheduler` class with queue management
- `schedule(input)` — creates ScheduledJob and adds to queue
- `getNextJob()` — dequeues with concurrency control via `maxConcurrentJobs`
- `activateJob/completeJob/failJob` — state transitions with counters
- `getRetryableJobs()` — failed jobs within retry policy
- `requeueJob(jobId)` — moves failed job back to queue with incremented attempt
- `getStatus()` — comprehensive scheduler status
- `start/stop` — skeleton lifecycle (no cron/interval)
- `getDelayForAttempt(attempt)` — exponential backoff calculation

### Test Files Created

| File | Tests | Coverage |
|------|-------|----------|
| `tests/monitoring/job.test.ts` | 16 | createJob, all mark functions, isRetryable, all statuses |
| `tests/monitoring/logger.test.ts` | 14 | basic logging, severity levels, metadata, filtering, max entries, clear, empty |
| `tests/monitoring/eligibility.test.ts` | 16 | eligible accounts, blocking reasons, non-blocking severity, edge cases, isBlockingReason |
| `tests/monitoring/credential-boundary.test.ts` | 20 | maskLogin, createCredentialSet, validateCredentials, supportsProvider |
| `tests/monitoring/worker.test.ts` | 19 | constructor, getStatus, getLogger, execute (eligibility, credentials, success, failure), retry, shutdown, crash recovery |
| `tests/monitoring/scheduler.test.ts` | 28 | schedule, getStatus, start/stop, queue operations, activate/complete/fail, retry, requeue, delay |

**Total: 113 new tests across 6 test files**

## Integration Points

### With Existing Monitoring Lib
- Uses existing `MockMT5Adapter` (lib/monitoring/mock-adapter.ts) as default
- Compatible with existing `MT5Adapter` abstract class (lib/monitoring/adapter.ts)
- Uses `ProviderName` type from `lib/monitoring/types.ts`
- Leverages existing `RetryPolicyConfig` from `lib/monitoring/retry.ts` for backoff calculations
- Uses `SnapshotStatus` and `HealthStatus` from `lib/monitoring/types.ts`

### With Existing Auth
- `CredentialValidationResult` mirrors auth validation patterns
- No direct dependency on auth module
- Credentials flow through worker only via Mock adapter (no real MT5)

### With Next.js
- No Next.js dependency — pure Node.js modules
- No API routes created
- No middleware interaction

## Validation Results

### TypeScript Compilation
- **0 errors** across all 14 monitoring lib files + 6 new test files + existing code

### ESLint
- **0 errors**
- **15 warnings** (all unused-import/unused-var, consistent with existing codebase pattern of 38 pre-existing warnings)

### Unit Tests
- **162/162 monitoring tests pass** (113 new + 49 existing)
- All new test files: 113/113 pass
- All existing test files: 49/49 pass

### Production Build
- **PASS** — 21 routes, no errors

## Architecture Decisions

1. **Worker returns WorkerExecuteResult (not MonitoringResult)** — Worker and MonitoringResult have different shapes. WorkerExecuteResult wraps job + success info. MonitoringResult is for post-execution health evaluation.

2. **Adapter uses AdapterAccountInput** — Matches MT5Adapter.fetchSignature. Worker constructs input from credentials.

3. **eligibility uses optional fields** — `status`, `isDemo`, `isSuspended` are optional. Undefined means "not specified" → not flagged. This allows future enrichment from DB lookups.

4. **Blocking vs non-blocking reasons** — Blocking reasons (suspended, demo, inactive) prevent execution. Non-blocking reasons (open positions, high leverage) are advisory and recorded in `reasons` but don't prevent execution.

5. **Scheduler queue is separate from worker** — Scheduler manages queue; worker executes individual jobs. Decoupled design allows different execution strategies.

6. **No database integration** — All state is in-memory. Future phases can persist to DB without API changes.

7. **Mock adapter returns empty snapshot for unknown accounts** — Follows mock-adapter pattern: account not found returns `{ accountInfo: null, positions: [], ... }` rather than throwing.

## Known Limitations

- **No live connectivity** — All adapter calls go through MockMT5Adapter (explicit skeleton constraint)
- **No persistence** — Jobs, logs, and scheduler state are in-memory only
- **No concurrency enforcement** — Worker single-execution guard is in-memory; scheduler concurrency is logical only
- **Crash recovery is simulated** — `handleCrashRecovery` resets state but doesn't read from persistent storage
- **Scheduler has no timer** — `start()` sets a flag; no automatic job dispatch

## Files Modified

None — all implementations are new files.

## Files Created

```
lib/monitoring/job.ts
lib/monitoring/logger.ts
lib/monitoring/eligibility.ts
lib/monitoring/credential-boundary.ts
lib/monitoring/worker.ts
lib/monitoring/scheduler.ts
tests/monitoring/job.test.ts
tests/monitoring/logger.test.ts
tests/monitoring/eligibility.test.ts
tests/monitoring/credential-boundary.test.ts
tests/monitoring/worker.test.ts
tests/monitoring/scheduler.test.ts
```
