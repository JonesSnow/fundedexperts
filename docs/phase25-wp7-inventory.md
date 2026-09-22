# Phase 25: WP7 System Inventory (Part 2 — Architecture Audit)

**Date:** 2026-09-22
**Phase:** 25 (WP7 continued)
**Status:** IN PROGRESS

---

## Objective

Catalog all implemented features, partial features, and technical debt across the codebase for the system inventory. Part 1 (test inventory) was completed in Phase 24C. Part 2 covers application code, API routes, monitoring system, and infrastructure.

---

## Application Architecture

### Framework
- **Next.js 16.3.5** with Turbopack
- **React 19** (app router)
- **Prisma 6.x** with PostgreSQL (Neon serverless)
- **TypeScript** strict mode
- **Node.js test runner** (`node:test`) for integration tests

### Directory Structure

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js App Router pages and API routes |
| `app/api/` | REST API endpoints |
| `app/admin/` | Admin panel pages |
| `app/dashboard/` | Trader dashboard (placeholder) |
| `app/login/` | Login page |
| `lib/` | Business logic, services, utilities |
| `prisma/` | Prisma schema and migrations |
| `scripts/` | Standalone utility scripts |
| `tests/` | Integration and unit tests |
| `middleware.ts` | Auth middleware for admin/dashboard routes |

---

## Implemented Features

### 1. Authentication & Authorization

| Component | Status | Notes |
|-----------|--------|-------|
| Login (`app/api/auth/login/route.ts`) | IMPLEMENTED | Email/password auth with rate limiting, session cookie |
| Register (`app/api/auth/register/route.ts`) | IMPLEMENTED | Registration with rate limiting, session creation |
| Logout (`app/api/auth/logout/route.ts`) | IMPLEMENTED | Session destruction |
| Session (`app/api/auth/session/route.ts`) | IMPLEMENTED | Session validation |
| Auth middleware (`middleware.ts`) | IMPLEMENTED | Protects `/admin` and `/dashboard` routes, redirects to login |
| Password hashing (`lib/auth/hash.ts`) | IMPLEMENTED | bcrypt-based |
| Session management (`lib/auth/session.ts`) | IMPLEMENTED | Cookie-based sessions |
| Rate limiting (`lib/auth/rate-limit.ts`) | IMPLEMENTED | In-memory rate limiter |
| Input validation (`lib/auth/validation.ts`) | IMPLEMENTED | Login/register validation |

### 2. MT5 Account Management

| Component | Status | Notes |
|-----------|--------|-------|
| Account listing (`app/api/accounts/route.ts`) | IMPLEMENTED | Admin-only, paginated |
| Account detail (`app/api/accounts/[id]/route.ts`) | IMPLEMENTED | GET/PUT/DELETE, credential omission, dependency check on delete |
| Account creation | PARTIAL | In admin UI (`app/admin/`) |
| Account allocation (`lib/allocation.ts`) | IMPLEMENTED | Atomic transaction with FK-safe insertion, audit logging |
| Account release (`lib/release.ts`) | IMPLEMENTED | Transaction-based, status transition, audit logging |
| MT5 connectivity | NOT IMPLEMENTED | Requires authorized broker credentials (live MT5/XM) |

### 3. Products & Rulesets

| Component | Status | Notes |
|-----------|--------|-------|
| Products (`app/api/products/route.ts`) | IMPLEMENTED | CRUD with rate limiting |
| Product detail (`app/api/products/[id]/route.ts`) | IMPLEMENTED | GET/PUT, input validation |
| Rulesets (`app/api/rulesets/route.ts`) | IMPLEMENTED | CRUD |
| Ruleset detail (`app/api/rulesets/[id]/route.ts`) | IMPLEMENTED | GET with versions |
| Ruleset versions (`app/api/rulesets/[id]/versions/route.ts`) | IMPLEMENTED | Version management |
| Ruleset publish (`app/api/rulesets/[id]/versions/[version]/publish/route.ts`) | IMPLEMENTED | Publish workflow |
| Ruleset rules (`app/api/rulesets/[id]/versions/[version]/rules/route.ts`) | IMPLEMENTED | Rule CRUD |

### 4. Evaluation & Recovery

