# Phase 25 WP3: Architecture and Database Review

**Date:** 2026-09-22
**Phase:** 25
**Status:** COMPLETED

---

## 1. Domain Model Review

### Current Models (13)

| Model | Key Fields | FK Relationships | OnDelete | Assessment |
|-------|-----------|-----------------|----------|------------|
| Trader | id, email(unique), password, role, status | evaluations, fundedAccounts, assignments, auditLogs | NONE | PASS |
| Product | id, name(unique), accountSize, price, rulesetId | auditLogs, ruleset | NONE | PASS |
| Ruleset | id, name(unique), isActive | versions, products, auditLogs | NONE | PASS |
| RulesetVersion | id, version, rulesetId, status | rules, evaluations, fundedAccounts | NONE | PASS |
| Rule | id, rulesetVersionId, ruleType, name | ruleEvaluations | NONE | PASS |
| MT5Account | id, accountNumber(unique), status, credentials | assignments, evaluations, fundedAccounts, jobs, auditLogs, ruleEvents | NONE | PASS |
| MonitoringJob | id, jobId(unique), accountId | — | CASCADE | PASS |
| Evaluation | id, traderId, rulesetVersionId, accountId | ruleEvaluations, auditLogs | NONE | PASS |
| FundedAccount | id, traderId, accountId, rulesetVersionId | auditLogs | NONE | PASS |
| AccountAssignment | id, traderId, accountId, status | — | NONE | PASS |
| RuleEvaluation | id, evaluationId, ruleId | — | NONE | PASS |
| RuleEvent | id, accountId | — | NONE | PASS |
| AuditLog | id, action, entityType, entityId | — | NONE | PASS |

### Assessment

| Check | Result | Detail |
|-------|--------|--------|
| Domain model completeness | PARTIAL | All core entities present; missing: Order, Payment, Payout, Dispute, Notification, Transaction |
| FK relationships | PASS | All FKs correct per schema |
| OnDelete policies | PASS | CASCADE only on MonitoringJob (intentional); all others RESTRICT |
| Unique constraints | PASS | email, accountNumber, (rulesetId,version), (traderId,accountId,assignedAt) |
| Enum coverage | PASS | 5 enums cover all status/action domains |

### Changes Required Before Major Commercial Features

1. **Add Order model** — orderId, traderId, MT5Account id, status, type, entry, exit, PnL
2. **Add Payment model** — paymentId, traderId, amount, currency, status, method, reference
3. **Add Payout model** — payoutId, traderId, amount, status, method, processedAt
4. **Add Dispute model** — disputeId, traderId, accountId, reason, status, resolution
5. **Add Notification model** — notificationId, traderId, type, message, read, createdAt
6. **Add Transaction/Ledger model** — transactionId, type, amount, balance, reference, createdAt

---

## 2. Lifecycle States Review

### Trader Status

| State | Transition From | Transition To | Enforced |
|-------|----------------|---------------|----------|
| PENDING | (created) | ACTIVE, SUSPENDED | App-level |
| ACTIVE | PENDING | SUSPENDED, INACTIVE | App-level |
| SUSPENDED | PENDING, ACTIVE | ACTIVE, INACTIVE | App-level |
| INACTIVE | PENDING, ACTIVE | ACTIVE, SUSPENDED | App-level |

**Assessment:** PASS — transitions validated in admin API. No DB trigger enforcement.

### MT5Account Status

| State | Transition From | Transition To | Enforced |
|-------|----------------|---------------|----------|
| AVAILABLE | (created) | IN_USE, INACTIVE, MAINTENANCE | API + DB trigger (IN_USE requires assignment) |
| IN_USE | AVAILABLE | INACTIVE, MAINTENANCE | API + admin override for AVAILABLE |
| INACTIVE | AVAILABLE, IN_USE | AVAILABLE, MAINTENANCE | API |
| MAINTENANCE | AVAILABLE, IN_USE | AVAILABLE, INACTIVE | API |

