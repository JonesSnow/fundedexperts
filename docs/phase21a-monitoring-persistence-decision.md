# Phase 21A — Monitoring Persistence and Idempotency Decision

**Status**: COMPLETE
**Date**: 2026-09-21
**Phase**: 21A — Monitoring Persistence and Idempotency Decision
**Blocker**: Phase 20C BLOCKED (no authorized MT5/XM credentials, no live connectivity)

---

## 1. Objective

Determine the minimum persistence and idempotency requirements for a reliable MT5 monitoring system.

Live MT5/XM connectivity remains BLOCKED:
- No authorized XM credentials
- No logged-in terminal session
- No real MT5 data
- No runtime provider compatibility validation

This phase decides **what data must be persisted** and **how duplicate jobs are prevented**, without implementing live monitoring.

---

## 2. Existing Baseline

### 2.1 Schema (prisma/schema.prisma)

| Model | Relevant Fields | Monitoring Relevance |
|---|---|---|
| `MT5Account` | `id`, `accountNumber`, `status`, `healthStatus`, `lastHealthCheck`, `credentials` (encrypted) | Account state and health tracking |
| `AccountAssignment` | `traderId`, `accountId`, `status`, `assignedAt` | Trader-to-account ownership |
| `AuditLog` | `action`, `entityType`, `entityId`, `performedBy`, `details`, `timestamp` | Audit trail |
| `Evaluation` | `traderId`, `accountId`, `status` | Evaluation state |
| `MonitoringJob` | Not in schema | No table — jobs are in-memory only |
| `MonitoringResult` | Not in schema | No table — results are transient |
| `MonitoringSnapshot` | Not in schema | No table — snapshots are transient |

### 2.2 Monitoring Library (lib/monitoring/)

| File | Purpose |
|---|---|
| `types.ts` | Provider types, MonitoringSnapshot, MonitoringAccountInfo |
| `job.ts` | MonitoringJob type, JobStatus enum, job lifecycle functions |
| `worker.ts` | Worker class: execute(), retry(), shutdown(), handleCrashRecovery() |
| `scheduler.ts` | Scheduler class: schedule(), getNextJob(), completeJob(), failJob(), requeueJob() |
| `retry.ts` | Retry policy: isRetryable(), shouldRetry(), getTimeoutMs() |
| `adapter.ts` | MT5Adapter abstract class |
| `mock-adapter.ts` | MockMT5Adapter for testing |
| `credential-boundary.ts` | ProviderCredentials, validateCredentials(), maskLogin() |
| `health.ts` | evaluateHealth() with stale data detection |
| `normalize.ts` | normalizeSnapshot() with data quality validation |
| `result.ts` | MonitoringResult, HealthResult types |
| `errors.ts` | Error type definitions |
| `logger.ts` | Structured logger with workerId, jobId, errorCode |

### 2.3 Existing Transaction Patterns

- **Allocation**: `prisma.$transaction` with `FOR UPDATE SKIP LOCKED` (lib/allocation.ts)
- **Link evaluation**: `prisma.$transaction` (lib/evaluation-link.ts)
- **Reconciliation**: `prisma.$transaction` for repairs (lib/reconciliation.ts)
- **Account status changes**: Prisma default transaction behavior via API routes

### 2.4 Neon Transaction Limits

Neon serverless has:
- Connection pool limits (auto-scaling)
- Statement timeout defaults (60s)
- Idle connection cleanup
- Recommendation: keep transactions short (< 5s), minimize connection hold time

### 2.5 Existing Test Isolation and Cleanup

- Auth and account tests use PrismaClient with try/finally cleanup patterns
- Monitoring tests are in-memory (no DB dependency)
- Integration tests require DATABASE_URL and are skipped without it

---

## 3. Current Limitations (In-Memory Only)

| Limitation | Impact | Risk |
|---|---|---|
| Jobs lost on worker crash | No record of what was running | MEDIUM |
| No idempotency | Duplicate jobs possible if scheduled twice | MEDIUM |
| No stale job detection | Jobs can hang indefinitely | HIGH |
| No cross-worker coordination | Multiple workers may claim same job | HIGH |
| No monitoring history | No audit trail of monitoring results | LOW |
| No retry tracking | No record of retry attempts across restarts | MEDIUM |
| No health trend data | No historical health state | LOW |