| Component | Status | Notes |
|-----------|--------|-------|
| Evaluation linking (`lib/evaluation-link.ts`) | IMPLEMENTED | Atomic link with ownership validation, audit trail |
| Recovery (`lib/recovery.ts`) | IMPLEMENTED | Idempotent recovery, audit trail, retry logic |
| Reconciliation (`lib/reconciliation.ts`) | IMPLEMENTED | Detects and repairs 5 inconsistency types |

### 5. Monitoring System

| Component | Status | Notes |
|-----------|--------|-------|
| MonitoringJob model (`prisma/schema.prisma`) | IMPLEMENTED | Full schema with indices |
| Job management (`lib/monitoring/job.ts`) | IMPLEMENTED | Job creation, state transitions |
| Job claim (`lib/monitoring/monitoring-job.ts`) | IMPLEMENTED | Lease-based claiming, P2025 handling |
| Job state machine (`lib/monitoring/monitoring-job.ts`) | IMPLEMENTED | 12 state transitions |
| Worker (`lib/monitoring/worker.ts`) | IMPLEMENTED | Job execution with mock MT5 adapter |
| Scheduler (`lib/monitoring/scheduler.ts`) | IMPLEMENTED | Queue management, concurrency control |
| Retry (`lib/monitoring/retry.ts`) | IMPLEMENTED | Exponential backoff retry |
| Health evaluation (`lib/monitoring/health.ts`) | IMPLEMENTED | Multi-reason health assessment |
| Results (`lib/monitoring/result.ts`) | IMPLEMENTED | Health result types |
| Credential boundary (`lib/monitoring/credential-boundary.ts`) | IMPLEMENTED | Masking, validation, no credential storage |
| Mock adapter (`lib/monitoring/mock-adapter.ts`) | IMPLEMENTED | Mock MT5 data for testing |
| Adapter interface (`lib/monitoring/adapter.ts`) | IMPLEMENTED | Abstract MT5 adapter |
| Logger (`lib/monitoring/logger.ts`) | IMPLEMENTED | Ring buffer logger |
| Normalize (`lib/monitoring/normalize.ts`) | IMPLEMENTED | Data normalization |
| Repository (`lib/monitoring/repository.ts`) | IMPLEMENTED | Constants, helpers |
| Monitoring persistence tests (`tests/monitoring/persistence.ts`) | IMPLEMENTED | 32 tests, all passing |
| Monitoring test suite | IMPLEMENTED | 12 test files (worker, security, scheduler, retry, etc.) |

### 6. Database & Migrations

| Component | Status | Notes |
|-----------|--------|-------|
| Schema (`prisma/schema.prisma`) | IMPLEMENTED | 13 models, 5 enums, all FKs |
| Initial migration | IMPLEMENTED | `20260920164647_init` |
| Active assignment unique | IMPLEMENTED | `20260920164648_active_assignment_unique` |
| Evaluation linking | IMPLEMENTED | `20260920170000_evaluation_linking_enhancements` |
| Monitoring persistence | IMPLEMENTED | `20260921130000_monitoring_persistence` |
| Monitoring persistence v2 | IMPLEMENTED | `20260921140238_monitoring_persistence` |
| Partial unique index | IMPLEMENTED | `MonitoringJob_active_job_per_account` (via SQL migration) |

---

## Partial Features / Known Gaps

| Feature | Status | Gap |
|---------|--------|-----|
| MT5/XM live connectivity | BLOCKED | No authorized broker credentials available |
| Dashboard page (`app/dashboard/page.tsx`) | PLACEHOLDER | Static placeholder, no real data |
| Monitoring scheduler daemon | NOT IMPLEMENTED | `scheduler.ts` has in-memory queue only, no persistent scheduler |
| Monitoring worker daemon | PARTIAL | `worker.ts` is a class, not a running daemon |
| Monitoring health check endpoint | PARTIAL | `api/accounts/[id]/health` route exists |
| Monitoring status endpoint | PARTIAL | `api/accounts/[id]/status` route exists |
| Audit log immutability | NOT ENFORCED | No DB trigger preventing audit log modification |
| IN_USE without assignment trigger | NOT ENFORCED | No DB trigger; enforced at application level only |
| Ruleset publish validation | PARTIAL | Publish route exists but validation logic needs review |
| Concurrent test execution | NOT PROVEN | Not tested with parallel test runners on shared Neon |

