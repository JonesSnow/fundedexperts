# Phase 28 — WP3-WP5 Review Findings

**Date:** 2026-09-22
**Phase:** 28
**WP3:** Financial Integrity Review — COMPLETE (review)
**WP4:** Concurrency and Operational Review — COMPLETE (review)
**WP5:** Notification Architecture Design — COMPLETE (design doc)

---

## WP3 — Financial Integrity Review

### Idempotency

| Component | Status | Notes |
|-----------|--------|-------|
| FundedAccount creation | PASS | `createFundedAccount` checks by `evaluationId` before creating ✅ |
| LedgerEntry creation | PASS | `referenceId` UNIQUE constraint prevents duplicates ✅ |
| Order creation | PARTIAL | `idempotencyKey` validated but no DB unique constraint ⚠️ |
| Payment processing | NOT IMPLEMENTED | Mock provider only ⚠️ |
| Account allocation | PARTIAL | `allocateAccount` uses findFirst + update (no idempotency key) ⚠️ |

### Duplicate Financial-Entry Prevention

| Mechanism | Status | Details |
|-----------|--------|---------|
| LedgerEntry.referenceId UNIQUE | PASS | DB-level unique constraint ✅ |
| Order.idempotencyKey UNIQUE | MISSING | No DB unique constraint ⚠️ |
| FundedAccount per evaluation | PASS | `createFundedAccount` checks by `evaluationId` ✅ |

### Invalid State Transitions

| Component | Status | Details |
|-----------|--------|---------|
| FundedAccount | PASS | `VALID_TRANSITIONS` map enforces transitions ✅ |
| Order | PASS | OrderStatus enum + explicit transition logic ✅ |
| LedgerEntry | PASS | LedgerEntryStatus enum (PENDING → POSTED → REVERSED) ✅ |
| Evaluation | PASS | EvaluationStatus enum + transition logic in allocation.ts ✅ |
| MT5Account | PASS | AccountStatus enum ✅ |

### Authorization Boundaries

| Component | Status | Details |
|-----------|--------|---------|
| FundedAccount mutations | PASS | Admin-only at API route level ✅ |
| Order creation | PASS | Admin-only at API route level ✅ |
| Ledger entries | WARNING | No dedicated API route (service layer only) ⚠️ |
| Payment operations | WARNING | Mock provider, no API route ⚠️ |

### Recommendations
1. Add UNIQUE constraint on `Order.idempotencyKey` (WP4 follow-up)
2. Add API route for LedgerEntry management (WP5+ follow-up)
3. Implement real payment provider when selected

---

## WP4 — Concurrency and Operational Review

### PostgreSQL Guarantees

| Guarantee | Available | Notes |
|-----------|-----------|-------|
| Row-level locking | YES | `SELECT ... FOR UPDATE` supported |
| UNIQUE constraint enforcement | YES | DB-level ✅ |
| Foreign key enforcement | YES | All FK constraints active ✅ |
| SERIALIZABLE isolation | YES | Available via Prisma isolation levels |
| ACID transactions | YES | Prisma.$transaction supported ✅ |

### Prisma Guarantees

| Guarantee | Available | Notes |
|-----------|-----------|-------|
| Default isolation level | READ COMMITTED | No explicit transaction for most ops ⚠️ |
| Atomic multi-step operations | YES | `$transaction` available but not used ⚠️ |
| Connection pooling | YES | Serverless pooler (Neon) ⚠️ |
| Optimistic concurrency | PARTIAL | `updatedAt` field exists but no version check ⚠️ |

### Race Conditions Identified

| Scenario | Risk | Mitigation | Status |
|----------|------|------------|--------|
| Order creation with same idempotencyKey | HIGH | Add UNIQUE constraint on idempotencyKey | NOT IMPLEMENTED |
| Account allocation (findFirst + update) | MEDIUM | TOCTOU race in `allocateAccount` | NOT IMPLEMENTED |
| FundedAccount creation (check + create) | MEDIUM | TOCTOU in `createFundedAccount` | NOT IMPLEMENTED |
| LedgerEntry creation | LOW | UNIQUE referenceId prevents duplicates ✅ | MITIGATED |
| Evaluation activation | MEDIUM | `activate` uses findFirst + update | NOT IMPLEMENTED |