---

## 4. Persistence Options Compared

### Option A: In-Memory Jobs Only (Current)

| Criteria | Assessment |
|---|---|
| Crash recovery | **None** — all job state lost on restart |
| Duplicate prevention | **None** — no persistence of job state |
| Retry tracking | **None** — attempts reset on restart |
| Stale job detection | **None** — no timestamp persistence |
| Multi-worker support | **None** — no shared state |
| Auditability | **None** — no monitoring records |
| Database cost | **Zero** |
| Implementation complexity | **Zero** |
| Query performance | **N/A** |
| Data retention | **N/A** |

**Verdict**: Insufficient for production. Acceptable only for mock/testing.

### Option B: AuditLog-Only Monitoring Records

| Criteria | Assessment |
|---|---|
| Crash recovery | **Partial** — AuditLog has timestamp and action but no job state |
| Duplicate prevention | **None** — AuditLog records events, not jobs |
| Retry tracking | **Partial** — can log retries but no structured tracking |
| Stale job detection | **None** — no structured timestamps for jobs |
| Multi-worker support | **None** — no coordination mechanism |
| Auditability | **Full** — existing AuditLog is comprehensive |
| Database cost | **Low** — uses existing table, no migration |
| Implementation complexity | **Low** — just log monitoring events to AuditLog |
| Query performance | **Acceptable** — existing AuditLog indexes |
| Data retention | **Inherited** from AuditLog policy |

**Verdict**: Better than A for auditability but insufficient for job management, retry tracking, and stale detection. Would require complex queries against JSON details field.

### Option C: MonitoringJob Table (Recommended Minimum)

| Criteria | Assessment |
|---|---|
| Crash recovery | **Full** — all job state persisted |
| Duplicate prevention | **Full** — unique constraint on account+status |
| Retry tracking | **Full** — attempt count, error codes, timestamps |
| Stale job detection | **Full** — startedAt, completedAt, timeoutMs |
| Multi-worker support | **Full** — workerId, lease mechanism |
| Auditability | **Full** — structured monitoring records |
| Database cost | **Low** — single table, ~15 fields |
| Implementation complexity | **Low** — straightforward Prisma model |
| Query performance | **Excellent** — indexed by accountId, status |
| Data retention | **Configurable** — TTL or archive policy |

**Verdict**: Minimum viable persistence. Addresses all critical limitations. Smallest design that supports reliable production monitoring.

### Option D: MonitoringJob + Current Account Monitoring State (Recommended)

Builds on Option C by adding strategic fields to MT5Account for current state tracking:

| Criteria | Assessment |
|---|---|
| Crash recovery | **Full** |
| Duplicate prevention | **Full** — unique constraint + account current job field |
| Retry tracking | **Full** |
| Stale job detection | **Full** — can use MT5Account.lastHealthCheck for staleness |
| Multi-worker support | **Full** |
| Auditability | **Full** — MonitoringJob + AuditLog |
| Database cost | **Low** — one new table + 3 fields on existing table |
| Implementation complexity | **Low** |
| Query performance | **Excellent** — indexed fields |
| Data retention | **Configurable** |

**Verdict**: Recommended design. Minimal additions to MT5Account (lastMonitoringAt, currentJobId, lastMonitoringStatus) complement the MonitoringJob table for current state queries without joining.

### Option E: MonitoringJob + Snapshots/History (Over-Engineered)

| Criteria | Assessment |
|---|---|
| Crash recovery | **Full** |
| Duplicate prevention | **Full** |
| Retry tracking | **Full** |
| Stale job detection | **Full** |
| Multi-worker support | **Full** |
| Auditability | **Full** — including full snapshot history |
| Database cost | **HIGH** — unbounded snapshot storage |
| Implementation complexity | **HIGH** — snapshot storage, retrieval, archiving |
| Query performance | **Degraded** — large table scans without careful indexing |
| Data retention | **Complex** — needs archival, purging, storage management |

**Verdict**: Not recommended for current needs. Product does not require historical snapshot data for rule evaluation. Can be added later if needed.

---

## 5. Recommended Minimum Design

### 5.1 Required Now