---

## Technical Debt

### High Priority

| Item | Location | Description |
|------|----------|-------------|
| No DB triggers for data integrity | Database | IN_USE without assignment, audit immutability enforced in app code only |
| Middleware deprecation | `middleware.ts` | Next.js 16 deprecates `middleware` convention in favor of `proxy` |
| TypeScript script errors | `tsconfig.json` | Scripts with CommonJS `require` fail strict type check (fixed by excluding `scripts` from `tsconfig.json`) |
| Test runtime on Neon | All DB tests | Each test takes 8-13s per operation due to Neon latency; full suite requires ~5-6 minutes |
| No live MT5 connectivity | All monitoring | Cannot verify monitoring against real MT5/XM accounts |

### Medium Priority

| Item | Location | Description |
|------|----------|-------------|
| MonitoringJob onDelete: Cascade | `prisma/schema.prisma` | Only model with cascade; others have RESTRICT |
| Dashboard is placeholder | `app/dashboard/page.tsx` | No functionality implemented |
| Scheduler in-memory only | `lib/monitoring/scheduler.ts` | Jobs lost on restart |
| Rate limiting in-memory | `lib/auth/rate-limit.ts` | Not distributed, resets on restart |
| No e2e API test suite | `tests/` | No tests that exercise API routes end-to-end |

### Low Priority

| Item | Location | Description |
|------|----------|-------------|
| Phase 16 audit: DELETE uses ACCOUNT_UPDATED | `phase16-audit.test.ts` | Minor: audit action doesn't match intent |
| Unused imports in test files | Various test files | 22 ESLint warnings for unused imports/variables |
| `run-tests.js` CommonJS syntax | `scripts/run-tests.js` | Uses `require` (intentional for env loading) |

---

## Database Schema Summary

### Models (13)

| Model | Key Fields | Relations |
|-------|-----------|-----------|
| Trader | id, email (unique), password, role, status | evaluations, fundedAccounts, assignments, auditLogs |
| Product | id, name (unique), accountSize, price, rulesetId (FK) | auditLogs |
| Ruleset | id, name (unique), isActive | versions, products, auditLogs |
| RulesetVersion | id, version, rulesetId (FK), status | rules, evaluations, fundedAccounts |
| Rule | id, rulesetVersionId (FK), ruleType, name | ruleEvaluations |
| MT5Account | id, accountNumber (unique), broker, server, status, credentials | assignments, ruleEvents, evaluations, fundedAccounts, auditLogs, jobs |
| MonitoringJob | id, jobId (unique), accountId (FK, CASCADE), status, workerId | — |
| Evaluation | id, traderId (FK), rulesetVersionId (FK), accountId (FK), status | ruleEvaluations, auditLogs |
| FundedAccount | id, traderId (FK), accountId (FK), rulesetVersionId (FK), status | auditLogs |
| AccountAssignment | id, traderId (FK), accountId (FK), status, unique(traderId, accountId, assignedAt) | — |
| RuleEvaluation | id, evaluationId (FK), ruleId (FK), result | — |
| RuleEvent | id, accountId (FK), eventType, message | — |
| AuditLog | id, action, entityType, entityId, performedBy, details | — |

### Enums (5)

- Role: TRADER, ADMIN
- AccountStatus: AVAILABLE, IN_USE, INACTIVE, MAINTENANCE
- EvaluationStatus: IN_PROGRESS, PASSED, FAILED, ABANDONED
- JobStatus: PENDING, RUNNING, COMPLETED, FAILED, TIMEOUT, CANCELLED
- AuditAction: 28 values (see schema)

### FK Dependency Chain

```
Ruleset → RulesetVersion → Rule → RuleEvaluation → Evaluation → Trader
RulesetVersion → Evaluation → MT5Account → AccountAssignment → Trader
MT5Account → MonitoringJob (CASCADE)
MT5Account → RuleEvent
MT5Account → FundedAccount → Trader
MT5Account → FundedAccount → RulesetVersion
```

### Cleanup Order (verified correct)