**Assessment:** PASS — transitions validated in `app/api/accounts/[id]/status/route.ts`. No trigger enforcement for transitions.

### Evaluation Status

| State | Transition | Trigger |
|-------|-----------|---------|
| IN_PROGRESS | → PASSED | Successful evaluation + release |
| IN_PROGRESS | → FAILED | Failed evaluation |
| IN_PROGRESS | → ABANDONED | Manual admin action |
| PASSED | → (terminal) | Release → Funded account |
| FAILED | → (terminal) | No further action |
| ABANDONED | → (terminal) | No further action |

**Assessment:** PARTIAL — States exist but no automated transition logic between evaluation result and funded account.

### MonitoringJob Status

| State | Transition | Trigger |
|-------|-----------|---------|
| PENDING | → RUNNING | Worker claim |
| PENDING | → COMPLETED | CompleteJob |
| PENDING | → FAILED | FailJob |
| PENDING | → TIMEOUT | TimeoutJob |
| PENDING | → CANCELLED | CancelJob |
| RUNNING | → COMPLETED | CompleteJob |
| RUNNING | → FAILED | RecoverJob (lease expired) |
| COMPLETED | → (terminal) | — |
| FAILED | → (terminal) | — |
| TIMEOUT | → (terminal) | — |
| CANCELLED | → (terminal) | — |

**Assessment:** PASS — Full state machine implemented in `lib/monitoring/monitoring-job.ts`.

### AccountAssignment Status

| State | Transition | Trigger |
|-------|-----------|---------|
| ASSIGNED | → RETURNED | Release account |
| ASSIGNED | → REVOKED | Admin action |
| RETURNED | → (terminal) | — |
| REVOKED | → (terminal) | — |

**Assessment:** PASS — State transitions handled in release flow.

---

## 3. Foreign Key Review

All FK relationships verified by `scripts/test-fk.ts` (PASSED all 6 steps). Cleanup order verified as leaf-to-root in all test files.

| FK | From | To | OnDelete | Cascade? | Assessment |
|----|------|----|----------|----------|------------|
| Evaluation.traderId | Evaluation | Trader | NONE | No | PASS |
| Evaluation.rulesetVersionId | Evaluation | RulesetVersion | NONE | No | PASS |
| Evaluation.accountId | Evaluation | MT5Account | NONE | No | PASS |
| FundedAccount.traderId | FundedAccount | Trader | NONE | No | PASS |
| FundedAccount.accountId | FundedAccount | MT5Account | NONE | No | PASS |
| FundedAccount.rulesetVersionId | FundedAccount | RulesetVersion | NONE | No | PASS |
| AccountAssignment.traderId | AccountAssignment | Trader | NONE | No | PASS |
| AccountAssignment.accountId | AccountAssignment | MT5Account | NONE | No | PASS |
| MonitoringJob.accountId | MonitoringJob | MT5Account | CASCADE | Yes | PASS |
| Rule.rulesetVersionId | Rule | RulesetVersion | NONE | No | PASS |
| RuleEvaluation.evaluationId | RuleEvaluation | Evaluation | NONE | No | PASS |
| RuleEvaluation.ruleId | RuleEvaluation | Rule | NONE | No | PASS |
| RuleEvent.accountId | RuleEvent | MT5Account | NONE | No | PASS |
| Product.rulesetId | Product | Ruleset | NONE | No | PASS |
| RulesetVersion.rulesetId | RulesetVersion | Ruleset | NONE | No | PASS |

---

## 4. Decimal Monetary Fields Review

| Field | Model | Type | Assessment |
|-------|-------|------|------------|
| accountSize | MT5Account | Decimal(18,2) | PASS |
| accountSize | Product | Decimal(18,2) | PASS |
| price | Product | Decimal(18,2) | PASS |
| totalPnl | Evaluation | Decimal(18,2) | PASS |
| maxDrawdown | Evaluation | Decimal(18,2) | PASS |
| totalPnl | FundedAccount | Decimal(18,2) | PASS |

