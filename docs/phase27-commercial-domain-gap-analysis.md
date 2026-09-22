# Phase 27 WP0 — Repository and Phase 26 Audit

**Date:** 2026-09-22
**Phase:** 27
**WP:** 0
**Status:** COMPLETED

---

## 1. Working Tree Inspection

| Item | Value |
|------|-------|
| Branch | master |
| Commits | 2 (05af245, aea4361) |
| Stash | Empty |
| Modified (pre-existing) | 8 files (.env.example, .gitignore, docs/architecture.md, eslint.config.mjs, package.json, pnpm-lock.yaml, pnpm-workspace.yaml, tsconfig.json) |
| Untracked | ~70+ files (all implementation, docs, tests, scripts, .github/) |
| Uncommitted | All changes uncommitted |
| New from Phase 26 | `.github/workflows/ci.yml`, `lib/logger.ts`, 10 doc files |

---

## 2. WP0–WP9 Numbering Inconsistency

### Issue

Both Phase 25 and Phase 26 use WP0 through WP9 (10 work packages each). Phase 27 also uses WP0 through WP9. This creates ambiguity when referencing work packages across phases.

### Verification

| Phase | WP Count | WP Range |
|-------|----------|----------|
| Phase 25 | 9 | WP0–WP8 (from context) |
| Phase 26 | 10 | WP0–WP9 (from brief) |
| Phase 27 | 10 | WP0–WP9 (from brief) |

**Note:** Phase 26 documents were labeled with Phase 26 numbers but used the same WP0–WP9 structure as Phase 25 and Phase 27. This is a numbering convention inconsistency, not a functional issue.

### Resolution

All Phase 27 work packages are numbered WP0–WP9 as specified in the Phase 27 brief. Phase 26 documents are referenced by their document names (e.g., `docs/phase26-summary.md`), not by WP number.

---

## 3. Dependency and Implementation Map

### 3.1 Existing Models That Support Commercial Workflows

| Model | Supports | Gap |
|-------|----------|-----|
| **Trader** | Order ownership, evaluation, funded account | No email verification, no notification prefs |
| **Product** | Order item, pricing snapshot | Has price, currency, rulesetId, accountSize |
| **Ruleset** | Evaluation config | No version-published-to-product link |
| **RulesetVersion** | Evaluation runs | Has rules, can be referenced by OrderItem |
| **Evaluation** | Post-order evaluation | No orderId link, no paidAt timestamp |
| **FundedAccount** | Post-evaluation account | No lifecycle management, no payout |
| **MT5Account** | Account allocation | No order linkage |
| **AccountAssignment** | Trader↔Account mapping | No product/order context |
| **AuditLog** | All audit events | Needs new AuditAction values for commercial events |
| **MonitoringJob** | Background work | In-memory scheduler |

### 3.2 Models That Need Creation (Per Phase 26 Design)

| Model | Dependencies | Risk |
|-------|-------------|------|
| **Order** | None (new) | LOW — additive |
| **OrderItem** | Order, Product (new) | LOW — additive |
| **Payment** | Order (new) | LOW — additive |
| **PaymentAttempt** | Payment (new) | LOW — additive |
| **LedgerEntry** | None (new) | LOW — additive |
| **Refund** | Payment (new) | LOW — additive |
| **PayoutRequest** | FundedAccount (new) | LOW — additive |
| **Notification** | Trader (new) | LOW — additive |
| **Dispute** | Payment, Order (new) | LOW — additive |

### 3.3 Implementation Priority Map

```
Phase 27 Minimum Viable Implementation:

1. Order + OrderItem (no dependencies)
   └─ Creates order, links to trader + product
   └─ Snapshots pricing at purchase time

2. Payment Abstraction (depends on Order)
   └─ Provider-neutral interface
   └─ Mock adapter only
   └─ No real payment processing

3. Evaluation Activation (depends on Order, Payment)
   └─ Server-side workflow only
   └─ Uses existing allocateAccount()
   └─ Idempotent activation

4. Funded Account Lifecycle (depends on Evaluation)
   └─ Lifecycle states defined
   └─ Low-risk improvements only

5. Ledger Entry (depends on Order, Payment)
   └─ Minimal financial records
   └─ Duplicate prevention
```

### 3.4 Existing APIs That Can Be Extended

| Existing API | Commercial Use | Extension |
|-------------|---------------|-----------|
| `/api/products` | Order source | Add listing for trader catalog |
| `/api/products/[id]` | Product detail | Snapshot for order item |
| `/api/rulesets` | Evaluation config | Order references ruleset version |
| `/api/accounts` | Account management | Account allocation for evaluation |
| `/api/auth/login` | Authentication | Required for all commercial APIs |

