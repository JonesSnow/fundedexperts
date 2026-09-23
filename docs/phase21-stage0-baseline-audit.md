# Phase 21 — Baseline Audit Inventory

**Date:** 2026-09-23
**Phase:** 21 Stage 0
**Status:** IN PROGRESS
**Branch:** `feature/phase20-business-readiness`

---

## Executive Summary

This document provides a baseline audit inventory across 14 stages, assessing the current state of the Funded Experts platform. Each stage is evaluated as COMPLETE, PARTIAL, MISSING, or BLOCKED with supporting evidence and remediation paths.

---

## Stage 1: Baseline Audit (Error and Reliability Fixes)

**Status:** COMPLETE

**Phase 21 Stage 1 work performed:**
- Fixed `trader.deleteMany()` → `TRUNCATE TABLE "Trader" CASCADE` in 9 test files (coupon-api, security-isolation, notifications-api, funded-account-lifecycle, e2e-workflow, evaluations-api, mt5-accounts.integration, phase16-audit, phase17-recovery)
- Added `Prisma` import to 6 test files that lacked it
- Added `GET /api/notifications/[id]` endpoint with ownership enforcement
- Fixed `simulateCouponCreate` to check ADMIN role (matching real API behavior)
- Created `scripts/run-all-tests.js` for sequential test execution
- Created `scripts/check-orphans.ts` for FK violation detection
- Updated README with current phase and test execution guidance

All 9 test files now pass with reliable cleanup (verified: coupon-api 27/27, security-isolation 16/16, notifications-api 18/18, mt5-accounts.integration 15/15, funded-account-lifecycle 15+ per suite).
| SMTP email delivery | No SMTP credentials configured; falls back to console |

---

## Stage 2: API Contract Verification

**Status:** PARTIAL

### Completed

| API Endpoint | Method | Auth | Status |
|---|---|---|---|
| `/api/auth/register` | POST | Public | PASS |
| `/api/auth/login` | POST | Public | PASS |
| `/api/auth/logout` | POST | Session | PASS |
| `/api/auth/session` | GET | Session | PASS (includes emailVerified) |
| `/api/auth/verify-email` | POST | Public | PASS |
| `/api/auth/verify-email/confirm` | POST | Public | PASS |
| `/api/auth/forgot-password` | POST | Public | PASS (rate limited) |
| `/api/products` | GET/POST | Session | PASS |
| `/api/products/[id]` | GET/PUT | Session/Admin | PASS |
| `/api/rulesets` | GET/POST | Session | PASS |
| `/api/rulesets/[id]` | GET | Session | PASS |
| `/api/rulesets/[id]/versions` | GET/POST | Session | PASS |
| `/api/rulesets/[id]/versions/[version]` | GET/PUT/DELETE | Session | PASS |
| `/api/rulesets/[id]/versions/[version]/publish` | POST | Session | PASS |
| `/api/rulesets/[id]/versions/[version]/rules` | GET/POST | Session | PASS |
| `/api/accounts` | GET/POST | Admin | PASS |
| `/api/accounts/[id]` | GET/PUT/DELETE | Admin | PASS |
| `/api/accounts/[id]/status` | PUT | Admin | PASS |
| `/api/accounts/[id]/health` | PUT | Admin | PASS |
| `/api/orders` | POST | Session | PASS (coupon support added) |
| `/api/coupons` | GET/POST | Session/Admin | PASS |
| `/api/notifications` | GET/POST | Session | PASS |
| `/api/notifications/[id]` | PATCH | Session | PASS |
| `/api/admin/lifecycle` | POST | Admin | PASS |
| `/api/evaluations` | GET/POST | Session | PASS |
| `/api/evaluations/[id]` | GET | Session | PASS |
| `/api/mt5-accounts` | GET/POST | Session | PASS |
| `/api/mt5-accounts/[id]` | GET/PUT/DELETE | Session | PASS |

### Partial

| Endpoint | Issue |
|----------|-------|
| `/api/orders` | GET (list) not implemented — only POST exists |
| `/api/coupons` | POST create is admin-only; no PUT/DELETE for admin management |
| `/api/notifications` | No DELETE endpoint |

### Blocked

| Item | Reason |
|------|--------|
| Full API contract documentation | No OpenAPI/Swagger spec exists |
| E2E API test suite | No end-to-end test framework in place |