**Assessment:** PASS — All monetary fields use `@db.Decimal(18,2)` for precision.

---

## 5. Audit Records Review

| Check | Result | Evidence |
|-------|--------|----------|
| Audit log model exists | PASS | `prisma/schema.prisma` |
| Audit logging on allocation | PASS | ACCOUNT_ASSIGNED, EVALUATION_LINKED |
| Audit logging on release | PASS | ACCOUNT_RETURNED |
| Audit logging on account create | PASS | ACCOUNT_CREATED |
| Audit logging on account update | PASS | ACCOUNT_UPDATED |
| Audit logging on evaluation link | PASS | EVALUATION_LINKED, EVALUATION_LINK_FAILED |
| Audit logging on recovery | PASS | RECOVERY_SUCCEEDED, RECOVERY_FAILED |
| Audit logging on reconciliation | PASS | RECONCILIATION_* |
| Audit logging on delete | PASS | ACCOUNT_UPDATED with action: DELETED |
| Sensitive data in audit | PASS | No credentials/passwords logged |
| Audit log immutability | FAIL | No DB trigger; app-level only |
| Audit log viewer | MISSING | No UI to view audit logs |
| Audit log search/filter | MISSING | No API endpoint for audit queries |

---

## 6. Idempotency Review

| Operation | Idempotent? | Mechanism | Assessment |
|-----------|------------|-----------|------------|
| Account allocation | Yes | Duplicate assignment check | PASS |
| Evaluation linking | Yes | Already linked check | PASS |
| Recovery | Yes | wasAlreadyLinked flag | PASS |
| Job creation | Yes | Partial unique index | PASS |
| Job claim | Yes | P2025 handling | PASS |
| Ruleset version publish | Unknown | No explicit idempotency check | ASSUMED |
| Account creation | No | Unique constraint (P2002) | PASS |
| Trader registration | No | Unique email constraint (P2002) | PASS |

---

## 7. Transaction Boundaries Review

| Operation | Transaction? | Evidence | Assessment |
|-----------|-------------|----------|------------|
| Account allocation | Yes | `prisma.$transaction` in `lib/allocation.ts` | PASS |
| Account release | Yes | `prisma.$transaction` in `lib/release.ts` | PASS |
| Evaluation linking | Yes | `prisma.$transaction` in `lib/evaluation-link.ts` | PASS |
| Recovery | Yes | Uses linkEvaluation (transactional) | PASS |
| Reconciliation repair | Yes | Per-account $transaction in `lib/reconciliation.ts` | PASS |
| Account delete | No | No transaction (dependencies checked first) | PARTIAL |
| Account creation | No | Not in transaction | ACCEPTABLE |

---

## 8. Account Assignment Integrity Review

| Check | Result | Evidence |
|-------|--------|----------|
| Unique active assignment | PASS | `VALID_TRANSITIONS` + DB query in allocation |
| No duplicate assignments | PASS | Explicit check before allocation |
| Assignment history preserved | PASS | RETURNED status + returnedAt |
| Active assignment → IN_USE | PASS | Status API checks assignment |
| AVAILABLE with assignment | PASS | Admin override required |
| Reconciliation detects mismatches | PASS | AVAILABLE_WITH_ASSIGNMENT type |
| Concurrent allocation safety | PASS | SKIP LOCKED in SQL query |
| Assignment ownership | PASS | traderId check in release |

---

## 9. Monitoring Jobs Review