### 3.5 Reusable Components

| Component | Path | Reusability for Phase 27 |
|-----------|------|----------|
| Auth/session | `lib/auth/session.ts` | HIGH — JWT-based auth for all commercial APIs |
| Auth/hash | `lib/auth/hash.ts` | N/A — no changes needed |
| Auth/validation | `lib/auth/validation.ts` | MEDIUM — needs order/payment input validation |
| Encryption | `lib/encryption.ts` | N/A — no payment credentials to encrypt |
| Allocation | `lib/allocation.ts` | HIGH — used by evaluation activation |
| Recovery | `lib/recovery.ts` | HIGH — used for partial failure recovery |
| Release | `lib/release.ts` | MEDIUM — used for order cancellation |
| Cleanup helper | `lib/cleanup-helper.ts` | HIGH — test cleanup |
| Logger | `lib/logger.ts` | HIGH — new, can be used in all new code |
| Audit logging | Prisma AuditLog model | HIGH — append events for commercial operations |

---

## 4. Duplicate Concept Check

| Concept | Existing | New | Conflict | Resolution |
|---------|----------|-----|----------|------------|
| FundedAccount vs PayoutRequest | FundedAccount exists | PayoutRequest new | DISTINCT — different lifecycle | Keep separate |
| Order vs AccountAssignment | AccountAssignment exists | Order new | DISTINCT — Order is purchase, Assignment is allocation | OrderItem links to Assignment |
| Payment vs LedgerEntry | LedgerEntry new | Payment new | DISTINCT — Payment is transaction, Ledger is record | Both created, different purposes |
| Evaluation vs OrderItem | Evaluation exists | OrderItem new | DISTINCT — Evaluation is challenge, OrderItem is purchase | OrderItem creates Evaluation |
| ProductPurchase | None | Merged into OrderItem | — | No separate model |
| EvaluationPurchase | None | Merged into OrderItem | — | No separate model |

---

## 5. Schema Changes Required (Per WP2–WP4)

### 5.1 New Models (to be added to prisma/schema.prisma)

| Model | Fields (minimum) | Dependencies |
|-------|-----------------|--------------|
| **Order** | id, orderNumber, traderId, productId, rulesetVersionId, status, currency, totalAmount, idempotencyKey, status, createdAt, updatedAt | None |
| **OrderItem** | id, orderId, productId, unitPrice, currency, quantity, status, createdAt | Order, Product |
| **Payment** | id, orderId, status, amount, currency, idempotencyKey, provider, externalRefId, providerStatus, createdAt, updatedAt | Order |
| **LedgerEntry** | id, entryNumber, orderId, paymentId, traderId, type, amount, currency, description, idempotencyKey, createdAt | None (references optional) |

### 5.2 Schema Extension Points

| Model | Field to Add | Purpose | Risk |
|-------|-------------|---------|------|
| Evaluation | `orderId`? | Link evaluation to order | MEDIUM — nullable, no FK constraint |
| AuditLog | New AuditAction values | Commercial events | LOW — append-only enum |
| Product | `description` already nullable | — | NONE |

### 5.3 Models NOT to Create (per existing design)

- No PaymentProvider model (provider selection pending)
- No Transaction model (LedgerEntry serves this purpose)
- No ProductPurchase model (merged into OrderItem)
- No EvaluationPurchase model (merged into OrderItem)

---

## 6. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema migration fails on existing data | HIGH | Test on Neon branch first |
| New FK constraints break existing data | MEDIUM | All new FKs nullable |
| Order creation duplicates | HIGH | Idempotency key enforcement |
| Payment status inconsistency | HIGH | Separate internal vs provider status |
| Audit log overload | MEDIUM | Append-only, no real-time queries |
| Evaluation double-activation | HIGH | Idempotent activation + unique constraint |
| Allocation failure after payment | HIGH | Documented manual intervention |

---

## 7. Implementation Status

| Item | Status | Notes |
|------|--------|-------|
| Repository audit | PASS | This document |
| Phase 26 documents reviewed | PASS | All 10 docs |
| Schema gap analysis | PASS | 4 new models needed |
| Duplicate concept check | PASS | No conflicts |
| Reusable components | PASS | 10 components identified |
| Schema changes proposed | DOCUMENTED | To be implemented in WP2 |
| Code changes required | NONE | WP0 is documentation only |
