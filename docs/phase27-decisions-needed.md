# Phase 27 Decisions Required

**Date:** 2026-09-22
**Phase:** 27
**Status:** OPEN

---

## Business Decisions

### 1. Payment Provider Selection
| Option | Status | Notes |
|--------|--------|-------|
| Stripe | NOT DECIDED | Mock interface supports; no provider comparison documented |
| PayPal | NOT DECIDED | Mock interface supports; no provider comparison documented |
| Other | NOT DECIDED | — |

**Required:** Provider selection before production implementation. Mock provider currently used for all payment operations.

### 2. Ledger Amount Convention
| Decision | Choice |
|----------|--------|
| Amount sign convention | **Direction enum (DEBIT/CREDIT) with positive amounts** |
| Rationale | More audit-friendly — amounts always positive, direction explicitly stated |

### 3. Ledger Append-Only Policy
| Decision | Choice |
|----------|--------|
| Records immutable | **Yes** — no update/delete in service layer |
| Reversals | **Create new entry** (REFUND or INTERNAL_ADJUSTMENT entry type) |
| Status transitions | **PENDING → POSTED** (set at creation, REVERSED via new entry) |

### 4. Payout Implementation
| Decision | Choice |
|----------|--------|
| Payout workflow | **NOT IMPLEMENTED** — TRADER_PAYOUT type exists in enum |
| Required before production | Bank account management, approval workflow, payout scheduling |

### 5. Evaluation Activation Payment Verification
| Decision | Choice |
|----------|--------|
| Payment verification method | **Server-side provider API check** (currently mock only) |
| Trust client payment status | **No** — always verify server-side |
| Webhook assumptions | **None** — activation initiated by trader action, not webhook |

---

## Technical Decisions

### 6. Transaction Scope for Activation
| Decision | Choice |
|----------|--------|
| Evaluation creation + allocation in same transaction | **No** — separate calls |
| Rationale | Account allocation may succeed but linking may fail; separate transactions allow recovery via `recoverEvaluationLink()` |
| Race conditions | **UNPROVEN** — concurrent activation requests may both pass ownership check before either creates evaluation |

### 7. Idempotency for Activation
| Decision | Choice |
|----------|--------|
| Activation idempotency | **Lookup by (traderId, rulesetVersionId)** — returns existing evaluation if already active |
| Duplicate prevention | **No duplicate evaluations** — verified by tests |
| Duplicate ledger entries | **Each activation creates one ledger entry** — no dedup for ledger |

### 8. Recovery After Partial Failure
| Scenario | Recovery Path |
|----------|---------------|
| Allocation succeeded, linking failed | `recoverEvaluationLink()` (lib/recovery.ts) |
| Evaluation created, allocation failed | Manual intervention or reconciliation |
| Ledger entry failed | Logged as warning, activation still succeeds |

### 9. Payment Model
| Decision | Choice |
|----------|--------|
| Persistent Payment model | **DEFERRED** — no DB table yet |
| Payment reference tracking | **In mock provider only** — documented limitation |
| Provider webhook handling | **NOT IMPLEMENTED** — activation is trader-initiated |

---

## Security Decisions

### 10. MT5 Credential Handling
| Decision | Choice |
|----------|--------|
| Credential storage | **Encrypted in DB** (credentials field on MT5Account) |
| Credential exposure in API | **Never** — no API returns credential fields |
| Activation access to credentials | **None** — activation uses accountId, not credentials |

### 11. Audit Log Immutability
| Decision | Choice |
|----------|--------|
| Audit log append-only | **Yes** — no update/delete in application layer |
| DB trigger enforcement | **NOT IMPLEMENTED** — documented tech debt |

---

## Remaining Questions

1. **Payment provider selection** — Required before any production payment flow
2. **Transaction atomicity guarantees** — Current architecture uses compensating recovery, not full ACID across all steps
3. **Ledger reconciliation** — No automated reconciliation with payment provider or bank statements
4. **Regulatory compliance** — Tax calculation, financial reporting, and regulatory filing requirements not addressed
5. **Concurrent activation race conditions** — Unproven safe under high concurrency
6. **Payment ledger entry deduplication** — Each activation creates a ledger entry; no mechanism to prevent duplicate entries for same payment
