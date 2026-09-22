# Monitoring Persistence Implementation

## Overview

Database-persistent monitoring job system for tracking MT5 account health checks with lease-based worker claiming, stale job recovery, and idempotent job creation.

## Architecture

### Components

| File | Responsibility |
|---|---|
| `lib/monitoring/repository.ts` | Constants, types, helper functions (`computeLeaseExpiry`, `isJobActive`, `isJobStale`) |
| `lib/monitoring/monitoring-job.ts` | All CRUD and state machine operations on MonitoringJob |
| `tests/monitoring/persistence.ts` | 32 DB-backed integration tests |
| `prisma/schema.prisma` | `MonitoringJob` model, `JobStatus` enum, MT5Account monitoring fields |

### Database Schema

#### MonitoringJob Model

| Field | Type | Notes |
|---|---|---|
| `id` | String (UUID) | Primary key, auto-generated |
| `jobId` | String | Unique business identifier (enforced by unique index) |
| `accountId` | String | Foreign key → MT5Account.id (CASCADE delete) |
| `status` | JobStatus | PENDING / RUNNING / COMPLETED / FAILED / TIMEOUT / CANCELLED |
| `workerId` | String | Worker currently claiming or last ran the job |
| `attempt` | Int | Start at 1, increment on retry |
| `timeoutMs` | Int | Per-job timeout in milliseconds |
| `retryable` | Boolean | Whether failed job should be retried |
| `errorCode` | String? | Error classification |
| `errorMessage` | String? | Human-readable error detail |
| `startedAt` | DateTime? | When job entered RUNNING |
| `completedAt` | DateTime? | When job reached terminal status |
| `leaseExpiry` | DateTime? | When claim expires (RUNNING only) |
| `createdAt` | DateTime | Auto-set |
| `updatedAt` | DateTime | Auto-updated |

#### JobStatus Enum

```
PENDING RUNNING COMPLETED FAILED TIMEOUT CANCELLED
```

#### MT5Account Fields Added

| Field | Type | Purpose |
|---|---|---|
| `lastMonitoringAt` | DateTime? | Timestamp of last monitoring result |
| `currentMonitoringStatus` | String? | HEALTHY / ERROR |
| `currentMonitoringResult` | String? | SUCCEEDED / FAILED / TIMED_OUT / RECOVERED |

## Key Design Decisions

### Idempotency

Enforced via Prisma partial unique index on `(accountId)` WHERE `status IN ('PENDING','RUNNING')`. `createJobSafe` checks for existing active jobs before creating. If an active job exists, the existing job is returned with `duplicate: true`.

### Lease-Based Claiming

Workers claim PENDING jobs via `claimJob`, which atomically transitions PENDING → RUNNING and sets `leaseExpiry = now + timeoutMs + graceMs`. Another worker claiming the same job receives `claimed: false` with the existing RUNNING job.

### Stale Job Recovery

`findStaleJobs` finds RUNNING jobs where `leaseExpiry < now - graceMs`. `recoverJob` transitions stale jobs to FAILED with `LEASE_EXPIRED` error code. `recoverAllStaleJobs` iterates and recovers all stale jobs.

### Security

MonitoringJob stores no credential fields. Worker identity is recorded in `workerId` for audit. Lease expiry ensures abandoned jobs are recovered within bounded time.

## Constants

| Constant | Value | Usage |
|---|---|---|
| `DEFAULT_TIMEOUT_MS` | 10000 | Default per-job timeout |
| `DEFAULT_GRACE_PERIOD_MS` | 60000 | Grace period before job considered stale |
| `DEFAULT_RECOVERY_INTERVAL_MS` | 30000 | Intended scheduler interval (not enforced) |

## Helper Functions

### `computeLeaseExpiry(startedAt, timeoutMs, graceMs?)`

Returns `new Date(startedAt.getTime() + timeoutMs + graceMs)`.

### `isJobActive(status)`

Returns `true` for `PENDING` or `RUNNING`.

### `isJobStale(job)`

Returns `false` for non-RUNNING jobs, `false` for `null` leaseExpiry, `false` for unexpired lease, `true` for expired lease.

## State Machine

```
PENDING → RUNNING (claimJob)
PENDING → COMPLETED (completeJob)
PENDING → TIMEOUT (timeoutJob)
PENDING → FAILED (failJob)
PENDING → CANCELLED (cancelJob)
RUNNING → COMPLETED (completeJob)
RUNNING → FAILED (recoverJob when lease expired)
COMPLETED/FAILED/TIMEOUT/CANCELLED → terminal (no transitions)
```

## Testing

- 32 integration tests in `tests/monitoring/persistence.ts`
- Run: `npx tsx --no-cache --env-file=.env.local --test tests/monitoring/persistence.ts`
- All 32 tests pass
- Tests create own MT5Account data via upsert; cleanup between tests
- Connection managed at describe block level (single connect/disconnect)