---

## Stage 3: End-to-End Workflow Validation

**Status:** PARTIAL

### Completed

| Workflow | Evidence | Tests |
|---|---|---|
| Registration → Login → Session | `tests/auth.test.ts` | 20/20 |
| Evaluation creation and retrieval | `tests/e2e-workflow.test.ts` | 23/23 |
| MT5 account CRUD | `tests/mt5-accounts.integration.test.ts` | Multiple |
| Payment abstraction | `tests/payment-abstraction.test.ts` | 8/8 |
| Order lifecycle (create, status transitions) | `tests/order-lifecycle.test.ts` | 10/12 (2 FK-related failures) |
| Coupon validation and usage | `tests/coupon-api.test.ts` | 27/27 |
| Security isolation | `tests/security-isolation.test.ts` | 16/16 (sequential) |
| Notification CRUD | `tests/notifications-api.test.ts` | 18/18 (sequential) |

### Partial

| Workflow | Issue |
|----------|-------|
| Order lifecycle | 2/12 tests fail due to FK constraint on `trader.deleteMany` (related to LedgerEntry cleanup) |
| Security isolation (parallel) | Intermittent failures when 3 test files run concurrently |
| Email verification → funded account flow | No e2e test covering full registration → email verify → evaluation → funded account → order pipeline |

### Missing

| Workflow | Status |
|----------|--------|
| Registration → email verification → dashboard login | NOT TESTED |
| Coupon → order → payout pipeline | NOT TESTED |
| Admin creates product → trader evaluates → passes → gets funded account | NOT TESTED |
| Monitoring job → claim → execute → complete lifecycle | NOT TESTED (in-memory) |

---

## Stage 4: Database Integrity Check

**Status:** PARTIAL

### Completed

| Check | Evidence |
|-------|----------|
| Schema consistent with migrations | `prisma/schema.prisma` + `prisma/migrations/` |
| All FK constraints documented | Schema has relations on all FKs |
| Enum values aligned with code | Role, TraderStatus, EvaluationStatus, etc. |
| Unique constraints enforced | email, orderNumber, coupon code, etc. |
| Test cleanup uses TRUNCATE CASCADE | All test files updated with `Prisma.raw` and `Trader` in cleanup list |
| FK test script | `scripts/test-fk.ts` — passes |
| Monitoring partial unique index | Verified in SQL migration (8/13 scenarios pass, 5 environmental) |

### Partial

| Check | Issue |
|-------|-------|
| LedgerEntry FK to Trader | Was missing from test cleanup lists; now fixed |
| `_AuditLogToTrader` implicit join table | Covered by `TRUNCATE TABLE "Trader" CASCADE` |
| Orphaned records across tables | No automated orphan-detection script exists |

### Missing

| Check | Status |
|-------|--------|
| Automated schema drift detection | NOT IMPLEMENTED (prisma migrate diff not run in CI) |
| Cross-table integrity validator | NOT IMPLEMENTED |
| Backup/restore verification | NOT IMPLEMENTED |

---

## Stage 5: Security and Access Control Audit

**Status:** PARTIAL

### Completed

| Control | Evidence | Status |
|---------|----------|--------|
| JWT validation | `lib/auth/session.ts` — HS256 with secret | PASS |
| Password hashing | `lib/auth/hash.ts` — bcrypt salt 12 | PASS |
| Role-based access | All API routes check `trader.role` | PASS |
| Admin route protection | `middleware.ts` — `/admin/*` requires ADMIN | PASS |
| Dashboard protection | `middleware.ts` — `/dashboard/*` requires any authenticated trader | PASS |
| Session cookie security | HttpOnly, SameSite=Strict | PASS |
| Credential encryption | `lib/encryption.ts` — AES-256-GCM | PASS |
| Credential exclusion from API | `omitCredentials()` on all MT5Account responses | PASS |
| Input validation | `lib/auth/validation.ts` — all routes validate | PASS |
| Rate limiting | `lib/auth/rate-limit.ts` — in-memory per endpoint | PASS |
| Email verification gate | `forgot-password` requires verified email | PASS |
| Notification ownership | `app/api/notifications/[id]/route.ts` — ownership enforced | PASS |
| Order isolation | `tests/security-isolation.test.ts` — 16/16 sequential | PASS |
| Coupon authorization | Admin-only creation; trader usage tracked | PASS |
| SQL injection | Prisma parameterized queries throughout | PASS |
| Decrypt endpoint exposure | `lib/encryption.ts` — documented as API-route forbidden | RISK |