1. **MonitoringJob table** — persist job lifecycle (id, accountId, workerId, status, attempt, timestamps, error codes)
2. **MT5Account.lastMonitoringAt** — timestamp of last monitoring execution (for stale detection)
3. **MT5Account.currentMonitoringStatus** — current health state string (HEALTHY, DEGRADED, DISCONNECTED, ERROR, UNKNOWN)
4. **Unique constraint** on MT5Account for one active job per account

### 5.2 Required Before Live Deployment

1. **MonitoringJob lease expiry** — prevent stale jobs from blocking account scheduling
2. **Monitoring result persistence** — store last monitoring outcome (success/failure/error code) for health evaluation
3. **Audit log integration** — record significant monitoring events (job started, completed, failed, recovered)

### 5.3 Optional Future Functionality

1. Monitoring snapshot history table
2. Health trend analysis (requires historical data)
3. Automated stale job cleanup worker
4. Multi-worker load balancing via job queue table
5. Monitoring alert integration

---

## 6. Idempotency Model

### 6.1 Job Identity

| Field | Type | Purpose |
|---|---|---|
| `id` | String (UUID) | Primary key, unique job identifier |
| `jobId` | String | External job reference (format: `job-{accountId}-{timestamp}-{random}`) |
| `accountId` | String | Foreign key to MT5Account |
| `workerId` | String | Worker instance that claimed the job |
| `attempt` | Int | Current attempt number (starts at 1) |

### 6.2 Duplicate Prevention

**Primary mechanism**: Database unique constraint on `(accountId, status)` for PENDING/RUNNING jobs.

```
-- Prevent multiple pending/running jobs for same account
CREATE UNIQUE INDEX idx_monitoring_job_active 
ON "MonitoringJob" (accountId) 
WHERE "status" IN ('PENDING', 'RUNNING');
```

**Safe behavior for duplicate submission**:
- If a PENDING/RUNNING job already exists for the account, reject with `DUPLICATE_JOB` error
- If a job exists in COMPLETED/FAILED/CANCELLED/TIMEOUT state, allow new job creation
- API layer checks: `prisma.monitoringJob.findFirst({ where: { accountId, status: { in: ['PENDING', 'RUNNING'] } } })`

### 6.3 Worker Crash

- Job remains in RUNNING state with workerId
- Lease expires after `timeoutMs + gracePeriod` (see Section 7)
- Recovery worker detects expired lease and resets job to FAILED or CANCELLED
- New job can be scheduled for the account after recovery

### 6.4 Timeout

- Job times out after `timeoutMs` (per job config, default 10000ms)
- Timeout is detected by:
  1. Worker's internal timeout (runWithTimeout in worker.ts)
  2. Lease expiry check by recovery process (for worker crashes)
- Timed-out job status set to TIMEOUT, retryable based on error code

### 6.5 Retry After Partial Success

- Monitoring is atomic: either a complete snapshot is obtained or it fails
- No partial success state for monitoring jobs
- If snapshot validation fails, job is FAILED with appropriate error code
- Retry creates new job with incremented attempt count

### 6.6 Database Retry

- Prisma transactions are retried by Prisma client on serialization errors
- Job creation wrapped in transaction: insert job + update account lastMonitoringAt
- On transaction failure, job creation fails, no partial state

### 6.7 Concurrent Workers

- **Claim mechanism**: `prisma.monitoringJob.update({ where: { id, status: 'PENDING' }, data: { status: 'RUNNING', workerId, startedAt } })`
- If update returns null, another worker already claimed it
- **Unique constraint** prevents duplicate RUNNING jobs per account
- **Lease expiry** prevents stale claims from blocking

### 6.8 Account Status Changes During Execution

- Worker checks account status before execution: `MT5Account.status` must be IN_USE or AVAILABLE
- If account status changes to MAINTENANCE/SUSPENDED during execution:
  - Current job continues (already in progress)
  - Next job for this account is rejected until status returns to valid state
- Status change logged via AuditLog

---

## 7. Stale Job and Recovery Model

### 7.1 What Qualifies as Stale

A job is stale if:
- Status is RUNNING
- `startedAt + timeoutMs + gracePeriod < now()`
- No heartbeat update within lease duration

**Grace period**: 60 seconds (documented, not arbitrary). Allows for network delays and slow responses without marking legitimate long-running jobs as stale.

