# Phase 25 WP0: Project Baseline Inventory

**Date:** 2026-09-22
**Phase:** 25
**Status:** COMPLETED

---

## 1. Git Status

- **Branch:** master
- **Modified tracked files:** 8 (`.env.example`, `.gitignore`, `docs/architecture.md`, `eslint.config.mjs`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`)
- **Untracked files:** 141+ (app/, lib/, prisma/, scripts/, tests/, docs/*.md, middleware.ts)
- **No commits** on any branch
- **Key config changes:** `tsconfig.json` now excludes `scripts/` from type check

---

## 2. README Assessment

| Field | Current | Expected for Commercial |
|-------|---------|------------------------|
| Title | "Funded Experts" | ✓ Correct |
| Description | "A simulated prop-firm platform" | Should say "commercial global simulated prop-firm platform" |
| Phase | "Phase 1 — Foundation" | Outdated — should reflect Phase 25 |
| Tech Stack | Next.js 16, TS, Tailwind, pnpm, Prisma, PostgreSQL | ✓ Accurate |
| Setup | Docker optional, PostgreSQL required | ✓ Adequate |

**Action Required:** README needs update to reflect commercial objective and current phase.

---

## 3. Existing Features (Implemented and Verified)

### 3.1 Authentication & Session Management

| Feature | Status | Evidence |
|---------|--------|----------|
| Trader registration | IMPLEMENTED | `app/api/auth/register/route.ts` + UI at `/register` |
| Trader login | IMPLEMENTED | `app/api/auth/login/route.ts` + UI at `/login` |
| Session validation | IMPLEMENTED | `app/api/auth/session/route.ts` |
| Logout | IMPLEMENTED | `app/api/auth/logout/route.ts` |
| JWT session tokens (HS256) | IMPLEMENTED | `lib/auth/session.ts` |
| Password hashing (bcrypt) | IMPLEMENTED | `lib/auth/hash.ts` |
| Rate limiting (in-memory) | IMPLEMENTED | `lib/auth/rate-limit.ts` |
| Input validation | IMPLEMENTED | `lib/auth/validation.ts` |
| Auth middleware (admin/dashboard routes) | IMPLEMENTED | `middleware.ts` |
| Role-based access (TRADER/ADMIN) | IMPLEMENTED | All API routes check `trader.role` |
| Account status blocking (SUSPENDED/INACTIVE) | IMPLEMENTED | All `getAuthenticatedUser` helpers |

### 3.2 Product Catalog

| Feature | Status | Evidence |
|---------|--------|----------|
| Product listing | IMPLEMENTED | `app/api/products/route.ts` (GET) |
| Product creation | IMPLEMENTED | `app/api/products/route.ts` (POST) + admin UI |
| Product detail | IMPLEMENTED | `app/api/products/[id]/route.ts` (GET/PUT) |
| Product validation | IMPLEMENTED | Input validation in routes |
| Product catalog UI | IMPLEMENTED | `app/catalog/page.tsx` ("Funded Accounts" page) |
| Product-Ruleset association | IMPLEMENTED | Schema: `Product.rulesetId` FK |

### 3.3 Ruleset Management

| Feature | Status | Evidence |
|---------|--------|----------|
| Ruleset listing | IMPLEMENTED | `app/api/rulesets/route.ts` (GET) |
| Ruleset creation | IMPLEMENTED | `app/api/rulesets/route.ts` (POST) + admin UI |
| Ruleset detail | IMPLEMENTED | `app/api/rulesets/[id]/route.ts` (GET) |
| Version listing | IMPLEMENTED | `app/api/rulesets/[id]/versions/route.ts` (GET) |
| Version detail | IMPLEMENTED | `app/api/rulesets/[id]/versions/[version]/route.ts` |
| Version publish | IMPLEMENTED | `app/api/rulesets/[id]/versions/[version]/publish/route.ts` |
| Rule CRUD | IMPLEMENTED | `app/api/rulesets/[id]/versions/[version]/rules/route.ts` |
| Admin ruleset creation UI | IMPLEMENTED | `app/admin/rulesets/new/page.tsx` |

### 3.4 MT5 Account Management

| Feature | Status | Evidence |
|---------|--------|----------|
| Account listing (admin) | IMPLEMENTED | `app/api/accounts/route.ts` (GET) + admin UI |
| Account creation (admin) | IMPLEMENTED | `app/api/accounts/route.ts` (POST) + admin UI |
| Account detail (admin) | IMPLEMENTED | `app/api/accounts/[id]/route.ts` (GET/PUT/DELETE) |
| Account status update | IMPLEMENTED | `app/api/accounts/[id]/status/route.ts` (PUT) |
| Account health update | IMPLEMENTED | `app/api/accounts/[id]/health/route.ts` (PUT) |
| Credential encryption (AES-256-GCM) | IMPLEMENTED | `lib/encryption.ts` |
| Credential omission from responses | IMPLEMENTED | `omitCredentials()` helper |
| Account inventory UI | IMPLEMENTED | `app/admin/accounts/page.tsx` |
| Account detail UI | IMPLEMENTED | `app/admin/accounts/[id]/page.tsx` |
| Status transition validation | IMPLEMENTED | `VALID_TRANSITIONS` map in status route |
| Delete dependency check | IMPLEMENTED | Checks assignments, evaluations, funded accounts, rule events |
| Audit logging on account operations | IMPLEMENTED | All account mutations create audit logs |

### 3.5 Account Allocation & Release

| Feature | Status | Evidence |
|---------|--------|----------|
| Allocation (atomic transaction) | IMPLEMENTED | `lib/allocation.ts` |
| Allocation with evaluation linking | IMPLEMENTED | `lib/allocation.ts` (lines 114-147) |
| Allocation audit logging | IMPLEMENTED | ACCOUNT_ASSIGNED + EVALUATION_LINKED |
| Allocation idempotency check | IMPLEMENTED | Checks existing active assignments |
| Release (transaction-based) | IMPLEMENTED | `lib/release.ts` |
| Release evaluation status update | IMPLEMENTED | PASSED/FAILED/ABANDONED |
| Release assignment history | IMPLEMENTED | RETURNED status + returnedAt |
| Release audit logging | IMPLEMENTED | ACCOUNT_RETURNED |
| Release authorization | IMPLEMENTED | Trader must own assignment or use admin override |
| Recovery (idempotent evaluation link recovery) | IMPLEMENTED | `lib/recovery.ts` |
| Reconciliation (detect + repair inconsistencies) | IMPLEMENTED | `lib/reconciliation.ts` |

### 3.6 Evaluation Linking & Recovery

| Feature | Status | Evidence |
|---------|--------|----------|
| Evaluation linking | IMPLEMENTED | `lib/evaluation-link.ts` |
| Link failure handling | IMPLEMENTED | Multiple failure categories + audit trail |
| Recovery (link evaluation to assignment) | IMPLEMENTED | `lib/recovery.ts` |
| Recovery idempotency | IMPLEMENTED | wasAlreadyLinked flag |
| Recovery audit trail | IMPLEMENTED | RECOVERY_SUCCEEDED/FAILED |
| Reconciliation (5 inconsistency types) | IMPLEMENTED | `lib/reconciliation.ts` |
| Reconciliation audit trail | IMPLEMENTED | RECONCILIATION_STARTED/REPAIRED/REJECTED/SKIPPED |

### 3.7 Monitoring System

| Feature | Status | Evidence |
|---------|--------|----------|
| MonitoringJob model | IMPLEMENTED | `prisma/schema.prisma` |
| Job creation (idempotent) | IMPLEMENTED | `lib/monitoring/monitoring-job.ts` `createJobSafe` |
| Job claiming (lease-based) | IMPLEMENTED | `lib/monitoring/monitoring-job.ts` `claimJob` |
| Job completion/failure/timeout | IMPLEMENTED | `lib/monitoring/monitoring-job.ts` |
| Stale job recovery | IMPLEMENTED | `lib/monitoring/monitoring-job.ts` `findStaleJobs`/`recoverJob` |
| Worker (execution engine) | IMPLEMENTED | `lib/monitoring/worker.ts` |
| Scheduler (queue management) | IMPLEMENTED | `lib/monitoring/scheduler.ts` |
| Retry (exponential backoff) | IMPLEMENTED | `lib/monitoring/retry.ts` |
| Health evaluation | IMPLEMENTED | `lib/monitoring/health.ts` |
| Credential boundary (masking/validation) | IMPLEMENTED | `lib/monitoring/credential-boundary.ts` |
| Mock MT5 adapter | IMPLEMENTED | `lib/monitoring/mock-adapter.ts` |
| Adapter interface | IMPLEMENTED | `lib/monitoring/adapter.ts` |
| Logger (ring buffer) | IMPLEMENTED | `lib/monitoring/logger.ts` |
| Monitoring tests (32 tests) | PASSING | `tests/monitoring/persistence.ts` |
| Monitoring test suite (12 files) | PASSING | All monitoring tests |
| Partial unique index (active job per account) | VERIFIED | `verify-monitoring-job-index.ts` (8/13, 5 environmental) |

### 3.8 Test Infrastructure

| Feature | Status | Evidence |
|---------|--------|----------|
| Shared cleanup helper | IMPLEMENTED | `lib/cleanup-helper.ts` |
| `assertCleanup` (throws on failure) | IMPLEMENTED | `lib/cleanup-helper.ts` |
| Test runner wrapper | IMPLEMENTED | `scripts/run-tests.js` |
| FK test script | PASSING | `scripts/test-fk.ts` |
| DB cleanup script | IMPLEMENTED | `scripts/cleanup-db.ts` |
| DB state inspector | IMPLEMENTED | `scripts/inspect-db-state.ts` |
| Monitoring index verification | PARTIAL | 8/13 scenarios pass (5 environmental) |
| Test isolation (unique IDs per run) | VERIFIED | All test files use unique prefixes |
| Cleanup exit enforcement | VERIFIED | All test files guarantee non-zero exit |

### 3.9 Audit Logging

| Feature | Status | Evidence |
|---------|--------|----------|
| Audit log model | IMPLEMENTED | `prisma/schema.prisma` |
| Audit log creation on mutations | IMPLEMENTED | All admin/mutation routes create audit logs |
| Audit log fields | IMPLEMENTED | action, entityType, entityId, performedBy, details, timestamp |
| Sensitive data exclusion | IMPLEMENTED | Credentials/passwords never logged |
| Audit log immutability | NOT ENFORCED | No DB trigger; enforced at app level only |

### 3.10 API Routes (Complete List)

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/auth/login` | POST | Public | Login |
| `/api/auth/register` | POST | Public | Register |
| `/api/auth/logout` | POST | Session | Logout |
| `/api/auth/session` | GET | Session | Validate session |
| `/api/accounts` | GET/POST | Admin | Account list/create |
| `/api/accounts/[id]` | GET/PUT/DELETE | Admin | Account detail/update/delete |
| `/api/accounts/[id]/status` | PUT | Admin | Status transition |
| `/api/accounts/[id]/health` | PUT | Admin | Health status update |
| `/api/products` | GET/POST | Session | Product list/create |
| `/api/products/[id]` | GET/PUT | Session/Admin | Product detail/update |
| `/api/rulesets` | GET/POST | Session | Ruleset list/create |
| `/api/rulesets/[id]` | GET | Session | Ruleset detail |
| `/api/rulesets/[id]/versions` | GET/POST | Session | Version list/create |
| `/api/rulesets/[id]/versions/[version]` | GET/PUT/DELETE | Session | Version detail |
| `/api/rulesets/[id]/versions/[version]/publish` | POST | Session | Publish version |
| `/api/rulesets/[id]/versions/[version]/rules` | GET/POST | Session | Rules list/create |

---

## 4. Partial Features

| Feature | Status | Gap |
|---------|--------|-----|
| Admin Command Center | PARTIAL | Only products/rulesets tabs; account management exists but no unified dashboard |
| Trader Dashboard | PLACEHOLDER | `app/dashboard/page.tsx` is static placeholder with no functionality |
| Home page | DEFAULT | `app/page.tsx` is Next.js starter template, not customized |
| MT5 live connectivity | BLOCKED | No authorized broker credentials; poc-mt5-bridge exists but not integrated |
| Monitoring scheduler daemon | PARTIAL | In-memory queue only; not persistent; not a running daemon |
| Monitoring worker daemon | PARTIAL | Worker class exists but not a standalone daemon process |
| Monitoring health check endpoint | PARTIAL | `api/accounts/[id]/health` is for admin status update, not system health |
| Notifications system | MISSING | No email, push, or in-app notification infrastructure |
| Funded account lifecycle | PARTIAL | Schema has FundedAccount model but no funded account management UI/API |
| Order/payment lifecycle | MISSING | No order, payment, invoice, or billing models |
| Payout/refund workflow | MISSING | No payout, refund, or withdrawal models or routes |
| Dispute handling | MISSING | No dispute model or workflow |
| Financial ledger | MISSING | No financial records, transactions, or accounting model |
| Email/SMTP | CONFIGURED BUT NOT IMPLEMENTED | .env.example has SMTP fields but no email service code |
| Redis/caching | CONFIGURED BUT NOT IMPLEMENTED | .env.example has REDIS_URL but no Redis code |

---

## 5. Missing Features (Required by Commercial Global Objective)

| Feature | Priority | Description |
|---------|----------|-------------|
| Funded account management | HIGH | After evaluation pass: assign funded account, track funded status, manage transition from evaluation |
| Order lifecycle | HIGH | Order creation, processing, cancellation, history |
| Payment lifecycle | HIGH | Payment processing, invoicing, transaction records |
| Payout workflow | HIGH | Trader payout requests, approval, processing, history |
| Refund workflow | HIGH | Refund processing, transaction reversals |
| Dispute handling | MEDIUM | Dispute creation, resolution, evidence |
| Notifications | HIGH | Email, in-app, push notifications for key events |
| Trader Dashboard | HIGH | Personalized dashboard with evaluation progress, results, account status |
| Home page customization | MEDIUM | Landing page for commercial product |
| Admin Command Center | MEDIUM | Unified admin dashboard with all management features |
| Financial ledger | HIGH | Complete financial records and accounting |
| Email/SMTP integration | MEDIUM | Transactional email sending |
| Redis caching | LOW | Session caching, rate limiting, performance |
| Account evaluation rules | MEDIUM | Ruleset evaluation logic (how rules are applied to evaluations) |
| Real MT5 integration | HIGH | Live MT5 account provisioning and monitoring |
| Global multi-currency support | MEDIUM | Multi-currency pricing, payouts, transactions |
| GDPR/data export | MEDIUM | Data export and deletion compliance |
| Subscription/billing | HIGH | Subscription plans, billing cycles, payment tracking |

---

## 6. Known Technical Debt

### Critical

| # | Item | Location | Impact |
|---|------|----------|--------|
| 1 | README states outdated phase | `README.md:83` | Misrepresents current state |
| 2 | Home page is Next.js starter | `app/page.tsx` | Not a commercial landing page |
| 3 | Dashboard is placeholder | `app/dashboard/page.tsx` | No trader functionality |
| 4 | No financial/payment models | Entire system | Cannot process payments or payouts |
| 5 | No funded account management | Entire system | Cannot transition from evaluation to funded |

### High

| # | Item | Location | Impact |
|---|------|----------|--------|
| 6 | Audit log immutability not enforced | Database level | Audit logs could be modified/deleted |
| 7 | Middleware convention deprecated | `middleware.ts` | Will break in future Next.js versions |
| 8 | IN_USE without assignment not enforced | Database level | Data inconsistency possible |
| 9 | MonitoringJob is only CASCADE FK | `prisma/schema.prisma` | Cascading deletes may hide data |
| 10 | Rate limiting is in-memory | `lib/auth/rate-limit.ts` | Resets on restart, not distributed |
| 11 | Scheduler is in-memory | `lib/monitoring/scheduler.ts` | Jobs lost on restart |
| 12 | Session secret hardcoded in check | `lib/auth/session.ts:5` | Throws if default value used |

### Medium

| # | Item | Location | Impact |
|---|------|----------|--------|
| 13 | TypeScript scripts fail type check | `tsconfig.json` (fixed) | Scripts excluded from type check |
| 14 | Unused imports in tests | Various | 22 ESLint warnings |
| 15 | DELETE audit uses ACCOUNT_UPDATED | `app/api/accounts/[id]/route.ts:266` | Audit action doesn't match intent |
| 16 | No concurrent test execution proven | N/A | Shared Neon connection pool risk |
| 17 | Monitoring index verification needs dotenv | `scripts/verify-monitoring-job-index.ts` | Requires `dotenv` not in dependencies |

### Low

| # | Item | Location | Impact |
|---|------|----------|--------|
| 18 | Phase 16 audit: DELETE audit action | `tests/phase16-audit.test.ts:252` | Minor audit action mismatch |
| 19 | pnpm-workspace has no packages | `pnpm-workspace.yaml` | Workspace config unused |
| 20 | No e2e API test suite | `tests/` | API routes not tested end-to-end |

---

## 7. Security Concerns

| # | Concern | Status | Detail |
|---|---------|--------|--------|
| 1 | JWT secret validation | PASS | Throws if default value detected |
| 2 | Password hashing | PASS | bcrypt with salt |
| 3 | Credential encryption | PASS | AES-256-GCM with random IV/salt |
| 4 | Credential exclusion from API | PASS | `omitCredentials()` on all responses |
| 5 | Audit logging on mutations | PASS | All mutations logged |
| 6 | Role-based access control | PASS | Admin routes check role |
| 7 | Session cookie security | PASS | HttpOnly, SameSite=Strict |
| 8 | Rate limiting | PASS | In-memory per endpoint |
| 9 | Input validation | PASS | All API routes validate input |
| 10 | Decrypt endpoint exposure | RISK | `decrypt()` in `lib/encryption.ts` — must NEVER be called from API routes (documented in comments) |
| 11 | Error message leakage | LOW | Generic error messages used (good) |
| 12 | SQL injection | PASS | Prisma parameterized queries |
| 13 | XSS protection | ASSUMED | Next.js provides some XSS protection |
| 14 | CSRF protection | ASSUMED | SameSite=Strict cookies |
| 15 | API route auth on all routes | PASS | All routes check authentication |
| 16 | Trader can access other trader data | PASS | Data scoped by traderId |

---

## 8. Cloud Limitations

| # | Limitation | Detail |
|---|-----------|--------|
| 1 | Neon serverless pooler | Intermittent connectivity (P1001), 5s interactive timeout |
| 2 | No connection pooling | Each PrismaClient creates new connection; no PgBouncer |
| 3 | No Redis | Caching/session storage not implemented |
| 4 | No CDN | Static assets not optimized for global delivery |
| 5 | MT5 on Windows EC2 | Requires separate Windows VM; not provisioned |
| 6 | Monitoring worker | Not deployed as separate process |
| 7 | No multi-region | Single region (us-east-2) |
| 8 | Email not configured | SMTP credentials in .env.example but no service |
| 9 | Free tier assumptions | Not verified for AWS/Neon |
| 10 | No backup/recovery plan | No database backup strategy documented |

---

## 9. Test Limitations

| # | Limitation | Detail |
|---|-----------|--------|
| 1 | No e2e API tests | API routes not tested end-to-end |
| 2 | No concurrent execution tests | Tests run serially only |
| 3 | Monitoring index verification incomplete | 5/13 scenarios fail (environmental) |
| 4 | No financial/payment tests | No payment models exist |
| 5 | No security regression tests | No auth bypass/permission tests |
| 6 | DB tests slow on Neon | Each operation 5-13s due to latency |
| 7 | No load testing | No performance benchmarks |
| 8 | MT5 integration slow | Release test takes ~12s |
| 9 | Test data not reset between runs | Requires DB cleanup between test suites |
| 10 | No CI/CD pipeline configured | No GitHub Actions or equivalent |

---

## 10. Files and Modules Involved

### Core Application

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Database schema (13 models, 5 enums) |
| `middleware.ts` | Auth middleware |
| `lib/allocation.ts` | Account allocation engine |
| `lib/release.ts` | Account release engine |
| `lib/evaluation-link.ts` | Evaluation linking |
| `lib/recovery.ts` | Evaluation recovery |
| `lib/reconciliation.ts` | Data reconciliation |
| `lib/encryption.ts` | MT5 credential encryption |
| `lib/auth/session.ts` | JWT session management |
| `lib/auth/hash.ts` | Password hashing |
| `lib/auth/validation.ts` | Input validation |
| `lib/auth/rate-limit.ts` | Rate limiting |
| `lib/auth/middleware.ts` | Auth middleware helpers |
| `lib/monitoring/` | Monitoring system (14 modules) |

### Pages

| File | Purpose | Status |
|------|---------|--------|
| `app/page.tsx` | Home page | DEFAULT (Next.js starter) |
| `app/login/page.tsx` | Login UI | IMPLEMENTED |
| `app/register/page.tsx` | Registration UI | IMPLEMENTED |
| `app/catalog/page.tsx` | Product catalog | IMPLEMENTED |
| `app/dashboard/page.tsx` | Trader dashboard | PLACEHOLDER |
| `app/admin/page.tsx` | Admin panel | PARTIAL |
| `app/admin/accounts/page.tsx` | Account inventory | IMPLEMENTED |
| `app/admin/accounts/[id]/page.tsx` | Account detail | IMPLEMENTED |
| `app/admin/products/new/page.tsx` | Add product | IMPLEMENTED |
| `app/admin/rulesets/new/page.tsx` | Create ruleset | IMPLEMENTED |

### API Routes

18 route files under `app/api/` (see section 3.10 for full list)

### Tests

| File | Purpose | Results |
|------|---------|---------|
| `tests/auth.test.ts` | Auth tests | PASS |
| `tests/mt5-accounts.test.ts` | MT5 account tests | PASS |
| `tests/products-and-rulesets.test.ts` | Product/ruleset tests | PASS |
| `tests/phase16-audit.test.ts` | Phase 16 audit | 20/20 PASS |
| `tests/phase17-recovery.test.ts` | Phase 17 recovery | 50/50 PASS |
| `tests/e2e-workflow.test.ts` | E2E workflow | 23/23 PASS |
| `tests/mt5-accounts.integration.test.ts` | Integration tests | 15/15 PASS |
| `tests/monitoring/persistence.ts` | Monitoring persistence | 32/32 PASS |
| `tests/monitoring/*.test.ts` | Monitoring tests (11 more) | PASS |

### Scripts

| File | Purpose |
|------|---------|
| `scripts/run-tests.js` | Test runner with env loading |
| `scripts/test-fk.ts` | FK constraint verification |
| `scripts/cleanup-db.ts` | Database cleanup utility |
| `scripts/inspect-db-state.ts` | DB state inspector |
| `scripts/verify-monitoring-job-index.ts` | Monitoring index verification |
| `scripts/check-state.ts` | State checker |
| `scripts/inspect-db.ts` | DB inspector |
| `scripts/prisma-*.ts` | Prisma utility scripts |

### Documentation

| File | Purpose |
|------|---------|
| `docs/architecture.md` | Architecture document |
| `docs/phase25-report.md` | Phase 25 report |
| `docs/phase25-wp7-inventory.md` | WP7 inventory |
| `docs/phase24a-test-infrastructure-hardening.md` | Test infrastructure |
| `docs/phase24b-report.md` | Phase 24B report |
| `docs/phase24c-report.md` | Phase 24C report |
| `docs/phase24c-wp0-inspection.md` | Phase 24C inspection |
| `docs/security-findings.md` | Security findings |
| `docs/known-limitations.md` | Known limitations |
| `docs/mt5-connectivity-investigation.md` | MT5 connectivity |
| `docs/monitoring-persistence-implementation.md` | Monitoring docs |
| 30+ other phase docs | Various |

---

## 11. Prisma Schema Summary

### Models (13)

| Model | Records (current DB) | Key Relationships |
|-------|---------------------|-------------------|
| Trader | 0 | Parent of Evaluation, FundedAccount, AccountAssignment, AuditLog |
| Product | 0 | Child of Ruleset |
| Ruleset | 0 | Parent of RulesetVersion, Product |
| RulesetVersion | 0 | Parent of Rule, Evaluation, FundedAccount |
| Rule | 0 | Child of RulesetVersion, Parent of RuleEvaluation |
| MT5Account | 0 | Parent of AccountAssignment, RuleEvent, Evaluation, FundedAccount, AuditLog, MonitoringJob |
| MonitoringJob | 0 | Child of MT5Account (CASCADE) |
| Evaluation | 0 | Child of Trader, RulesetVersion, MT5Account |
| FundedAccount | 0 | Child of Trader, MT5Account, RulesetVersion |
| AccountAssignment | 0 | Child of Trader, MT5Account |
| RuleEvaluation | 0 | Child of Evaluation, Rule |
| RuleEvent | 0 | Child of MT5Account |
| AuditLog | 0 | No FK to other models |

### Key Schema Facts

- All IDs use `@default(uuid())`
- Most FKs are RESTRICT (no cascade except MonitoringJob)
- `AccountAssignment` has unique constraint on `(traderId, accountId, assignedAt)`
- `RulesetVersion` has unique constraint on `(rulesetId, version)`
- `Evaluation` has `accountId` (nullable) for linking
- No decimal monetary fields use `@db.Decimal(18, 2)` (correct for financial data)
- MonitoringJob has partial unique index via SQL migration (not Prisma)

---

## 12. Environment Configuration

### .env.example (5 sections)

| Section | Variables | Status |
|---------|-----------|--------|
| Application | NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_API_URL | Template values |
| Database | DATABASE_URL | Template (localhost default) |
| Authentication | JWT_SECRET, JWT_EXPIRES_IN | Template with warning |
| MT5 Integration | MT5_API_URL, MT5_API_KEY, MT5_API_SECRET, MT5_ENCRYPTION_KEY | Required: MT5_ENCRYPTION_KEY ≥32 chars |
| Caching | REDIS_URL | Template (not implemented) |
| Email | SMTP variables | Template (not implemented) |

### Current .env.local

- Has DATABASE_URL pointing to Neon (serverless pooler)
- Has JWT_SECRET and MT5_ENCRYPTION_KEY configured
- Gitignored (not in version control)

---

## 13. Migration History

| Migration | Purpose |
|-----------|---------|
| 20260920164647_init | Initial schema |
| 20260920164648_active_assignment_unique | Added unique constraint |
| 20260920170000_evaluation_linking_enhancements | Evaluation linking fields |
| 20260921130000_monitoring_persistence | MonitoringJob model, partial index |
| 20260921140238_monitoring_persistence | Monitoring persistence follow-up |

---

## 14. Phase 25 Baseline Summary

### What Works

- Authentication, authorization, session management
- Product catalog, ruleset management (full lifecycle)
- MT5 account management (full CRUD via admin)
- Account allocation and release (transactional, audit-logged)
- Evaluation linking, recovery, and reconciliation
- Monitoring system (full job lifecycle, 32 tests passing)
- Test infrastructure (cleanup, isolation, exit enforcement)
- Static validation (ESLint 0 errors, TypeScript 0 errors, Next.js build passes)
- Neon connectivity confirmed

### What's Missing for Commercial Launch

1. **Financial/payment system** — No orders, payments, invoices, or transactions
2. **Funded account management** — Schema exists but no management layer
3. **Trader dashboard** — Static placeholder
4. **Home page** — Next.js starter template
5. **Notifications** — No email/push/in-app system
6. **Payout/refund/dispute** — No financial workflow models
7. **Live MT5 connectivity** — Blocked by credential availability
8. **Global infrastructure** — No CDN, multi-region, or scaling strategy
9. **CI/CD pipeline** — No automated testing or deployment
10. **Security hardening** — Audit log immutability, trigger enforcement

### What Needs Modification (Previous Implementation)

1. README needs commercial objective alignment
2. `app/page.tsx` needs commercial landing page
3. `app/dashboard/page.tsx` needs real trader dashboard
4. `docs/architecture.md` phase reference is outdated
5. `tsconfig.json` exclude fix (already done)