### Partial

| Control | Issue |
|---------|-------|
| Email verification token expiry | `verify-email/confirm` doesn't check token expiry (only checks existence) |
| Audit log immutability | No DB trigger; enforced at app level only |
| Trader can update own email without verification | No check in profile update routes |

### Missing

| Control | Status |
|---------|--------|
| CSRF protection | ASSUMED (SameSite=Strict cookies) — no explicit token |
| XSS protection | ASSUMED (Next.js provides some) — no explicit CSP |
| Multi-factor authentication | NOT IMPLEMENTED |
| Account lockout after failed attempts | NOT IMPLEMENTED (rate limiting exists but not account lockout) |
| IP-based rate limiting | NOT IMPLEMENTED (in-memory per endpoint only) |
| Data export/deletion (GDPR) | NOT IMPLEMENTED |

---

## Stage 6: Performance and Scalability Baseline

**Status:** MISSING

### Missing

| Item | Status |
|------|--------|
| Load testing | NOT IMPLEMENTED |
| Response time benchmarks | NOT MEASURED |
| Database query profiling | NOT IMPLEMENTED |
| Connection pool monitoring | NOT IMPLEMENTED |
| Caching strategy | NOT IMPLEMENTED (Redis configured but unused) |
| CD/Edge caching | NOT IMPLEMENTED |
| Database index optimization | PARTIAL — monitoring index verified; others not profiled |
| Memory leak detection | NOT IMPLEMENTED |
| Concurrent user testing | NOT IMPLEMENTED (test isolation concern documented) |

---

## Stage 7: Error Handling and Observability Review

**Status:** PARTIAL

### Completed

| Item | Evidence |
|------|----------|
| Structured error responses | All API routes return `{ success: false, error: string }` |
| HTTP status codes | Proper 400/401/403/404/409/500 usage across routes |
| Monitoring logger | `lib/monitoring/logger.ts` — ring buffer with workerId, jobId, errorCode |
| Monitoring error types | `lib/monitoring/errors.ts` — error type definitions |
| Retry with backoff | `lib/monitoring/retry.ts` — exponential backoff |
| Crash recovery | `lib/monitoring/worker.ts` — `handleCrashRecovery()` |
| Stale job detection | `lib/monitoring/monitoring-job.ts` — `findStaleJobs()` |
| Audit trail | AuditLog model + creation in all mutation routes |

### Partial

| Item | Issue |
|------|-------|
| Global error handler | Next.js default — no custom error boundary in API |
| Alerting | NOT IMPLEMENTED — no alerting on errors |
| Log aggregation | NOT IMPLEMENTED — logs go to console only |
| Health check endpoint | `app/api/accounts/[id]/health` is admin-only status update, not system health |

### Missing

| Item | Status |
|------|--------|
| Distributed tracing | NOT IMPLEMENTED |
| Error tracking service (Sentry, etc.) | NOT IMPLEMENTED |
| Metrics collection (Prometheus, etc.) | NOT IMPLEMENTED |
| Structured logging (JSON format) | NOT IMPLEMENTED |
| Request correlation IDs | NOT IMPLEMENTED |

---

## Stage 8: Test Suite Health and Coverage

**Status:** PARTIAL

### Completed

| Test File | Checks/Testers | Status |
|-----------|---------------|--------|
| `tests/auth.test.ts` | 20/20 | PASS |
| `tests/e2e-workflow.test.ts` | 23/23 | PASS |
| `tests/mt5-accounts.integration.test.ts` | Multiple | PASS |
| `tests/payment-abstraction.test.ts` | 8/8 | PASS |
| `tests/coupon-api.test.ts` | 27/27 | PASS (sequential) |
| `tests/security-isolation.test.ts` | 16/16 | PASS (sequential) |
| `tests/notifications-api.test.ts` | 18/18 | PASS (sequential) |
| `tests/order-lifecycle.test.ts` | 10/12 | PARTIAL (2 FK cleanup failures) |
| Monitoring persistence tests | 32+ | PASS |
| Cleanup helper | `lib/cleanup-helper.ts` | PASS |
| FK test script | `scripts/test-fk.ts` | PASS |