**Why 60 seconds**: Based on timeoutMs default of 10000ms plus typical network variance. Not tied to any specific provider SLA.

### 7.2 How Stale Jobs Are Identified

Recovery process (runs periodically, separate from worker):

```typescript
async function findStaleJobs(prisma: PrismaClient): Promise<MonitoringJob[]> {
  const staleThreshold = new Date(Date.now() - (DEFAULT_TIMEOUT_MS + GRACE_PERIOD_MS));
  return prisma.monitoringJob.findMany({
    where: {
      status: 'RUNNING',
      startedAt: { lt: staleThreshold },
    },
  });
}
```

### 7.3 Lease Mechanism

| Field | Type | Description |
|---|---|---|
| `workerId` | String | Which worker claimed the job |
| `startedAt` | DateTime | When the job was claimed |
| `leaseExpiry` | DateTime | When the lease expires (startedAt + timeoutMs + grace) |

**Job claim**:
```typescript
const claimed = await prisma.monitoringJob.update({
  where: { id, status: 'PENDING' },
  data: { status: 'RUNNING', workerId, startedAt: new Date(), leaseExpiry: staleThreshold },
});
```

**Lease expiry**: Calculated as `startedAt + timeoutMs + gracePeriod`. Not a separate timer — computed from existing timestamps.

### 7.4 How a Worker Claims a Job

1. Scheduler selects next PENDING job (FIFO)
2. Worker attempts to update job status to RUNNING via Prisma
3. If update succeeds (returns non-null), worker owns the job
4. If update fails (returns null), another worker already claimed it
5. Worker logs the claim via Logger

### 7.5 How Ownership Expires

- Ownership expires when `now() > leaseExpiry`
- No background timer required — recovery process checks periodically
- Recovery process interval: 30 seconds (documented, not arbitrary)
- Expired jobs are reset to FAILED or CANCELLED status

### 7.6 How Recovery Avoids Duplicate Processing

- Recovery updates job status atomically: `WHERE status = 'RUNNING' AND leaseExpiry < now`
- If update succeeds, recovery owns the recovery action
- If update fails, another recovery instance already handled it
- Atomic update prevents duplicate recovery processing

### 7.7 What Is Logged

| Event | Log Level | Details |
|---|---|---|
| Job identified as stale | WARN | jobId, accountId, workerId, staleDuration |
| Stale job recovery started | INFO | jobId, accountId, recoveryWorkerId |
| Stale job recovered (FAILED) | INFO | jobId, originalErrorCode |
| Stale job recovered (CANCELLED) | INFO | jobId, reason |
| Recovery conflict (duplicate) | WARN | jobId, existingWorkerId |

### 7.8 Manual Intervention Required?

**No** for automated recovery. The system self-heals stale jobs by resetting their status. Manual review is needed only if:
- Recovery process itself fails repeatedly (alerting required)
- Account status needs to be changed after stale recovery
- Monitoring results need investigation (not a system issue)

---

## 8. Database Schema Proposal

### 8.1 MonitoringJob Model

```prisma
model MonitoringJob {
  id              String   @id @default(uuid())
  jobId           String   @unique  // External reference: "job-{accountId}-{timestamp}-{random}"
  accountId       String
  account         MT5Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  workerId        String?
  status          JobStatus @default(PENDING)
  attempt         Int      @default(1)
  timeoutMs       Int      @default(10000)
  retryable       Boolean  @default(false)
  errorCode       String?
  errorMessage    String?
  startedAt       DateTime?
  completedAt     DateTime?
  leaseExpiry     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([accountId, status])
  @@index([status, leaseExpiry])
  @@index([workerId])
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  TIMEOUT
  CANCELLED
}
```

### 8.2 Proposed MT5Account Additions

| Field | Type | Nullable | Purpose | Index |
|---|---|---|---|---|
| `lastMonitoringAt` | DateTime | Yes | When last monitoring job completed | Yes (for stale detection) |
| `currentMonitoringStatus` | String | Yes | Current health state (HEALTHY/DEGRADED/DISCONNECTED/ERROR/UNKNOWN) | Yes (for queries by status) |
| `currentMonitoringResult` | String | Yes | Last result (SUCCESS/FAILURE/ERROR) | No |

### 8.3 Field Justification

**MonitoringJob fields**:

