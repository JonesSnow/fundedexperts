# Phase 26 WP0 — Repository and Phase 25 Audit

**Date:** 2026-09-22
**Phase:** 26
**Status:** COMPLETED

---

## 1. Repository State

### Branch and Working Tree

| Item | Value |
|------|-------|
| Branch | master |
| Commits | 2 (05af245 docs: add approved domain model, aea4361 Initial project setup) |
| Stash | Empty |
| Modified (pre-existing, untracked) | 8 files: `.env.example`, `.gitignore`, `docs/architecture.md`, `eslint.config.mjs`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json` |
| Untracked | ~60+ files (docs, app pages, lib, tests, scripts, prisma) |
| No commits | All work is uncommitted |

### Application Structure

| Component | Location | Status |
|-----------|----------|--------|
| Next.js app | `app/` | PASS — 19 routes compile |
| API routes | `app/api/**/route.ts` | 17 endpoints |
| Admin UI | `app/admin/` | PARTIAL — placeholder tabs |
| Dashboard | `app/dashboard/page.tsx` | FAIL — static placeholder |
| Home page | `app/page.tsx` | FAIL — Next.js starter |
| Auth | `lib/auth/` | PASS — session, hash, rate-limit, validation |
| Middleware | `middleware.ts` | PARTIAL — deprecated convention |
| DB | `prisma/schema.prisma` | PASS — 13 models, 5 enums |
| Monitoring | `lib/monitoring/` | PASS — 20 modules |
| Encryption | `lib/encryption.ts` | PASS — AES-256-GCM, write-only API |
| Allocation | `lib/allocation.ts` | PASS — transactional with FK safety |
| Cleanup | `lib/cleanup-helper.ts` | PASS — assertCleanup pattern |
| Tests | `tests/` | 18 test files |
| Scripts | `scripts/` | 3 scripts (run-tests, cleanup-db, verify-monitoring) |

---

## 2. Existing Models — Commercial Relevance Assessment

### Directly Relevant (Exist)

| Model | Commercial Use | Gaps |
|-------|---------------|------|
| **Trader** | Customer identity | No email verification, no MFA, no notification prefs |
| **Product** | purchasable offering | Has price, currency — good for orders |
| **Ruleset** | Evaluation config | No version-published-to-product link |
| **RulesetVersion** | Snapshot | Missing: publishedAt, changelog |
| **Evaluation** | Challenge session | No order link, no payment link |
| **FundedAccount** | Post-evaluation account | No payout, no transaction history |
| **MT5Account** | Trading account | No order linkage, no statement |
| **AccountAssignment** | Trader↔Account mapping | No product/order context |
| **AuditLog** | Event history | No financial event types |
| **MonitoringJob** | Background work | In-memory scheduler |
| **RuleEvaluation** | Rule results | No re-evaluation on change |

### Missing — Required for Commercial Workflows

| Needed Concept | Exists? | How Addressed |
|---------------|---------|---------------|
| **Order** | NO | See WP1 |
| **OrderItem** | NO | See WP1 |
| **Payment** | NO | See WP1 |
| **PaymentAttempt** | NO | See WP1 |
| **Transaction/LedgerEntry** | NO | See WP1 |
| **Refund** | NO | See WP1 |
| **ProductPurchase** | NO | See WP1 (may merge with OrderItem) |
| **EvaluationPurchase** | NO | See WP1 (may merge with OrderItem) |
| **PayoutRequest** | NO | See WP1 |
| **Payout** | NO | See WP1 |
| **Fee/Adjustment** | NO | See WP1 |
| **Notification** | NO | See WP1 |
| **Dispute** | NO | See WP1 |
| **Currency/Multi-currency** | Partial | Product has `currency: String` default "USD"; no exchange rate model |
| **Idempotency key** | NO | No idempotency on any API |
| **External provider reference** | NO | No provider config model |
| **Payment status** | NO | No payment status enum or field |
| **Order status** | NO | No order status enum or model |

---

## 3. Existing APIs

| Route | Methods | Auth | Purpose | Commercial Relevance |
|-------|---------|------|---------|---------------------|
| `/api/auth/login` | POST | Public | Login | Foundation |
| `/api/auth/register` | POST | Public | Register | Foundation |
| `/api/auth/logout` | POST | Session | Destroy session | Foundation |
| `/api/auth/session` | GET | Session | Validate session | Foundation |
| `/api/products` | GET/POST | Session/Admin | Products list/create | **Direct** — orderable products |
| `/api/products/[id]` | GET/PUT | Session/Admin | Product detail/update | **Direct** |
| `/api/rulesets` | GET/POST | Session | Ruleset list/create | **Direct** — evaluation config |
| `/api/rulesets/[id]` | GET | Session | Ruleset detail | **Direct** |
| `/api/rulesets/[id]/versions` | GET/POST | Session | Version list/create | **Direct** |
| `/api/rulesets/[id]/versions/[version]` | GET/PUT/DELETE | Session | Version detail | **Direct** |
| `/api/rulesets/[id]/versions/[version]/publish` | POST | Session | Publish version | **Direct** |
| `/api/rulesets/[id]/versions/[version]/rules` | GET/POST | Session | Rules list/create | **Direct** |
| `/api/accounts` | GET/POST | Admin | MT5 account management | **Direct** — account allocation |
| `/api/accounts/[id]` | GET/PUT/DELETE | Admin | Account CRUD | **Direct** |
| `/api/accounts/[id]/status` | GET/PUT | Session | Account status | **Direct** |
| `/api/accounts/[id]/health` | GET | Session | Account health | **Direct** |

### Missing APIs (for commercial workflows)

| Needed API | Purpose |
|-----------|---------|
| `/api/orders` | Create/View orders |
| `/api/orders/[id]` | Order detail |
| `/api/payments` | Payment initiation/status |
| `/api/payments/webhook` | Provider callback |
| `/api/ledger` | Transaction history |
| `/api/payouts` | Payout requests |
| `/api/notifications` | User notifications |
| `/api/disputes` | Dispute management |
| `/api/catalog` | Product catalog for traders |

---

## 4. Existing Test Suites

| Test File | Scope | Pass Rate (clean DB) |
|-----------|-------|---------------------|
| `tests/auth.test.ts` | Authentication | PASS |
| `tests/products-and-rulesets.test.ts` | Products/Rulesets | PASS |
| `tests/phase16-audit.test.ts` | Audit verification | PASS — 20/20 |
| `tests/phase17-recovery.test.ts` | Evaluation linking recovery | PASS — 50/50 |
| `tests/e2e-workflow.test.ts` | End-to-end workflow | PASS — 23/23 |
| `tests/mt5-accounts.test.ts` | MT5 account CRUD | PASS |
| `tests/mt5-accounts.integration.test.ts` | MT5 integration | PASS — 15/15 |
| `tests/monitoring/*.test.ts` | Monitoring system | PASS — 11 modules |

### Test Infrastructure

| Component | Status |
|-----------|--------|
| `lib/cleanup-helper.ts` | PASS — `runCleanupSteps` + `assertCleanup` |
| `scripts/run-tests.js` | PASS — loads .env.local, runs commands |
| `scripts/cleanup-db.ts` | PASS — DB cleanup utility |
| `scripts/verify-monitoring-job-index.ts` | PARTIAL — 8/13 scenarios pass (environmental) |
| Test isolation | PASS — unique IDs per run |
| Cleanup exit enforcement | PASS — all tests exit non-zero on failure |

---

## 5. Reusable Components

| Component | Path | Reusability |
|-----------|------|------------|
| Auth/session | `lib/auth/session.ts` | HIGH — JWT-based, works for all user-facing flows |
| Auth/hash | `lib/auth/hash.ts` | HIGH — bcrypt password hashing |
| Auth/rate-limit | `lib/auth/rate-limit.ts` | MEDIUM — in-memory; needs Redis for distributed |
| Auth/validation | `lib/auth/validation.ts` | HIGH — input validation patterns |
| Encryption | `lib/encryption.ts` | HIGH — AES-256-GCM; encrypt/decrypt available |
| Allocation | `lib/allocation.ts` | HIGH — transactional account allocation |
| Cleanup helper | `lib/cleanup-helper.ts` | HIGH — test cleanup tracking |
| Monitoring | `lib/monitoring/` | MEDIUM — 20 modules, mock-adapter pattern |
| Recovery | `lib/recovery.ts` | MEDIUM — recovery workflow |
| Reconciliation | `lib/reconciliation.ts` | MEDIUM — data reconciliation |
| Audit logging | `lib/audit.ts` (via prisma) | HIGH — append-only pattern |

---

## 6. Duplicate or Conflicting Concepts

| Concept | Existing | Conflict | Resolution |
|---------|----------|----------|------------|
| FundedAccount vs Order | `FundedAccount` model | FundedAccount = post-evaluation account; Order = purchase intent | DISTINCT — keep separate |
| FundedAccount vs Payout | `FundedAccount` model | FundedAccount holds funded state; Payout = withdrawal request | DISTINCT — new Payout model |
| AccountAssignment vs Order | `AccountAssignment` model | Assignment = trader→account link; Order = purchase transaction | DISTINCT — Order references Assignment |
| MT5Account credentials | `credentials: String?` on MT5Account | Stores encrypted string | OK — no separate Credential model needed |
| Product pricing | `price: Decimal?` on Product | Sufficient for order total | OK — extend with tax/discount later |
| Evaluation results | `totalPnl`, `maxDrawdown` on Evaluation | Financial metrics stored | OK — separate from Ledger |
| AuditLog vs Business logs | `AuditLog` model | Only audit events, no operational logs | EXTEND — see WP5 |

---

## 7. Risks and Dependencies

### Technical Risks

| # | Risk | Impact | Probability | Mitigation |
|---|------|--------|-------------|------------|
| 1 | DB test fragility on dirty state | HIGH | CONFIRMED | Use cleanup-db.ts before tests |
| 2 | Neon intermittent connectivity | MEDIUM | CONFIRMED | Retry logic, connection pooling |
| 3 | Middleware deprecation (Next.js 16 → proxy) | MEDIUM | CERTAIN | Migration planned |
| 4 | No CI/CD pipeline | HIGH | CONFIRMED | WP3 addresses this |
| 5 | In-memory rate limiting | MEDIUM | CERTAIN | Redis dependency |
| 6 | Scheduler in-memory | MEDIUM | CONFIRMED | Worker persistence needed |
| 7 | No migration rollback plan | HIGH | CERTAIN | WP4 addresses this |
| 8 | TypeScript scripts excluded from type check | LOW | INTENTIONAL | Documented in tsconfig.json |
| 9 | Dashboard placeholder | MEDIUM | CONFIRMED | WP1+Phase 26 address |
| 10 | Audit log no DB-level immutability | MEDIUM | CERTAIN | Trigger-based, WP4/WP7 |
| 11 | No webhook verification | CRITICAL | CONFIRMED | Payment provider integration |
| 12 | Silent allocation failure (evaluation linking) | HIGH | CONFIRMED | Documented at lib/allocation.ts:130 |
| 13 | No idempotency on any API | HIGH | CONFIRMED | Critical for payment callbacks |
| 14 | No transaction/ledger model | HIGH | CONFIRMED | Critical for financial audit |

### External Dependencies

| Dependency | Status | Used For | Risk |
|-----------|--------|----------|------|
| Neon PostgreSQL | CONNECTED (intermittent) | Primary database | Serverless pooler scaling |
| Prisma 6.19.3 | INSTALLED | ORM | No paid plugins needed |
| Next.js 16.3.5 | INSTALLED | Framework | Middleware migration needed |
| bcrypt 6.0.0 | INSTALLED | Password hashing | OK |
| jose 6.2.12 | INSTALLED | JWT handling | OK |
| MT5 terminal | NOT RUN | Monitoring | BLOCKED — no credentials |
| Python MetaTrader5 | INSTALLED | MT5 bridge | BLOCKED — no terminal auth |
| Redis | NOT CONFIGURED | Caching, rate limiting | NOT IN USE |
| SMTP | NOT CONFIGURED | Email | NOT IN USE |
| Stripe/PayPal | NOT INSTALLED | Payments | NOT IN USE |
| GitHub Actions | NOT CONFIGURED | CI/CD | NOT IN USE |
| Vercel | NOT DEPLOYED | Hosting | NOT DEPLOYED |
| AWS EC2 Windows | NOT PROVISIONED | MT5 host | NOT PROVISIONED |

---

## 8. Recommended Implementation Order

### Phase 26 — Commercial Foundation (Current Phase)

| Priority | Item | Rationale |
|----------|------|-----------|
| 1 | **Order + OrderItem models** | Foundation for all commercial workflows |
| 2 | **Payment + PaymentAttempt models** | Required before any money movement |
| 3 | **Transaction/LedgerEntry model** | Required before any financial reporting |
| 4 | **CI/CD pipeline** | Validation baseline for all changes |
| 5 | **Cloud deployment baseline** | Architecture decisions before implementation |
| 6 | **Database reliability plan** | Safety before financial data |
| 7 | **Observability baseline** | Logging before production traffic |
| 8 | **Commercial domain design** | Document before implementing APIs |
| 9 | **Security review** | Identify risks before exposing new endpoints |

### Later Phases (27+)

| Priority | Item | Rationale |
|----------|------|-----------|
| 1 | FundedAccount management layer | Transition evaluation → funded |
| 2 | PayoutRequest + Payout models | Trader withdrawals |
| 3 | Notification model + service | User communications |
| 4 | Dashboard replacement | Trader-facing features |
| 5 | Dispute model | Financial dispute handling |
| 6 | Refund model | Transaction reversals |
| 7 | Live MT5 connectivity | Requires authorized credentials |
| 8 | Monitoring worker deployment | Requires cloud infrastructure |

---

## 9. Schema Compatibility Matrix

| Commercial Concept | Schema Support | Action Needed |
|-------------------|---------------|---------------|
| Trader purchase history | NONE | New: Order, OrderItem |
| Payment tracking | NONE | New: Payment, PaymentAttempt |
| Financial ledger | NONE | New: LedgerEntry |
| Refund tracking | NONE | New: Refund |
| Funded account ownership | EXISTS (FundedAccount) | EXTEND fields |
| Payout requests | NONE | New: PayoutRequest |
| Notifications | NONE | New: Notification |
| Disputes | NONE | New: Dispute |
| Product→Evaluation link | WEAK (Product.rulesetId) | New: OrderItem bridges |
| Order→Account link | NONE | New: Order relation |
| Currency precision | Partial (Decimal on Product, MT5Account) | Standardize all monetary fields |
| Idempotency | NONE | New: idempotency_key column |
| Provider reference | NONE | New: PaymentProvider model |

---

## 10. Decisions Documented in WP0

| # | Decision | Status | Rationale |
|---|----------|--------|-----------|
| D1 | Keep existing Trader, Product, Ruleset, MT5Account models | APPROVED | Stable, reusable, no duplication |
| D2 | FundedAccount stays as-is for now | APPROVED | Extend later in Phase 27 |
| D3 | No PaymentProvider model yet | DOCUMENTED | Provider selection pending user decision |
| D4 | MonitoringJob cascade deletion acceptable | DOCUMENTED | Only model with cascade; reviewed in Phase 24B |
| D5 | AuditLog extends with financial action types | APPROVED | Add new AuditAction enum values in Phase 27 |
| D6 | Decimal(18,2) precision standard | APPROVED | Consistent with existing models |
| D7 | Multi-currency deferred | DOCUMENTED | Phase 28 per backlog |
| D8 | No Payment webhook implementation yet | DOCUMENTED | Provider selection required first |