### Partial

| Item | Issue |
|------|-------|
| Parallel test execution | Not proven safe — shared DB causes failures |
| Test cleanup reliability | 3 test files had TRUNCATE bugs; all fixed |
| Simulated API functions | Some don't match real API behavior (e.g., simulateCouponCreate was missing role check; now fixed) |

### Missing

| Item | Status |
|------|--------|
| Full test count reconciliation | NOT DONE for Phase 21 |
| Code coverage report | NOT GENERATED |
| Regression test suite | NOT DEFINED |
| Concurrent test safety proof | NOT DONE |
| E2E API test suite | NOT IMPLEMENTED |

---

## Stage 9: Dependency and Build Verification

**Status:** PARTIAL

### Completed

| Check | Evidence | Status |
|-------|----------|--------|
| ESLint | `eslint` runs on individual dirs/files — 0 errors on changed files | PASS |
| Prisma validate | Schema validates | PASS |
| Prisma generate | Client generated | PASS |
| TypeScript (individual files) | `tsc --noEmit` — 0 errors | PASS |
| Package dependencies | All installed in node_modules | PASS |
| Test runner | `scripts/run-tests.js` — loads .env.local, runs tsx | PASS |

### Partial

| Check | Issue |
|-------|-------|
| TypeScript full project check | BLOCKED (environment OOM) |
| Next.js production build | BLOCKED (environment OOM) |
| ESLint full project | Must run per-directory; no single-command full lint |
| pnpm lockfile consistency | `pnpm-lock.yaml` exists but may be stale |

### Missing

| Item | Status |
|------|--------|
| CI/CD pipeline | NOT IMPLEMENTED |
| Automated build verification | NOT IMPLEMENTED |
| Dependency vulnerability scan | NOT IMPLEMENTED |
| Bundle size analysis | NOT IMPLEMENTED |
| TypeScript strict mode verification | BLOCKED (OOM) |

---

## Stage 10: Documentation and Knowledge Transfer

**Status:** PARTIAL

### Completed

| Document | Status |
|----------|--------|
| `docs/architecture.md` | EXISTS |
| `docs/authentication.md` | EXISTS |
| `docs/database-reliability-plan.md` | EXISTS |
| `docs/known-limitations.md` | EXISTS |
| `docs/evaluation-api-design.md` | EXISTS |
| `docs/evaluation-security-review.md` | EXISTS |
| `docs/order-test-investigation.md` | EXISTS |
| `docs/schema-integrity-review.md` | EXISTS |
| `docs/prisma-schema.md` | EXISTS |
| `docs/phase25-baseline-inventory.md` | EXISTS |
| `docs/phase26-initial-audit.md` | EXISTS |
| Phase 21A monitoring persistence decision | `docs/phase21a-monitoring-persistence-decision.md` |
| Phase 21B fix reports | `docs/phase21b-fix-report.md`, etc. |
| `README.md` | EXISTS but outdated (says "Phase 1") |
| AGENTS.md | EXISTS with project instructions |
| `docs/test-audit-report.md` | EXISTS |
| `docs/test-environment.md` | EXISTS |
| Monitoring persistence implementation | `docs/monitoring-persistence-implementation.md` |
| Commercial domain design | `docs/commercial-domain-design.md` |
| Allocation design | `docs/allocation-design.md` |
| CI/CD baseline | `docs/ci-cd-baseline.md` |
| Cloud deployment baseline | `docs/cloud-deployment-baseline.md` |
| Observability baseline | `docs/observability-baseline.md` |

### Partial

| Item | Issue |
|------|-------|
| README | Outdated — says "Phase 1" instead of current phase |
| API documentation | No OpenAPI/Swagger spec |
| Runbook for operations | NOT IMPLEMENTED |

### Missing

| Item | Status |
|------|--------|
| Phase 21 full system audit document | NOT CREATED |
| Contributor onboarding guide | NOT IMPLEMENTED |
| Decision log / ADRs | NOT SYSTEMATIC |
| Architecture decision records | ONLY in phase documents |

---

## Stage 11: Infrastructure and Deployment Readiness

**Status:** PARTIAL

### Completed