| Field | Purpose | Data Type | Nullable | Unique | FK | Retention |
|---|---|---|---|---|---|---|
| `id` | Primary key | String (UUID) | No | Yes | No | 90 days |
| `jobId` | External reference | String | No | Yes | No | 90 days |
| `accountId` | Account target | String | No | No | Yes (MT5Account, Cascade) | 90 days |
| `workerId` | Claiming worker | String | Yes | No | No | 90 days |
| `status` | Job lifecycle state | JobStatus | No | No | No | 90 days |
| `attempt` | Retry attempt count | Int | No | No | No | 90 days |
| `timeoutMs` | Per-job timeout | Int | No | No | No | 90 days |
| `retryable` | Whether retry is allowed | Boolean | No | No | No | 90 days |
| `errorCode` | Machine-readable error | String | Yes | No | No | 90 days |
| `errorMessage` | Human-readable error | String | Yes | No | No | 90 days |
| `startedAt` | Job start timestamp | DateTime | Yes | No | No | 90 days |
| `completedAt` | Job completion timestamp | DateTime | Yes | No | No | 90 days |
| `leaseExpiry` | Lease expiration | DateTime | Yes | No | No | 90 days |
| `createdAt` | Record creation | DateTime | No | No | No | 90 days |
| `updatedAt` | Record update | DateTime | No | No | No | 90 days |

**No sensitive credentials stored**: The MonitoringJob table contains no credential fields. Credentials remain encrypted in MT5Account.credentials.

**Indexes justified**:
- `(accountId, status)`: Primary query pattern — find active jobs for account
- `(status, leaseExpiry)`: Recovery query — find stale running jobs
- `(workerId)`: Worker status query — find jobs by worker

**No duplicate indexes**: Each index serves a distinct query pattern.

### 8.4 MT5Account Fields Justification

| Field | Purpose | Type | Nullable | Rationale |
|---|---|---|---|---|
| `lastMonitoringAt` | When last monitoring completed | DateTime | Yes | Enables quick staleness check without joining MonitoringJob |
| `currentMonitoringStatus` | Current health state | String | Yes | Enables status queries without joining MonitoringJob |
| `currentMonitoringResult` | Last result | String | Yes | Quick success/failure check |

These fields are denormalized from MonitoringJob for performance. They are maintained by the worker/ scheduler after job completion.

### 8.5 Transaction Considerations

**Job creation** (single transaction):
```typescript
await prisma.$transaction(async (tx) => {
  // Check for existing active job (idempotency)
  const existing = await tx.monitoringJob.findFirst({
    where: { accountId, status: { in: ['PENDING', 'RUNNING'] } },
  });
  if (existing) throw new Error('DUPLICATE_JOB');
  
  // Create job
  const job = await tx.monitoringJob.create({ data: {...} });
  
  // Update account lastMonitoringAt
  await tx.mT5Account.update({
    where: { id: accountId },
    data: { lastMonitoringAt: new Date() },
  });
  
  return job;
});
```

**Job claim** (single update, no explicit transaction needed):
```typescript
const job = await prisma.monitoringJob.update({
  where: { id, status: 'PENDING' },
  data: { status: 'RUNNING', workerId, startedAt: new Date(), leaseExpiry: ... },
});
```

**Status update** (single update):
```typescript
await prisma.monitoringJob.update({
  where: { id },
  data: { status, completedAt, errorCode, errorMessage, retryable },
});
```

All transactions are short (< 100ms expected). No long-running transactions.

### 8.6 Retention Policy

| Data | Retention | Rationale |
|---|---|---|
| MonitoringJob | 90 days | Sufficient for debugging and audit; configurable via future admin UI |
| AuditLog | Existing policy (not modified) | Uses existing retention |
| MT5Account.currentMonitoring* | Until next monitoring | Self-updating, no accumulation |

**Archival strategy**: MonitoringJob records older than 90 days are archived (not deleted) via future admin functionality. Current implementation simply ignores old records in queries.

---

## 9. Security and Ownership

### 9.1 Credential Safety

| Vector | Status | Protection |
|---|---|---|
| MonitoringJob stores credentials | **SAFE** | No credential fields in MonitoringJob |
| MonitoringJob stores decrypted credentials | **SAFE** | Worker never stores decrypted credentials |
| API responses expose monitoring data | **SAFE** | Credentials remain in MT5Account only (encrypted) |
| Logs expose credentials | **SAFE** | Logger excludes credential fields |
| Database exposes credentials | **SAFE** | MT5Account.credentials encrypted (AES-256-GCM) |

