# Phase 25 WP2: Commercial Requirements Gap Analysis

**Date:** 2026-09-22
**Phase:** 25
**Status:** COMPLETED

---

## Methodology

Each requirement from the commercial global simulated prop-firm platform objective was evaluated against the current implementation. Classification:

- **Implemented and verified**: Feature exists and tests pass
- **Implemented but requires changes**: Feature exists but needs modification for commercial use
- **Partially implemented**: Some aspects exist, others missing
- **Missing**: No implementation exists
- **Blocked by external dependency**: Requires external resource or service

---

## Requirements Assessment

### 1. Global Trader Registration

| Field | Value |
|-------|-------|
| Classification | IMPLEMENTED AND VERIFIED |
| Evidence | `app/api/auth/register/route.ts`, `app/register/page.tsx`, `tests/auth.test.ts` |
| Tests | PASS (registration validation, duplicate email rejection, role escalation prevention) |
| Notes | Global registration works; no region-specific logic needed |

### 2. Secure Authentication

| Field | Value |
|-------|-------|
| Classification | IMPLEMENTED AND VERIFIED |
| Evidence | `lib/auth/session.ts`, `lib/auth/hash.ts`, `lib/auth/validation.ts`, `lib/auth/rate-limit.ts` |
| Tests | PASS (JWT sessions, password hashing, validation, rate limiting, role escalation protection) |
| Notes | bcrypt(12), HS256 JWT, HttpOnly cookies, rate limiting |

### 3. Product Catalog

| Field | Value |
|-------|-------|
| Classification | IMPLEMENTED AND VERIFIED |
| Evidence | `app/api/products/route.ts`, `app/api/products/[id]/route.ts`, `app/catalog/page.tsx` |
| Tests | PASS (validation, ruleset version integrity) |
| Notes | Full CRUD; catalog UI displays products with account size and price |

### 4. Versioned Rulesets

| Field | Value |
|-------|-------|
| Classification | IMPLEMENTED AND VERIFIED |
| Evidence | `app/api/rulesets/route.ts`, `app/api/rulesets/[id]/route.ts`, version/publish/rules routes |
| Tests | PASS (version statuses, immutability) |
| Notes | Full lifecycle: create → version → publish → rule management |

### 5. Order Lifecycle

| Field | Value |
|-------|-------|
| Classification | MISSING |
| Evidence | No order model, API route, or UI exists |
| Notes | Requires: Order model, order creation/processing/cancellation, order history |

### 6. Payment Lifecycle

| Field | Value |
|-------|-------|
| Classification | MISSING |
| Evidence | No payment, invoice, or transaction model exists |
| Notes | Requires: Payment model, payment processing, invoicing, transaction records |

### 7. Evaluation Lifecycle

| Field | Value |
|-------|-------|
| Classification | IMPLEMENTED BUT REQUIRES CHANGES |
| Evidence | `lib/allocation.ts`, `lib/evaluation-link.ts`, `lib/recovery.ts`, `lib/reconciliation.ts` |
| Tests | PASS (50/50 phase17, 23/23 e2e) |
| Notes | Core evaluation workflow works; missing evaluation creation API, evaluation result presentation |

### 8. MT5 Allocation

| Field | Value |
|-------|-------|
| Classification | IMPLEMENTED AND VERIFIED |
| Evidence | `lib/allocation.ts`, `tests/mt5-accounts.integration.test.ts` |
| Tests | PASS (15/15) |
| Notes | Transactional allocation with FK-safe ordering, audit logging, concurrent safety |

### 9. Monitoring

| Field | Value |
|-------|-------|
| Classification | IMPLEMENTED AND VERIFIED |
| Evidence | `lib/monitoring/` (14 modules), `tests/monitoring/` (12 files, 32+ tests) |
| Tests | PASS (32/32 persistence, all monitoring tests) |
| Notes | Full job lifecycle, lease-based claiming, stale recovery, health evaluation |

### 10. Rule Enforcement

| Field | Value |
|-------|-------|
| Classification | PARTIALLY IMPLEMENTED |
| Evidence | Rule model exists with types (PROFIT_TARGET, DRAWDOWN_LIMIT, etc.); ruleset versioning works |
| Notes | Rules are stored but no evaluation engine applies rules to evaluations. Rule evaluation logic needs implementation |

### 11. Breach Evidence

| Field | Value |
|-------|-------|
| Classification | MISSING |
| Evidence | No evidence model, storage, or association with evaluation breaches |
| Notes | Requires: Evidence model, file storage reference, evidence association with evaluation events |

### 12. Pass/Fail Decisions

| Field | Value |
|-------|-------|
| Classification | PARTIALLY IMPLEMENTED |
| Evidence | Evaluation status has PASSED/FAILED/ABANDONED; release handles PASSED/FAILED |
| Notes | Decision states exist but no explicit decision API or decision audit trail with reasoning |

### 13. Funded-Account Transition

| Field | Value |
|-------|-------|
| Classification | MISSING |
| Evidence | FundedAccount model exists in schema but no management layer, API, or UI |
| Notes | Requires: Transition workflow from evaluation to funded account, funded account management UI/API |

### 14. Payout Workflow