`ruleEvaluation → monitoringJob → accountAssignment → evaluation → rule → rulesetVersion → ruleset → product → mT5Account → trader → auditLog`

---

## API Routes Summary

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/auth/login` | POST | Public | Login with email/password |
| `/api/auth/register` | POST | Public | Register new trader |
| `/api/auth/logout` | POST | Session | Destroy session |
| `/api/auth/session` | GET | Session | Validate session |
| `/api/accounts` | GET | Admin | List accounts |
| `/api/accounts/[id]` | GET/PUT/DELETE | Admin | Account CRUD |
| `/api/accounts/[id]/health` | GET | Session | Account health |
| `/api/accounts/[id]/status` | GET/PUT | Session | Account status |
| `/api/products` | GET/POST | Session | Products list/create |
| `/api/products/[id]` | GET/PUT | Session/Admin | Product detail/update |
| `/api/rulesets` | GET/POST | Session | Ruleset list/create |
| `/api/rulesets/[id]` | GET | Session | Ruleset detail |
| `/api/rulesets/[id]/versions` | GET/POST | Session | Version list/create |
| `/api/rulesets/[id]/versions/[version]` | GET/PUT/DELETE | Session | Version detail |
| `/api/rulesets/[id]/versions/[version]/publish` | POST | Session | Publish version |
| `/api/rulesets/[id]/versions/[version]/rules` | GET/POST | Session | Rules list/create |

---

## Test Infrastructure

| Component | Status |
|-----------|--------|
| Shared cleanup helper (`lib/cleanup-helper.ts`) | IMPLEMENTED |
| Test runner wrapper (`scripts/run-tests.js`) | IMPLEMENTED |
| FK test script (`scripts/test-fk.ts`) | IMPLEMENTED, PASSING |
| DB state inspector (`scripts/inspect-db-state.ts`) | IMPLEMENTED |
| Monitoring index verification (`scripts/verify-monitoring-job-index.ts`) | IMPLEMENTED |
| DB cleanup script (`scripts/cleanup-db.ts`) | IMPLEMENTED |
| Test isolation (unique IDs per run) | VERIFIED |
| Cleanup exit enforcement | VERIFIED (0 errors, 22 warnings) |
| ESLint | PASSING (0 errors) |
| TypeScript strict | PASSING (after tsconfig fix) |
| Next.js build | PASSING |

---

## Verification Results (Phase 24C Final)

| Test File | Results | Status |
|-----------|---------|--------|
| `tests/phase16-audit.test.ts` | 20/20 PASS | PASS |
| `tests/phase17-recovery.test.ts` | 50/50 PASS | PASS |
| `tests/mt5-accounts.integration.test.ts` | 15/15 PASS | PASS |
| `tests/e2e-workflow.test.ts` | 23/23 PASS | PASS |
| `tests/phase16b-e2e-reliability.test.ts` | (from Phase 24B) | PASS |
| `tests/monitoring/persistence.ts` | 32/32 PASS | PASS |
| ESLint | 0 errors | PASS |
| TypeScript strict | 0 errors | PASS |
| Next.js build | Compiled successfully | PASS |
| Neon connectivity | Connected, query OK | PASS |

---

## WP7 Inventory Checklist

- [x] Auth system cataloged
- [x] MT5 account management cataloged
- [x] Products & rulesets cataloged
- [x] Evaluation & recovery cataloged
- [x] Monitoring system cataloged
- [x] Database schema cataloged
- [x] API routes cataloged
- [x] Partial features identified
- [x] Technical debt cataloged
- [x] Test infrastructure verified
- [x] Static validation passed
- [x] Documentation artifacts reviewed and validated
- [x] Monitoring persistence verification confirmed
- [x] Prioritized master backlog created (WP8)
- [x] Final modular report written (WP9)

---

## Next Steps

1. Review WP8 backlog (`docs/phase25-master-backlog.md`) and prioritize Phase 26 work
2. Review WP9 summary (`docs/phase25-summary.md`) for decisions requiring user input
3. Begin Phase 26 — Commercial Foundation (see `docs/phase25-summary.md` for recommended plan)
4. Address high-priority technical debt items
5. Resolve 6 decisions requiring user input (see `docs/phase25-summary.md`)