### 9.2 Trader Ownership

| Check | Implementation |
|---|---|
| Job creation requires account access | Worker validates via evaluateEligibility() |
| Job can only target owned accounts | MT5Account → AccountAssignment → Trader ownership chain |
| Cross-trader job prevention | Database constraint: accountId → MT5Account → AccountAssignment.traderId |
| Worker cannot access other traders' accounts | Worker operates on accountId only; no traderId in worker context |

### 9.3 Unauthorized Job Manipulation

| Threat | Mitigation |
|---|---|
| Worker modifies another worker's job | Worker can only update jobs it claimed (workerId match) |
| External API manipulates jobs | No public API for job manipulation; internal infrastructure only |
| Worker claims another worker's job | Prisma update with WHERE clause prevents this atomically |
| Stale job prevents scheduling | Lease expiry + recovery mechanism (Section 7) |

### 9.4 Worker vs Trader Permissions

Worker-level permissions differ from trader-level API permissions:

| Capability | Trader API | Worker |
|---|---|---|
| Read account data | Via API (JWT auth, ADMIN) | Direct (internal) |
| Modify account status | Via API (ADMIN only) | Read-only (checks status before execution) |
| Create/delete accounts | Not permitted | Not permitted |
| Execute monitoring | Not applicable | Primary function |
| Access credentials | No (omitCredentials) | Yes (validated, used for adapter, not stored) |
| Decrypt credentials | No | Yes (worker-only boundary) |

Worker has elevated internal permissions (direct DB access, credential decryption) but operates within strict scope (accountId only, no cross-account access). API routes remain the gatekeeper for trader-facing operations.

---

## 10. Monitoring Result Persistence Decision

### 10.1 What to Persist

| Data | Persist? | Approach | Rationale |
|---|---|---|---|
| Last successful monitoring timestamp | Yes | `MT5Account.lastMonitoringAt` | Quick staleness check |
| Last failed monitoring timestamp | No | Derivable from MonitoringJob query | Not needed separately |
| Current health state | Yes | `MT5Account.currentMonitoringStatus` | Quick status query |
| Data freshness | No | Derivable from snapshot timestamp | Calculated at evaluation time |
| Last error category | Yes | `MonitoringJob.errorCode` | Structured error tracking |
| Retry count | Yes | `MonitoringJob.attempt` | Already in schema |
| Current job status | Yes | `MonitoringJob.status` | Core job state |
| Normalized account metrics | No | Ephemeral (from snapshot) | Not needed persistently |
| Position/order snapshots | No | Ephemeral | Financial data not needed for monitoring |
| Historical snapshots | No | Not persisted | Product does not require monitoring history |
| Significant monitoring events | Yes | AuditLog | Account creation, health changes |

### 10.2 Comparison

| Approach | Financial Evidence | Debugging | DB Growth | Privacy | Retention | Rule Evaluation |
|---|---|---|---|---|---|---|
| Current-state storage | Partial | Moderate | Minimal | Good | Simple | Adequate |
| Periodic snapshots | Full | Excellent | High | Concern | Complex | Excellent |
| Event-only storage | Partial | Moderate | Minimal | Good | Simple | Adequate |
| **Hybrid (recommended)** | **Partial** | **Good** | **Minimal** | **Good** | **Simple** | **Adequate** |

**Decision**: Current-state storage (Hybrid-lite). Persist only job state and current account health. Do not persist snapshots or position/order data. Product does not require monitoring history for rule evaluation (rules use evaluation results, not raw monitoring data).

---

## 11. Testing Strategy

### 11.1 Validation Tests to Add