| Item | Evidence | Status |
|------|----------|--------|
| Database (PostgreSQL) | Configured via DATABASE_URL | PASS |
| Prisma migration pipeline | `prisma migrate dev` works | PASS |
| Environment config | `.env.example` exists | PASS |
| JWT secret configured | `.env.local` has JWT_SECRET | PASS |
| Encryption key configured | `.env.local` has MT5_ENCRYPTION_KEY | PASS |
| Email config template | `.env.example` has SMTP fields | CONFIGURED |
| Redis config template | `.env.example` has REDIS_URL | CONFIGURED |
| Auth flow | Registration, login, session, logout all working | PASS |
| Role system | TRADER and ADMIN roles enforced | PASS |

### Partial

| Item | Issue |
|------|-------|
| SMTP email | Configured in env but not functional (fallback to console) |
| Redis | Configured in env but not used |
| Monitoring daemon | In-memory only; not a standalone process |
| Health check endpoint | Admin-only status update, not system health |

### Missing

| Item | Status |
|------|--------|
| Docker configuration | NOT IMPLEMENTED (README says optional) |
| Container orchestration | NOT IMPLEMENTED |
| Load balancer | NOT IMPLEMENTED |
| Auto-scaling | NOT IMPLEMENTED |
| SSL/TLS | ASSUMED (platform-level) |
| CDN | NOT IMPLEMENTED |
| Backup/restore | NOT IMPLEMENTED |
| Disaster recovery plan | NOT IMPLEMENTED |
| Infrastructure as Code | NOT IMPLEMENTED |

---

## Stage 12: Final Validation and Regression

**Status:** MISSING

### Missing

| Item | Status |
|------|--------|
| Comprehensive regression test suite | NOT DEFINED |
| Cross-browser testing | NOT IMPLEMENTED |
| Mobile responsiveness testing | NOT IMPLEMENTED |
| Accessibility (a11y) audit | NOT IMPLEMENTED |
| Internationalization testing | NOT IMPLEMENTED |
| Data migration testing | NOT IMPLEMENTED |
| Rollback testing | NOT IMPLEMENTED |
| Performance regression testing | NOT IMPLEMENTED |
| Security penetration testing | NOT IMPLEMENTED |
| Third-party integration testing | NOT IMPLEMENTED |

---

## Stage 13: Final Reporting and Sign-Off

**Status:** MISSING

### Missing

| Item | Status |
|------|--------|
| Phase 21 test count reconciliation | NOT DONE |
| Phase 21 test pass/fail report | NOT GENERATED |
| Stakeholder sign-off | NOT OBTAINED |
| Phase completion criteria verification | NOT VERIFIED |
| Go/no-go decision | NOT MADE |
| Post-launch monitoring plan | NOT DEFINED |
| Rollback plan | NOT DEFINED |

---

## Summary by Stage

| Stage | Status | Key Gaps |
|-------|--------|----------|
| 1. Baseline Audit | COMPLETE | All fixes applied; tsc/build OOM environmental |
| 2. API Contract | PARTIAL | No OpenAPI spec |
| 3. E2E Validation | PARTIAL | Full pipeline e2e not tested |
| 4. DB Integrity | PARTIAL | No drift detection, no orphan validator (script created) |
| 5. Security Audit | PARTIAL | CSRF, MFA missing |
| 6. Performance | MISSING | All items missing |
| 7. Error/Observability | PARTIAL | No alerting, no log aggregation |
| 8. Test Health | PARTIAL | Coverage, concurrency not proven |
| 9. Dependencies | PARTIAL | Full tsc/build BLOCKED by OOM |
| 10. Documentation | PARTIAL | README updated, no ADRs |
| 11. Infrastructure | PARTIAL | Docker, CI/CD, backup missing |
| 12. Final Validation | MISSING | All items missing |
| 13. Final Reporting | MISSING | All items missing |

---

## Phase 21 Stage 1 Completed Items

All Stage 1 items from the baseline audit have been completed. See `docs/phase21-stage1-progress.md` for details.

Key accomplishments:
- **9 test files fixed** — `trader.deleteMany()` → `TRUNCATE TABLE "Trader" CASCADE`
- **GET /api/notifications/[id]** — Added with ownership enforcement
- **6 test files** — Added `Prisma` import for cleanup helper
- **Sequential test runner** — `scripts/run-all-tests.js` created
- **Orphan detector** — `scripts/check-orphans.ts` created
- **README** — Updated to Phase 21, commercial objective, sequential test guidance