| Check | Result | Evidence |
|-------|--------|----------|
| Job creation | PASS | createJobSafe |
| Idempotent creation | PASS | Partial unique index |
| Lease-based claiming | PASS | claimJob |
| Stale detection | PASS | findStaleJobs |
| Stale recovery | PASS | recoverJob |
| State machine | PASS | 12 transitions |
| No credential storage | PASS | MonitoringJob has no credential fields |
| Partitioning readiness | ASSUMED | accountId-based |
| Job metadata | PASS | jobId, workerId, attempt, timeoutMs, retryable |
| Health integration | PASS | MT5Account has monitoring fields |

---

## 10. Future Models Review

| Model | Needed? | Ready? | Notes |
|-------|---------|--------|-------|
| Order | YES | NO | No model, no migration |
| Payment | YES | NO | No model, no migration |
| Refund | YES | NO | No model, no migration |
| Payout | YES | NO | No model, no migration |
| Dispute | YES | NO | No model, no migration |
| Notification | YES | NO | No model, no migration |
| Transaction | YES | NO | No model, no migration |
| Evidence | YES | NO | No model, no migration |

---

## 11. Data Ownership Review

| Check | Result | Evidence |
|-------|--------|----------|
| Trader data scoped by traderId | PASS | All queries filter by traderId |
| Account data admin-only | PASS | All account APIs require ADMIN |
| Evaluation data ownership | PASS | Evaluation linked to trader |
| Monitoring data scoped by account | PASS | Jobs linked to MT5Account |
| Cross-tenant access | PASS | No cross-tenant queries |

---

## 12. Sensitive Data Review

| Data | Storage | Encryption | Exposure Risk | Assessment |
|------|---------|-----------|---------------|------------|
| Trader passwords | DB (hashed) | bcrypt(12) | LOW | PASS |
| MT5 credentials | DB (encrypted) | AES-256-GCM | LOW | PASS (with API boundary) |
| JWT secret | Env variable | — | MEDIUM | PASS (validated not default) |
| Session tokens | Cookie | JWT signed | LOW | PASS |
| Audit details | DB (JSON) | — | LOW | PASS (no creds logged) |
| Decrypted credentials | Memory only | — | MEDIUM | RISK (must not leave worker) |

---

## 13. Index Review

| Index | Type | Purpose | Assessment |
|-------|------|---------|------------|
| Trader.email | Unique | Email lookup | PASS |
| MT5Account.accountNumber | Unique | Account number lookup | PASS |
| Ruleset.name | Unique | Ruleset name lookup | PASS |
| RulesetVersion.(rulesetId,version) | Unique | Version lookup | PASS |
| AccountAssignment.(traderId,accountId,assignedAt) | Unique | Assignment integrity | PASS |
| MonitoringJob.jobId | Unique | Job lookup | PASS |
| MonitoringJob.(accountId,status) | Partial | Active job query | PASS |
| MonitoringJob.workerId | Index | Worker lookup | PASS |
| Evaluation.traderId | Index | Trader evaluations | IMPLIED |
| AuditLog.entityId | Index | Entity audit lookup | IMPLIED |

---

## Changes Required Before Building Major Commercial Features

| # | Change | Reason | Risk |
|---|--------|--------|------|
| 1 | Add Order, Payment, Payout, Dispute, Notification, Transaction models | Core commercial requirements | HIGH |
| 2 | Implement order lifecycle engine | Trading operations | HIGH |
| 3 | Implement payment processing engine | Financial operations | HIGH |
| 4 | Enforce audit log immutability (DB trigger) | Audit compliance | MEDIUM |
| 5 | Add audit log viewer/API | Admin oversight | MEDIUM |
| 6 | Add funded account transition workflow | Commercial core | HIGH |
| 7 | Add evaluation creation API | Evaluation start | MEDIUM |
| 8 | Add rule evaluation engine | Rule enforcement | HIGH |
| 9 | Add evidence storage reference | Breach evidence | MEDIUM |
| 10 | Add notification service | User communication | MEDIUM |

---

## No Destructive Changes Needed

All current schema is correct for existing features. New models should be additive only. No existing migrations need modification.