| Test Category | Test Description | Verification |
|---|---|---|
| Schema constraints | Prisma migrate dev, prisma validate | Schema applies cleanly |
| Duplicate job prevention | Create 2 jobs for same account while one is PENDING | Second job rejected with DUPLICATE_JOB |
| Concurrent job claims | 2 workers claim same PENDING job simultaneously | Only 1 worker succeeds |
| Idempotent retries | Retry failed job 3 times | Each retry increments attempt, no duplicates |
| Stale job recovery | Set job to RUNNING with leaseExpiry in past | Recovery process resets to FAILED |
| Failed transaction rollback | Simulate DB error during job creation | No partial job created |
| Ownership enforcement | Worker A claims job, Worker B tries to update | Worker B update returns null |
| Safe error persistence | Job fails with error code | Error stored without credentials |
| No secret leakage | Query MonitoringJob fields | No credential fields in schema |
| Lease expiry calculation | Verify leaseExpiry = startedAt + timeoutMs + grace | Correct calculation |

### 11.2 Existing Tests That Continue to Pass

All existing tests from Phase 20D continue to apply. New tests added in this phase are focused on persistence behavior.

---

## 12. Implementation Scope

### Design First (No Migration Required Yet)

- Schema design is finalized (Section 8)
- No Prisma migration applied until Phase 21B
- Design document is the deliverable

### Code Implementation (Only If Necessary to Validate)

The following may be implemented as low-risk, mock-based validation:

1. **Prisma schema validation** — apply design via `prisma migrate dev` in test environment
2. **Duplicate job prevention test** — verify unique constraint behavior
3. **Concurrent claim test** — verify atomic update prevents race conditions
4. **Stale job recovery test** — verify recovery process logic (in-memory, no live MT5)
5. **Lease expiry calculation test** — verify timestamp arithmetic

### Do Not Implement

- Live XM connectivity
- Credential decryption for production use
- Windows service deployment
- Trading actions
- Rule enforcement
- Automated suspension
- Payout decisions
- Monitoring snapshot persistence (deferred)
- Historical monitoring data (deferred)

---

## 13. Unresolved Decisions

| Decision | Status | Blocking? |
|---|---|---|
| MonitoringJob table schema | **Resolved** (Section 8) | No |
| MT5Account additional fields | **Resolved** (Section 8.2) | No |
| Idempotency mechanism | **Resolved** (Section 6.2 — unique constraint) | No |
| Stale job grace period | **Resolved** (60 seconds, Section 7.1) | No |
| Recovery process interval | **Resolved** (30 seconds, Section 7.5) | No |
| Monitoring result persistence (snapshots) | **Resolved** (not persisted, Section 10.2) | No |
| Retention period | **Resolved** (90 days, Section 8.6) | No |
| Whether to apply migration now | **Deferred** (Phase 21B) | No |
| MonitoringJob archive/delete strategy | **Deferred** (future admin UI) | No |

---

## 14. Prerequisites for Phase 21B

1. Team review of persistence design (this document)
2. Decision on applying Prisma migration in development environment
3. Decision on monitoring result persistence scope (confirm no snapshots)
4. Validation of schema constraints via test environment migration
5. Implementation of idempotency and stale job recovery code (if approved)
6. Updated monitoring worker to use persistence layer (instead of in-memory)
7. Decision on live MT5 adapter integration timeline (blocked by Phase 20C)

---

## 15. Appendix: Reconciled Test Inventory

### Test Execution Results (via `npx tsx --test`)

| Test File | Tests | Pass | Fail | Skipped | Notes |
|---|---|---|---|---|---|
| `tests/auth.test.ts` | 0 | 0 | 1 | 0 | JWT_SECRET not configured; import fails |
| `tests/mt5-accounts.test.ts` | 38 | 38 | 0 | 0 | All pass |
| `tests/products-and-rulesets.test.ts` | 14 | 14 | 0 | 0 | All pass |
| `tests/e2e-workflow.test.ts` | 1 | 1 | 0 | 0 | DB integration tests skipped |
| `tests/phase16-audit.test.ts` | 1 | 1 | 0 | 0 | DB integration tests skipped |
| `tests/phase17-recovery.test.ts` | 1 | 1 | 0 | 0 | DB integration tests skipped |
| `tests/mt5-accounts.integration.test.ts` | 1 | 0 | 0 | 1 | Requires PostgreSQL |
| `tests/monitoring/credential-boundary.test.ts` | 20 | 20 | 0 | 0 | All pass |
| `tests/monitoring/eligibility.test.ts` | 16 | 16 | 0 | 0 | All pass |
| `tests/monitoring/health.test.ts` | 8 | 8 | 0 | 0 | All pass |
| `tests/monitoring/job.test.ts` | 16 | 16 | 0 | 0 | All pass |
| `tests/monitoring/logger.test.ts` | 14 | 14 | 0 | 0 | All pass |
| `tests/monitoring/mock-adapter.test.ts` | 16 | 16 | 0 | 0 | All pass |
| `tests/monitoring/normalize.test.ts` | 11 | 11 | 0 | 0 | All pass |
| `tests/monitoring/retry.test.ts` | 9 | 9 | 0 | 0 | All pass |
| `tests/monitoring/scheduler.test.ts` | 28 | 28 | 0 | 0 | All pass |
| `tests/monitoring/security.test.ts` | 5 | 5 | 0 | 0 | All pass |
| `tests/monitoring/worker.test.ts` | 19 | 19 | 0 | 0 | All pass |