| Field | Value |
|-------|-------|
| Classification | MISSING |
| Evidence | No payout model, API, or UI |
| Notes | Requires: Payout request, approval workflow, processing, history |

### 15. Refund Workflow

| Field | Value |
|-------|-------|
| Classification | MISSING |
| Evidence | No refund model, API, or UI |
| Notes | Requires: Refund request, processing, transaction reversal |

### 16. Dispute Handling

| Field | Value |
|-------|-------|
| Classification | MISSING |
| Evidence | No dispute model, API, or UI |
| Notes | Requires: Dispute creation, evidence collection, resolution workflow |

### 17. Notifications

| Field | Value |
|-------|-------|
| Classification | MISSING |
| Evidence | SMTP configured in `.env.example` but no notification service |
| Notes | Requires: Notification model, email service, in-app notification, event-driven triggers |

### 18. Admin Operations

| Field | Value |
|-------|-------|
| Classification | IMPLEMENTED BUT REQUIRES CHANGES |
| Evidence | Admin panels for accounts, products, rulesets; admin APIs |
| Tests | N/A (UI tests) |
| Notes | Core admin works; needs trader management, financial overview, audit log viewer, funded account management |

### 19. Auditability

| Field | Value |
|-------|-------|
| Classification | IMPLEMENTED BUT REQUIRES CHANGES |
| Evidence | `AuditLog` model, audit logging on mutations |
| Notes | Audit logs exist but immutability not enforced (no DB trigger), no audit log viewer UI |

### 20. Financial Records

| Field | Value |
|-------|-------|
| Classification | MISSING |
| Evidence | No financial ledger, transaction, or accounting model |
| Notes | Requires: Transaction model, ledger entries, reconciliation with payments |

### 21. Security Controls

| Field | Value |
|-------|-------|
| Classification | IMPLEMENTED AND VERIFIED (with gaps) |
| Evidence | JWT auth, bcrypt, AES-256-GCM encryption, RBAC, rate limiting, input validation |
| Tests | PASS (auth.test.ts: escalation, status enforcement; monitoring/security.test.ts: credential masking) |
| Notes | Credential decryption in `lib/encryption.ts` must stay out of API scope (documented); no SQL injection risk (Prisma) |

### 22. Cloud Deployment

| Field | Value |
|-------|-------|
| Classification | BLOCKED BY EXTERNAL DEPENDENCY |
| Evidence | Next.js build passes; Neon connectivity confirmed; AWS EC2 not provisioned |
| Notes | Requires: CI/CD pipeline, cloud infrastructure, MT5 Windows VM |

### 23. Recovery and Backups

| Field | Value |
|-------|-------|
| Classification | PARTIALLY IMPLEMENTED |
| Evidence | `lib/recovery.ts` (evaluation link recovery), `lib/reconciliation.ts` (data inconsistency repair) |
| Notes | Data recovery works; database backup/recovery strategy not implemented |

### 24. Order Lifecycle (Duplicate — see #5)

N/A

### 25. Global Launch Readiness

| Field | Value |
|-------|-------|
| Classification | MISSING |
| Evidence | No CI/CD, no deployment config, no CDN, no multi-region, no GDPR compliance, no load testing |
| Notes | Requires: CI/CD pipeline, deployment config, security audit, compliance review |

---

## Summary by Classification

| Classification | Count | Requirements |
|----------------|-------|-------------|
| Implemented and verified | 7 | Global registration, secure auth, product catalog, versioned rulesets, MT5 allocation, monitoring, security controls |
| Implemented but requires changes | 4 | Evaluation lifecycle, admin operations, auditability, rule enforcement |
| Partially implemented | 3 | Rule enforcement, pass/fail decisions, recovery/backups |
| Missing | 10 | Order lifecycle, payment lifecycle, breach evidence, funded-account transition, payout workflow, refund workflow, dispute handling, notifications, financial records, global launch readiness |
| Blocked | 1 | Cloud deployment |

---

## Critical Gaps for Commercial Launch

| # | Gap | Impact | Priority |
|---|-----|--------|----------|
| 1 | No payment/financial system | Cannot process payments or payouts | CRITICAL |
| 2 | No funded account transition | Cannot move from evaluation to funded | CRITICAL |
| 3 | No order system | Cannot track trading orders | HIGH |
| 4 | Trader dashboard is placeholder | No trader-facing functionality | HIGH |
| 5 | No notification system | Cannot notify users of events | HIGH |
| 6 | Live MT5 connectivity blocked | Cannot provision or monitor live accounts | HIGH |
| 7 | No CI/CD pipeline | Cannot deploy or test automatically | HIGH |
| 8 | No breach evidence system | Cannot store evidence for rule breaches | MEDIUM |
| 9 | No dispute handling | Cannot handle trader disputes | MEDIUM |
| 10 | Audit log immutability not enforced | Audit logs could be tampered | MEDIUM |

---

## Requirements Not Addressed in Previous Phases

The following requirements were never part of any previous phase and are entirely missing:

- Order lifecycle (#5)
- Payment lifecycle (#6)
- Breach evidence (#11)
- Payout workflow (#14)
- Refund workflow (#15)
- Dispute handling (#16)
- Notifications (#17)
- Financial records (#20)
- Global launch readiness (#25)