### Concurrency Test Results

| Test | Status | Notes |
|------|--------|-------|
| Concurrent creation | NOT PROVEN | Neon serverless prevents reliable testing |
| Concurrent status transitions | NOT PROVEN | Neon serverless prevents reliable testing |
| Concurrent ledger writes | NOT PROVEN | Neon serverless prevents reliable testing |

### Recommendations
1. Add UNIQUE constraint on `Order.idempotencyKey`
2. Wrap multi-step operations in `$transaction`
3. Use `SELECT ... FOR UPDATE` for critical allocation paths
4. Consider optimistic locking with version fields
5. Implement concurrent safety tests with persistent DB connection

---

## WP5 — Notification Architecture Design

### Existing State

| Item | Status |
|------|--------|
| Notification model in schema | MISSING |
| Notification service | MISSING |
| Email service | MISSING (SMTP configured in .env.example only) |
| In-app notification | MISSING |
| Push notification | MISSING |
| Event system | MISSING |

### Design (from docs/commercial-domain-design.md §2.9)

**Model: Notification**
```prisma
model Notification {
  id              String           @id @default(uuid())
  traderId        String?
  trader          Trader?          @relation(fields: [traderId], references: [id])
  type            NotificationType
  title           String
  message         String
  status          NotificationStatus @default(UNREAD)
  referenceType   String?
  referenceId     String?
  channel         String           @default("IN_APP")
  sentAt          DateTime?
  readAt          DateTime?
  metadata        Json?
  createdAt       DateTime         @default(now())

  @@index([traderId, createdAt])
}
```

**Enums:**
- NotificationType: ORDER_CONFIRMATION, PAYMENT_SUCCESS, PAYMENT_FAILED, PAYMENT_REFUNDED, ACCOUNT_ALLOCATED, EVALUATION_STARTED, EVALUATION_PASSED, EVALUATION_FAILED, ACCOUNT_ACTIVATED, PAYOUT_REQUESTED, PAYOUT_COMPLETED, SYSTEM_ALERT, ADMIN_NOTIFICATION
- NotificationStatus: UNREAD → READ → ARCHIVED

### Proposed Interface (email-first, provider-neutral)

```typescript
// lib/notification.ts (proposed)
export interface NotificationProvider {
  send(recipient: string, notification: NotificationMessage): Promise<SendResult>;
}

export interface NotificationMessage {
  type: NotificationType;
  title: string;
  message: string;
  channel: "IN_APP" | "EMAIL";
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
}
```

### Design Decisions
1. **Email first**: SMTP configured in `.env.example`; email provider can be selected later
2. **Provider-neutral**: Interface allows swapping providers without changing call sites
3. **IdempotencyKey**: Prevent duplicate sends on retry
4. **In-app as primary**: Notification model exists in DB; email is secondary channel
5. **No SMS at this stage**: Per task requirements
6. **Event-driven**: Future events can trigger notifications via audit log subscription

### Implementation Status

| Component | Status |
|-----------|--------|
| Model design | COMPLETE (documented in commercial-domain-design.md) |
| Provider interface | DESIGN ONLY (not implemented) |
| Email sending | NOT IMPLEMENTED |
| In-app notification | NOT IMPLEMENTED |
| Event system | NOT IMPLEMENTED |
| Tests | NOT IMPLEMENTED |

### Constraints
1. Do not send real notifications (per task requirements)
2. Do not add SMS complexity at this stage
3. No payment provider → no payment-related notifications
4. SMTP credentials not available (in .env.example only)

---

## Summary

| WP | Status | Key Finding |
|----|--------|-------------|
| WP3 | COMPLETE (review) | Idempotency PARTIALLY implemented (Order idempotencyKey missing UNIQUE constraint); LedgerEntry idempotency PASS; Authorization mostly PASS |
| WP4 | COMPLETE (review) | TOCTOU races identified in allocation/activation/fundedAccount; no explicit transactions used; concurrency NOT PROVEN |
| WP5 | COMPLETE (design) | Notification model designed but not in schema; provider-neutral interface designed; not implemented per requirements |