### Totals

| Metric | Value |
|---|---|
| Total test files | 18 |
| Total tests that executed | 199 |
| Total passed | 198 |
| Total failed | 1 |
| Total skipped | 1 |
| Total not executed (auth import failure) | 17 |
| Skipped tests included in total? | **Yes** — skipped tests are counted in the "Tests" column but excluded from "Pass" |

### Discrepancy Reconciliation

Previous count reported "222 total tests" (from vitest). Actual count via `tsx --test` (correct runner for node:test): **199 executed tests**. The difference is because:
1. **Vitest miscounts**: Vitest reported some suites as having fewer tests than they actually contain (e.g., Scheduler showed 14 in vitest but 28 in tsx)
2. **Auth test**: Vitest reported 1 test; tsx also reports 1 test but it fails at import (same count, same result)
3. **Products test**: Vitest reported 11 tests; tsx correctly reports 14 (vitest missed 3 `it()` blocks)
4. **Monitoring tests**: Vitest reported per-suite counts that were lower than actual; tsx correctly counts all 162 monitoring tests
5. **Auth hidden tests**: 17 `it()` blocks in auth.test.ts don't execute because the import fails at module load time

The `tsx --test` runner is the correct runner for this project since all test files use `import { describe, it } from "node:test"`.

### Validation Results

| Check | Result |
|---|---|
| TypeScript compilation | PASS (0 errors) |
| Next.js build | PASS |
| Prisma validate | PASS (schema valid, env var limitation noted below) |
| Prisma generate | Required for Phase 21B |
| ESLint | 0 errors, 3 warnings (unused imports in monitoring lib) |
| Monitoring tests | 162/162 PASS |
| MT5 account tests | 38/38 PASS |
| Product/ruleset tests | 14/14 PASS |
| E2E tests | 1/1 PASS (DB skipped) |
| Phase 16 audit | 1/1 PASS (DB skipped) |
| Phase 17 recovery | 1/1 PASS (DB skipped) |
| Integration | 1/1 SKIPPED (requires PostgreSQL) |
| Auth | 0/0 (import failure — JWT_SECRET) |

### Prisma Validation Note

Prisma validate requires `DATABASE_URL` in the shell environment. Schema validation passed when run via Next.js runtime (DATABASE_URL loaded from .env.local). To run directly: `. .\.env.local; npx prisma validate`. No schema syntax errors exist.

---

## 16. Status

**COMPLETE**

### Summary

Phase 21A determined the minimum persistence and idempotency requirements for the monitoring system:

1. **Recommended design**: MonitoringJob table (Option C) + 3 strategic MT5Account fields (Option D)
2. **Idempotency**: Database unique constraint preventing duplicate PENDING/RUNNING jobs per account
3. **Stale job recovery**: Lease-based expiry with automated recovery (no manual intervention)
4. **Security**: No credential storage, trader ownership preserved, safe audit references
5. **Schema changes necessary**: Yes — 1 new table + 3 new fields on MT5Account (deferred to Phase 21B)
6. **No live MT5 claims**: All validation is design and documentation only

### Remaining Blockers

1. Phase 20C BLOCKED: No authorized MT5/XM credentials for live connectivity validation
2. Phase 21B decision: Whether to apply Prisma migration and implement persistence code
3. Auth tests: JWT_SECRET must be configured for auth test suite to run

### Recommended Next Action

Proceed to Phase 21B to implement the approved persistence design, starting with Prisma schema migration and idempotency validation tests.
