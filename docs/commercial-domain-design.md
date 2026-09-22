# Commercial Domain Model Design

**Date:** 2026-09-22
**Phase:** 26
**WP:** 1
**Status:** COMPLETED

---

## 1. Design Principles

1. All monetary values use `Decimal` — never floating-point
2. Payment provider state is separated from internal business state
3. All financial operations are idempotent
4. Every financial state change is audited
5. No raw card data or sensitive payment credentials stored
6. External provider IDs stored for all external references
7. Explicit status enums for all stateful entities
8. Simulated trading balances are distinct from real customer funds
9. No legal or regulatory compliance claims
10. Multi-currency support deferred (all amounts stored as amount + currency code string)

---

## 2. Entity Definitions

### 2.1 Order

Represents a trader's purchase of one or more commercial items (products). An order is the primary financial document. An order exists before payment is confirmed.

```prisma
model Order {
  id                String           @id @default(uuid())
  orderNumber       String           @unique
  traderId          String
  trader            Trader           @relation(fields: [traderId], references: [id])
  status            OrderStatus      @default(CREATED)
  currency          String           @default("USD")
  subtotal          Decimal          @db.Decimal(18, 2)
  taxAmount         Decimal          @db.Decimal(18, 2) @default(0)
  discountAmount    Decimal          @db.Decimal(18, 2) @default(0)
  totalAmount       Decimal          @db.Decimal(18, 2)
  idempotencyKey    String?          @unique
  externalRefId     String?          // Internal reference to external system
  notes             String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  items             OrderItem[]
  payment           Payment?
  auditLogs         AuditLog[]

  @@index([traderId, status])
  @@index([orderNumber])
}
```

**Enum: OrderStatus**
```
CREATED → PAYMENT_PENDING → PAYMENT_PROCESSING → PAID → FULFILLED → COMPLETED
CREATED → PAYMENT_PENDING → CANCELLED
CREATED → PAYMENT_PENDING → PAYMENT_FAILED → RETRYING → PAYMENT_PROCESSING
CREATED → PAYMENT_PENDING → PAYMENT_FAILED → REFUNDED
CREATED → CANCELLED
PAID → FULFILLED → COMPLETED
PAID → REFUNDED → REFUND_PROCESSING → REFUNDED
```

**Invariants:**
- `totalAmount = subtotal + taxAmount - discountAmount` (enforced in application)
- `orderNumber` is unique, generated as `ORD-{timestamp}-{uuid}`
- An order with `PAID` status must have exactly one `Payment` with `status = SUCCESS`
- `idempotencyKey` is unique across all orders (prevents duplicate submissions)

---

### 2.2 OrderItem

A line item within an Order. Each item represents a specific product purchase. One OrderItem creates one Evaluation (see §2.7).

```prisma
model OrderItem {
  id              String           @id @default(uuid())
  orderId         String
  order           Order            @relation(fields: [orderId], references: [id])
  productId       String
  product         Product          @relation(fields: [productId], references: [id])
  rulesetVersionId String?
  rulesetVersion  RulesetVersion?   @relation(fields: [rulesetVersionId], references: [id])
  quantity        Int              @default(1)
  unitPrice       Decimal          @db.Decimal(18, 2)
  taxRate         Decimal          @db.Decimal(5, 4) @default(0)
  taxAmount       Decimal          @db.Decimal(18, 2) @default(0)
  totalAmount     Decimal          @db.Decimal(18, 2)
  status          OrderItemStatus  @default(PENDING)
  evaluationId    String?
  evaluation      Evaluation?      @relation(fields: [evaluationId], references: [id])
  accountAssignmentId String?
  accountAssignment AccountAssignment? @relation(fields: [accountAssignmentId], references: [id])
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  @@unique([orderId, productId])
}
```

**Enum: OrderItemStatus**
```
PENDING → FULFILLED → ACTIVE → COMPLETED
PENDING → CANCELLED
PENDING → FULFILLED → FAILED → REFUNDED
```

**Invariants:**
- `unitPrice` is snapshot at time of purchase (does not change if Product price changes later)
- `totalAmount = unitPrice * quantity * (1 + taxRate)` (enforced in application)
- Each OrderItem with status ACTIVE must have exactly one Evaluation and one AccountAssignment
- An OrderItem cannot be FULFILLED without a linked Evaluation

---

### 2.3 Payment

Top-level payment for an Order. Separates provider state from internal state (see §2.4).

```prisma
model Payment {
  id                  String             @id @default(uuid())
  orderId             String             @unique
  order               Order              @relation(fields: [orderId], references: [id])
  status              PaymentStatus      @default(CREATED)
  amount              Decimal            @db.Decimal(18, 2)
  currency            String             @default("USD")
  idempotencyKey      String             @unique
  externalProviderId  String?            // Provider's transaction/payment ID
  providerRefId       String?            // Internal reference to provider
  providerStatus      String?            // Provider-specific status (raw)
  providerData        Json?              // Provider-specific payload (without secrets)
  refundId            String?            // If partially refunded, references Refund
  refundAmount        Decimal            @db.Decimal(18, 2) @default(0)
  failureReason       String?
  failureCode         String?
  attemptedAt         DateTime?
  completedAt         DateTime?
  createdAt           DateTime           @default(now())
  updatedAt           DateTime         @updatedAt

  attempts            PaymentAttempt[]
  auditLogs           AuditLog[]

  @@index([orderId, status])
  @@index([externalProviderId])
}
```

**Enum: PaymentStatus**
```
CREATED → PROCESSING → SUCCESS → REFUNDING → REFUNDED
CREATED → PROCESSING → FAILED → RETRYING → PROCESSING
CREATED → CANCELLED
CREATED → FAILED → MANUAL_REVIEW → PROCESSING
```

**Invariants:**
- `amount` matches `Order.totalAmount` at time of payment creation
- A `SUCCESS` payment must have a non-null `externalProviderId`
- `providerStatus` is raw provider status (for debugging/audit), `status` is normalized internal status
- A payment can only transition to `SUCCESS` once (idempotency)
- `refundAmount` tracks partial refund total, cannot exceed `amount`

---

### 2.4 PaymentAttempt

Individual attempt to process a Payment. Supports retries, and captures provider-specific state separately from business state.

```prisma
model PaymentAttempt {
  id                  String           @id @default(uuid())
  paymentId           String
  payment             Payment          @relation(fields: [paymentId], references: [id])
  attemptNumber       Int              @default(1)
  idempotencyKey      String           @unique
  status              AttemptStatus    @default(PENDING)
  provider            String           // e.g., "stripe", "paypal", "custom"
  externalRefId       String?          // Provider's reference for this attempt
  requestPayload      Json?            // Request sent to provider (no secrets)
  responsePayload     Json?            // Response from provider
  errorType           String?
  errorMessage        String?
  errorCode           String?
  startedAt           DateTime?
  completedAt         DateTime?
  createdAt           DateTime         @default(now())

  @@index([paymentId, attemptNumber])
}
```

**Enum: AttemptStatus**
```
PENDING → PROCESSING → SUCCESS
PENDING → PROCESSING → FAILED → RETRYING → PROCESSING
PENDING → CANCELLED
PENDING → PROCESSING → EXPIRED
```

**Invariants:**
- `attemptNumber` is sequential per Payment
- `idempotencyKey` is unique across all attempts (prevents duplicate provider charges)
- `externalRefId` is the only link to provider transaction — must not be null on SUCCESS
- `requestPayload` and `responsePayload` must never contain card numbers, CVV, tokens, or secrets

---

### 2.5 LedgerEntry

Immutable financial record. Every financial movement creates a LedgerEntry. This is the source of truth for accounting, distinct from AuditLog (which records events, not financial movements).

```prisma
model LedgerEntry {
  id              String           @id @default(uuid())
  entryNumber     String           @unique
  orderId         String?
  order           Order?           @relation(fields: [orderId], references: [id])
  paymentId       String?
  payment         Payment?         @relation(fields: [paymentId], references: [id])
  orderItemId     String?
  orderItem       OrderItem?       @relation(fields: [orderItemId], references: [id])
  traderId        String
  trader          Trader           @relation(fields: [traderId], references: [id])
  accountId       String?          // MT5 account if applicable
  type            LedgerType
  subtype         String?          // e.g., "PAYMENT", "REFUND", "FEE", "ADJUSTMENT"
  amount          Decimal          @db.Decimal(18, 2)
  balanceAfter    Decimal          @db.Decimal(18, 2)
  currency        String           @default("USD")
  description     String
  referenceId     String?          // External reference ID
  idempotencyKey  String?          @unique
  details         Json?
  createdAt       DateTime         @default(now())

  @@index([traderId, createdAt])
  @@index([orderId])
  @@index([type])
}
```

**Enum: LedgerType**
```
CHARGE         // Customer charged (payment received)
REFUND         // Customer refunded
FEE            // Fee charged
ADJUSTMENT     // Manual balance adjustment
REFUND_PARTIAL // Partial refund
PAYOUT         // Trader withdrawal (future)
ACCOUNT_CREDIT // Simulated trading credit (NOT real money)
ACCOUNT_DEBIT  // Simulated trading debit (NOT real money)
SETTLEMENT     // Settlement between accounts
```

**Invariants:**
- `balanceAfter` is cumulative and must be recalculated on every insert
- `amount` is always positive; direction is determined by `type`
- Every CHARGE/REFUND/FEE must link to a Payment or Order
- `ACCOUNT_CREDIT`/`ACCOUNT_DEBIT` are explicitly simulated balances — never real customer funds
- `referenceId` for payouts links to PayoutRequest
- An entry cannot be deleted (append-only, enforced by application + DB trigger)

---

### 2.6 Refund

A refund against a Payment. Supports partial and full refunds.

```prisma
model Refund {
  id                String           @id @default(uuid())
  refundNumber      String           @unique
  paymentId         String
  payment           Payment          @relation(fields: [paymentId], references: [id])
  orderId           String
  order             Order            @relation(fields: [orderId], references: [id])
  refundRequestId   String?          // If initiated by trader
  status            RefundStatus     @default(REQUESTED)
  amount            Decimal          @db.Decimal(18, 2)
  currency          String           @default("USD")
  reason            String?
  refundMethod      String?          // e.g., "original", "account_credit"
  externalRefId     String?          // Provider's refund reference
  idempotencyKey    String?          @unique
  failureReason     String?
  failureCode       String?
  processedAt       DateTime?
  requestedBy       String?          // Trader ID if self-initiated
  adminReviewedBy   String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  auditLogs         AuditLog[]

  @@index([paymentId, status])
}
```

**Enum: RefundStatus**
```
REQUESTED → REVIEWING → APPROVED → PROCESSING → COMPLETED
REQUESTED → REVIEWING → DENIED
REQUESTED → CANCELLED
PROCESSING → FAILED → RETRYING → PROCESSING
COMPLETED → REVERSED → PROCESSING
```

**Invariants:**
- `amount` cannot exceed `Payment.amount - Payment.refundAmount` (remaining available)
- A COMPLETED refund must have a non-null `externalRefId` (or `refundMethod = "account_credit"`)
- Every Refund creates LedgerEntry records (one CHARGE reversal per refunded amount)
- Refunds over a certain threshold require `adminReviewedBy`

---

### 2.7 EvaluationPurchase (OrderItem → Evaluation Bridge)

The link between an OrderItem and an Evaluation. This is how a purchased product creates an evaluation session. Implemented via `OrderItem.evaluationId` and `OrderItem.accountAssignmentId` (see §2.2).

**Workflow:**
1. Order is PAID
2. OrderItem transitions from PENDING → FULFILLED
3. Evaluation is created (or linked) with `rulesetVersionId` from OrderItem
4. Account is allocated via `allocateAccount()` (see `lib/allocation.ts`)
5. OrderItem transitions FULFILLED → ACTIVE with `evaluationId` and `accountAssignmentId` set
6. LedgerEntry of type `ACCOUNT_CREDIT` is created (simulated balance, not real money)

**Business Rules:**
- An OrderItem with `rulesetVersionId` creates an Evaluation under that version
- The Evaluation uses the same `currency` as the OrderItem
- `accountSize` from Product is passed as `minAccountSize` to allocation
- If allocation fails, OrderItem stays FULFILLED and error is logged

---

### 2.8 PayoutRequest

A trader's request to withdraw funds from a FundedAccount.

```prisma
model PayoutRequest {
  id              String           @id @default(uuid())
  requestNumber   String           @unique
  traderId        String
  trader          Trader           @relation(fields: [traderId], references: [id])
  fundedAccountId String?          // Links to FundedAccount if exists
  fundedAccount   FundedAccount?   @relation(fields: [fundedAccountId], references: [id])
  accountId       String?          // MT5Account reference
  status          PayoutStatus     @default(REQUESTED)
  amount          Decimal          @db.Decimal(18, 2)
  currency        String           @default("USD")
  method          String?          // e.g., "bank_transfer", "crypto", "check"
  externalRefId   String?
  idempotencyKey  String?          @unique
  reason          String?
  failureReason   String?
  requestedAt     DateTime         @default(now())
  processedAt     DateTime?
  processedBy     String?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  ledgerEntries   LedgerEntry[]
  auditLogs       AuditLog[]

  @@index([traderId, status])
}
```

**Enum: PayoutStatus**
```
REQUESTED → REVIEWING → APPROVED → PROCESSING → COMPLETED
REQUESTED → REVIEWING → DENIED
REQUESTED → CANCELLED
PROCESSING → FAILED → RETRYING → PROCESSING
PROCESSING → ON_HOLD → REVIEWING → APPROVED → PROCESSING
```

**Invariants:**
- `amount` cannot exceed `FundedAccount.totalPnl` (available balance)
- A COMPLETED payout creates a LedgerEntry of type `PAYOUT`
- Payouts above threshold require manual admin review
- `externalRefId` is required when method uses external provider
- Payouts are NOT the same as Refunds (Payout = withdrawal from funded balance; Refund = return of payment)

---

### 2.9 Notification

User-facing notification for traders and admins.

```prisma
model Notification {
  id              String           @id @default(uuid())
  traderId        String?          // Null for admin notifications
  trader          Trader?          @relation(fields: [traderId], references: [id])
  type            NotificationType
  title           String
  message         String
  status          NotificationStatus @default(UNREAD)
  referenceType   String?          // e.g., "Order", "Payment", "Evaluation"
  referenceId     String?
  channel         String           @default("IN_APP") // IN_APP, EMAIL, SMS
  sentAt          DateTime?
  readAt          DateTime?
  metadata        Json?
  createdAt       DateTime         @default(now())

  @@index([traderId, createdAt])
}
```

**Enum: NotificationType**
```
ORDER_CONFIRMATION
PAYMENT_SUCCESS
PAYMENT_FAILED
PAYMENT_REFUNDED
ACCOUNT_ALLOCATED
EVALUATION_STARTED
EVALUATION_PASSED
EVALUATION_FAILED
ACCOUNT_ACTIVATED
PAYOUT_REQUESTED
PAYOUT_COMPLETED
SYSTEM_ALERT
ADMIN_NOTIFICATION
```

**Enum: NotificationStatus**
```
UNREAD → READ → ARCHIVED
```

---

### 2.10 Dispute

A formal dispute raised by a trader or admin regarding a financial transaction.

```prisma
model Dispute {
  id                String           @id @default(uuid())
  disputeNumber     String           @unique
  paymentId         String
  payment           Payment          @relation(fields: [paymentId], references: [id])
  orderId           String
  order             Order            @relation(fields: [orderId], references: [id])
  traderId          String
  trader            Trader           @relation(fields: [traderId], references: [id])
  status            DisputeStatus    @default(OPEN)
  type              DisputeType
  amount            Decimal          @db.Decimal(18, 2)
  currency          String           @default("USD")
  reason            String
  description       String?
  resolution        String?
  resolutionNote    String?
  reviewedBy        String?
  externalRefId     String?
  idempotencyKey    String?          @unique
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  ledgerEntries     LedgerEntry[]
  auditLogs         AuditLog[]

  @@index([traderId, status])
  @@index([paymentId])
}
```

**Enum: DisputeType**
```
CHARBACK          // Card chargeback
UNAUTHORIZED      // Unauthorized transaction
DUPLICATE         // Duplicate charge
SERVICE_NOT_RECEIVED
AMOUNT_DISCREPANCY
REFUND_DENIED
OTHER
`

**Enum: DisputeStatus**
```
OPEN → UNDER_REVIEW → RESOLVED → CLOSED
OPEN → ESCALATED → UNDER_REVIEW
OPEN → RESOLVED → REVERSED → UNDER_REVIEW
RESOLVED → CLOSED
```

**Invariants:**
- A Dispute locks the associated Payment from transitioning to REFUNDED until resolved
- Every Dispute state change creates an AuditLog entry
- A DISPUTE_RESOLVED with `reconciliation_needed` creates a LedgerEntry adjustment
- Disputes do not expire — they remain OPEN indefinitely until resolved

---

## 3. Relationships

```
Trader ──┬──< Order (1:N)
         ├──< FundedAccount (1:N)
         ├──< AccountAssignment (1:N)
         ├──< Evaluation (1:N)
         ├──< Notification (1:N)
         ├──< PayoutRequest (1:N)
         └──< Dispute (1:N)

Order ──┬──< OrderItem (1:N)
        └──> Payment (1:1, optional until paid)
        └──> LedgerEntry (1:N)

OrderItem ──> Evaluation (N:1, optional until fulfilled)
OrderItem ──> AccountAssignment (N:1, optional until allocated)
OrderItem ──> LedgerEntry (1:N)

Payment ──< PaymentAttempt (1:N)
Payment ──> Refund (1:N, optional)
Payment ──> Dispute (1:N, optional)
Payment ──> LedgerEntry (1:N)
Payment ──> PayoutRequest (1:N, optional)

Refund ──> LedgerEntry (1:N)
PayoutRequest ──> LedgerEntry (1:N)
Dispute ──> LedgerEntry (1:N)

FundedAccount ──< PayoutRequest (1:N)
Evaluation ──> AccountAssignment (1:1, via accountId)
```

---

## 4. State Transitions

### 4.1 Order

```
CREATED
  │ ├── PAYMENT_PENDING (auto-transition on creation)
  │ └── CANCELLED (manual, by trader or admin)

PAYMENT_PENDING
  │ ├── PAYMENT_PROCESSING (payment initiated)
  │ └── CANCELLED (manual)

PAYMENT_PROCESSING
  │ ├── PAID (provider callback SUCCESS)
  │ ├── PAYMENT_FAILED (provider callback FAILURE)
  │ └── CANCELLED (manual, before confirmation)

PAID
  │ ├── FULFILLED (all items allocated)
  │ └── REFUNDED (full refund initiated)

FULFILLED
  │ ├── COMPLETED (evaluation passed/completed)
  │ └── REFUNDED (refund after partial use)

COMPLETED
  └── (terminal state)

REFUNDED
  └── (terminal state, after all refunds processed)
```

### 4.2 Payment

```
CREATED (order created, payment record initialized)
  │ ├── PROCESSING (first attempt started)
  │ └── CANCELLED (user cancelled or admin cancelled)

PROCESSING
  │ ├── SUCCESS (provider confirms)
  │ └── FAILED (provider rejects or timeout)

SUCCESS
  │ ├── REFUNDING (refund initiated)
  │ └── (stable state, funds received)

FAILED
  │ ├── RETRYING (auto-retry configured)
  │ └── MANUAL_REVIEW (requires human intervention)

REFUNDING
  │ ├── REFUNDED (full refund processed)
  │ └── FAILED (refund processing failed)

REFUNDED (terminal state)
CANCELLED (terminal state)
```

### 4.3 PaymentProviderState (Separated - §2.4)

Payment provider state is stored in `Payment.providerRefId`, `Payment.providerStatus`, `Payment.providerData`, and `PaymentAttempt.externalRefId`, `PaymentAttempt.responsePayload`.

Internal business state is stored in `Payment.status`, `Payment.status`, `Order.status`.

**Key Separation:**
- Provider says `CHARGED` → Internal maps to `PROCESSING` or `SUCCESS`
- Provider says `REFUNDED` → Internal maps to `REFUNDING` or `REFUNDED`
- Provider state is never trusted blindly — every transition requires verification (signature, idempotency check)

---

## 5. Invariants (Cross-Cutting)

### 5.1 Money
- All monetary amounts are `Decimal(18, 2)` — no floating-point anywhere
- Currency is stored as ISO 4217 code string (e.g., "USD", "EUR")
- All amounts in a single transaction must use the same currency
- `Order.totalAmount = Σ(OrderItem.totalAmount) + Order.taxAmount - Order.discountAmount`
- `Payment.amount = Order.totalAmount` at time of payment creation
- Refund amount cannot exceed original payment minus previous refunds

### 5.2 Idempotency
- Every API that creates financial resources accepts an `Idempotency-Key` header
- `idempotencyKey` is stored and checked before processing:
  - If key exists and operation was successful → return existing result
  - If key exists and operation failed → allow retry
  - If key doesn't exist → process normally and store key
- Idempotency keys expire after 24 hours
- Applied to: Order creation, Payment initiation, Payment callback, Refund request, Payout request

### 5.3 Audit Trail
- Every Order status change → AuditLog entry
- Every Payment status change → AuditLog entry
- Every LedgerEntry creation → AuditLog entry
- Every Refund state change → AuditLog entry
- Every PayoutRequest state change → AuditLog entry
- Audit entries include: actor, timestamp, entity, before/after state, reason

### 5.4 No Sensitive Data
- No card numbers, CVV, expiry dates stored anywhere
- No raw payment tokens in logs or database
- `Payment.providerData` stores only non-sensitive provider metadata
- `PaymentAttempt.requestPayload`/`responsePayload` sanitized before storage
- All sensitive fields are encrypted at rest (if implemented in future)

### 5.5 Simulated vs Real Money
- `ACCOUNT_CREDIT`/`ACCOUNT_DEBIT` ledger entries = simulated trading balances (NOT real money)
- `CHARGE`/`REFUND`/`PAYOUT` ledger entries = real money movements
- Simulated balances are never commingled with real funds
- Every financial report distinguishes between simulated and real money

---

## 6. Webhook Processing (Idempotent)

### 6.1 Payment Provider Callback

```
POST /api/payments/webhook
Headers: X-Provider-Signature, X-Idempotency-Key, Content-Type: application/json
```

**Processing Steps:**
1. Verify provider signature (HMAC-SHA256 of payload with provider webhook secret)
2. Check `X-Idempotency-Key` — if already processed, return cached result (200 OK)
3. Parse payload, extract `externalRefId` and `status`
4. Look up `PaymentAttempt` by `externalRefId`
5. Verify attempt is in PROCESSING state
6. Apply state transition based on provider status:
   - `provider_status = SUCCESS` → Payment → SUCCESS, Order → FULFILLED (if all items), OrderItem → ACTIVE
   - `provider_status = FAILED` → PaymentAttempt → FAILED, Payment → FAILED, Order → PAYMENT_FAILED
7. Create LedgerEntry for successful payment
8. Write AuditLog entries for all state changes
9. Store idempotency key
10. Return 200 OK

### 6.2 Duplicate/Delayed Callbacks
- Same idempotency key → return cached result immediately
- Callback for an already-COMPLETED attempt → return 200 OK without processing
- Late-arriving callbacks (within 24h) processed normally if not yet idempotent
- Callbacks older than 24h rejected with 410 GONE

### 6.3 Reconciliation
- Scheduled reconciliation job compares internal `Payment.status` with provider status
- Discrepancies trigger Alert notifications and manual review queue
- All reconciliation actions are AuditLog entries

---

## 7. Failure Scenarios

### 7.1 Payment Fails After Retry
- PaymentAttempt → FAILED (after 3 retries with exponential backoff)
- Payment → FAILED
- Order → PAYMENT_FAILED
- Notification sent to trader: "Payment failed, please try again"
- Admin notified for orders above threshold

### 7.2 Duplicate Callback
- Idempotency key match → return 200 OK immediately
- No state changes, no additional LedgerEntries
- AuditLog entry: "Duplicate webhook callback ignored"

### 7.3 Partial Refund
- Refund → PROCESSING → COMPLETED
- Payment.refundAmount incremented
- Payment.status → REFUNDING (if not all refunded)
- LedgerEntry of type REFUND_PARTIAL
- OrderItem stays ACTIVE (partial refund doesn't cancel evaluation)

### 7.4 Refund Exceeds Payment
- Rejected at API level with validation error
- AuditLog entry: "Refund rejected: amount exceeds available balance"
- Admin notification sent

### 7.5 Provider Timeout
- PaymentAttempt → PROCESSING → timeout after 30s
- Retry with new idempotency key
- If all retries fail → manual review queue
- No LedgerEntry until confirmed

### 7.6 Callback Before Payment Processing Completes
- Callback received but PaymentAttempt not in PROCESSING state
- Log warning, return 200 OK
- Reconciliation job catches discrepancy later

### 7.7 Order Created but Never Paid
- Order auto-cancels after 24h in PAYMENT_PENDING state
- AuditLog entry: "Order auto-cancelled: payment timeout"
- Notification sent to trader
- No LedgerEntry created

### 7.8 Dispute Raises on Paid Order
- Dispute → OPEN
- Payment locked from REFUNDING until dispute resolved
- Reserved amount tracked on Payment
- Notification to admin for review

---

## 8. Currency Assumptions

| Decision | Rationale |
|----------|-----------|
| Primary currency: USD | Default for all transactions |
| Multi-currency: DEFERRED | Phase 28 per backlog. All `currency` fields store ISO 4217 string but exchange rates, conversion, and multi-currency reporting are not implemented |
| Precision: Decimal(18, 2) | Consistent with existing Product/MT5Account models |
| Rounding: HALF_UP | Standard financial rounding, applied in application layer |
| Currency conversion | Not implemented — requires provider support |

---

## 9. Migration Strategy

### 9.1 New Models (No Conflicts)
All new models (Order, OrderItem, Payment, PaymentAttempt, LedgerEntry, Refund, PayoutRequest, Notification, Dispute) have no naming conflicts with existing models.

### 9.2 Existing Model Extensions
| Model | Extension | Risk |
|-------|-----------|------|
| AuditLog | Add new AuditAction enum values for financial events | LOW — append-only enum |
| Product | Add `description` is already nullable | NONE |
| Trader | Add notification preferences (future) | NONE |
| FundedAccount | Add `availableBalance` for quick access | MEDIUM — requires backfill |

### 9.3 Migration Plan
1. Add new models via Prisma migration
2. `prisma migrate dev` creates new migration file
3. Apply migration to test database
4. Run existing test suite (validates no breakage)
5. Apply migration to production (when authorized)

### 9.4 Rollback Plan
- New tables are additive only
- No existing columns modified in Phase 26
- Rollback = revert migration (drop new tables)
- No data loss risk for existing tables

---

## 10. Deferred Decisions

| Decision | Reason | When |
|----------|--------|------|
| Payment provider selection | Requires legal review and authorization | Before Phase 27 implementation |
| Provider webhook secrets | Depends on provider selection | Before Phase 27 |
| Transactional email service (beyond SMTP config) | Not implemented yet | Phase 27 |
| Email templates for notifications | Depends on email service | Phase 27 |
| Push notification service | Not in scope yet | Phase 28 |
| Tax calculation engine | Complexity exceeds Phase 26 | Phase 27 |
| Currency conversion/exchange rates | Multi-currency deferred | Phase 28 |
| PCI DSS compliance scope | Requires legal review | Before any card processing |
| Fraud detection rules | Requires provider features | Phase 27 |
| Refund automation rules | Depends on provider capabilities | Phase 27 |
| Disputes auto-escalation rules | Complex business logic | Phase 28 |
| Two-way payout to external accounts | Requires banking integration | Phase 28 |
| Audit log immutability (DB trigger) | Requires DBA review | Phase 26 safe change |
| Notification delivery (email/SMS/push) | Requires service selection | Phase 27 |

---

## 11. Migration Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prisma migration fails on existing data | HIGH | Test on copy of production DB first |
| New tables break existing `prisma generate` | MEDIUM | Run `prisma generate` after migration |
| Audit log enum extension conflicts | LOW | Append-only, no removal of existing values |
| Decimal precision mismatch in financial calculations | HIGH | Use Decimal library consistently in application |
| Foreign key constraints on existing tables | MEDIUM | All new FKs are nullable (optional relationships) |
| Migration lock during concurrent access | MEDIUM | Apply during maintenance window |
| `FundedAccount.availableBalance` backfill | MEDIUM | Computed field, backfilled from LedgerEntry |

---

## 12. Status Summary

| Entity | Status | Notes |
|--------|--------|-------|
| Order | DESIGN | New model, no conflicts |
| OrderItem | DESIGN | New model, bridges to Evaluation |
| Payment | DESIGN | New model, provider-agnostic |
| PaymentAttempt | DESIGN | New model, retry support |
| LedgerEntry | DESIGN | New model, immutable financial records |
| Refund | DESIGN | New model, partial/full support |
| PayoutRequest | DESIGN | New model, links to FundedAccount |
| Notification | DESIGN | New model, multi-channel |
| Dispute | DESIGN | New model, escalation support |
| ProductPurchase | NOT NEEDED | Merged into OrderItem |
| EvaluationPurchase | NOT NEEDED | Merged into OrderItem (via Evaluation link) |
| PaymentProviderState | SEPARATED | Stored in Payment/PaymentAttempt provider fields |
| Currency | PARTIAL | Existing `currency` fields; no exchange rate model |
| Idempotency | DESIGN | Key pattern defined; implementation in Phase 27 |
| Audit for financial | EXTEND | AuditAction enum extended; AuditLog reused |
| Simulated vs Real | DOCUMENTED | LedgerEntry types distinguish them |

---

## 13. Workflow and Failure-State Section (WP6)

### 13.1 Complete Commercial Workflow

This section documents the end-to-end workflow from trader viewing a product to receiving an account, including all failure states.

#### Happy Path

```
1. Trader views product catalog (GET /api/products — session required)
2. Trader selects a product (Product has price, currency, accountSize, rulesetId)
3. Trader initiates order (POST /api/orders — NOT YET IMPLEMENTED)
   └─ Order created: status=CREATED → PAYMENT_PENDING
   └─ Idempotency-Key header validated (new key → process; existing key → return existing)
4. Payment initiated (POST /api/payments — NOT YET IMPLEMENTED)
   └─ Payment created: status=CREATED → PROCESSING
   └─ PaymentAttempt created: status=PENDING → PROCESSING
   └─ Provider redirect or confirmation requested
5. Provider confirms success (POST /api/payments/webhook — NOT YET IMPLEMENTED)
   └─ Verify signature (HMAC-SHA256 with provider webhook secret — NOT YET IMPLEMENTED)
   └─ Check idempotency key (new → proceed; seen → return cached result)
   └─ Verify PaymentAttempt in PROCESSING state
   └─ PaymentAttempt → SUCCESS; Payment → SUCCESS
   └─ Order → PAID; OrderItem → FULFILLED
   └─ LedgerEntry: CHARGE (real money received)
   └─ AuditLog: PAYMENT_SUCCESS
6. Order fulfillment (async, triggered by PAID status)
   └─ OrderItem → FULFILLED → ACTIVE
   └─ Evaluation created with rulesetVersionId from OrderItem (see §2.7)
   └─ Account allocated via allocateAccount() (lib/allocation.ts)
   └─ OrderItem: evaluationId + accountAssignmentId set
   └─ LedgerEntry: ACCOUNT_CREDIT (simulated balance, NOT real money)
   └─ AuditLog: ORDER_FULFILLED, ACCOUNT_ASSIGNED
   └─ Notification: ORDER_CONFIRMATION, ACCOUNT_ALLOCATED
7. Trader receives account and ruleset (via dashboard or API)
8. Trader begins evaluation under ruleset version
9. Evaluation completes → PASSED or FAILED
10. If PASSED → FundedAccount transition (see §13.4)
```

#### Failure States

| Failure Point | Detection | Handling | Recovery |
|---------------|-----------|----------|----------|
| **Step 3: Order creation fails** | API error / timeout | Return error to trader; no payment created | Retry with new Idempotency-Key |
| **Step 4: Payment initiation fails** | Provider timeout / rejection | PaymentAttempt → FAILED; Payment → FAILED | Auto-retry (3 attempts, exponential backoff); then manual review |
| **Step 5a: Provider rejects payment** | Webhook with failure status | PaymentAttempt → FAILED; Payment → FAILED; Order → PAYMENT_FAILED | Trader retries payment; Order → PAYMENT_FAILED → RETRYING → PAYMENT_PROCESSING |
| **Step 5b: Duplicate webhook** | Idempotency key match | Return cached result; no state change | None needed |
| **Step 5c: Webhook signature invalid** | Signature verification fails | Reject with 401; log security event | Investigate potential attack |
| **Step 5d: Callback before processing** | PaymentAttempt not in PROCESSING | Log warning; return 200 OK | Reconciliation job catches discrepancy |
| **Step 6a: Evaluation creation fails** | Database error | Order stays PAID; OrderItem stays FULFILLED; error logged | Manual intervention; admin creates evaluation |
| **Step 6b: Account allocation fails** | `allocateAccount()` returns failure | OrderItem stays FULFILLED; error logged; evaluation NOT linked | Admin investigates; retry allocation or assign different account |
| **Step 6c: Evaluation linking fails** | Silent failure at lib/allocation.ts:130 | AuditLog: EVALUATION_LINK_FAILED; evaluation.accountId stays null | Recovery via `recoverEvaluationLink()` (lib/recovery.ts) |
| **Step 7: Dashboard access fails** | Auth/session error | Redirect to login | Trader re-authenticates |
| **Step 8: Evaluation timeout** | Evaluation.status stays IN_PROGRESS beyond threshold | Admin notification; evaluation flagged | Admin extends or fails evaluation |
| **Step 9: Evaluation FAILS** | Evaluation.status = FAILED | Order stays PAID; OrderItem → ACTIVE (evaluation ran but failed) | Trader can start new evaluation with same or different product |
| **Step 10: FundedAccount transition fails** | Database error | Evaluation PASSED but FundedAccount NOT created | Manual intervention; admin creates FundedAccount |

### 13.2 Payment Confirmation vs Account Allocation Separation

**Critical Rule:** Account allocation MUST NOT happen before confirmed payment.

| Principle | Implementation |
|-----------|---------------|
| Order PAID is based on payment provider confirmation, NOT browser redirect | Webhook signature verification required |
| Payment confirmed → Order PAID → Async fulfillment begins | Event-driven; fulfillment triggered by PAID status |
| Payment confirmation and account allocation are separate steps | Payment → LedgerEntry (CHARGE) → Evaluation → Allocation → LedgerEntry (ACCOUNT_CREDIT) |
| If allocation fails after payment, payment is NOT reversed | Allocation failure is logged; admin handles manually |
| If payment fails, NO account or evaluation is created | No LedgerEntry; no audit trail beyond PaymentAttempt failure |

**Why This Separation Matters:**
- Prevents premature resource allocation (accounts, evaluations) for unpaid orders
- Ensures financial records exist before operational records
- Allows failed allocation to be retried without re-payment
- Provides clear audit trail for disputes

### 13.3 Webhook Security Design

| Aspect | Design |
|--------|--------|
| Signature algorithm | HMAC-SHA256 of raw payload with provider webhook secret |
| Secret storage | Environment variable (NOT in code, DB, or logs) |
| Verification timing | Before any state mutation |
| Replay prevention | Idempotency key check (24h window) |
| Response on success | `200 OK` immediately; async processing |
| Response on failure | `401` for auth failure; `400` for malformed; `500` for processing error (triggers retry) |
| Idempotency key source | Header `X-Idempotency-Key` from provider (if supported) or computed from `externalRefId` |
| Logging | Do NOT log full webhook payload; log event type and entity IDs only |

### 13.4 Funded Account Transition (Evaluation → Funded)

When an evaluation PASSES, the trader transitions from evaluation to funded account:

```
1. Evaluation.status → PASSED
2. Admin approves funded account (manual approval for Phase 26)
3. FundedAccount created:
   └─ traderId from evaluation
   └─ accountId from evaluation (linked MT5Account)
   └─ rulesetVersionId from evaluation
   └─ FundedAccount.status → ACTIVE
   └─ FundedAccount.activatedAt → now()
4. AuditLog: FUNDED_ACCOUNT_CREATED
5. Notification: ACCOUNT_ACTIVATED
6. LedgerEntry: (no real money — simulated balance already credited)
7. AccountAssignment.status remains ASSIGNED
8. OrderItem stays ACTIVE (evaluation ran and passed)

If trader fails evaluation:
1. Evaluation.status → FAILED
2. OrderItem → ACTIVE (account was allocated for evaluation)
3. No FundedAccount created
4. AuditLog: EVALUATION_FAILED
5. Notification: EVALUATION_FAILED
6. Admin notified for review
7. Account can be released via releaseAccount() (lib/release.ts)
```

### 13.5 Manual Intervention Points

| # | Point | When | Who | Action |
|---|-------|------|-----|--------|
| 1 | Payment failed after retries | Provider rejects payment 3 times | Admin | Investigate; retry manually or cancel order |
| 2 | Evaluation creation after payment | Allocation succeeds but evaluation fails | Admin | Manually create evaluation |
| 3 | Account allocation failure | No matching account available | Admin | Assign account manually or wait |
| 4 | Evaluation linking failure | Silent failure at allocation | Admin | Run `recoverEvaluationLink()` |
| 5 | Payout approval | Payout above threshold | Admin | Review and approve/deny |
| 6 | Dispute review | Dispute raised | Admin | Review evidence and resolve |
| 7 | Refund approval | Refund above threshold | Admin | Review and approve/deny |
| 8 | Funded account approval | Evaluation passed (Phase 26) | Admin | Approve or deny funded account |
| 9 | Reconciliation discrepancies | Scheduled reconciliation finds drift | Admin | Review and repair |
| 10 | Webhook security event | Invalid signature detected | Admin | Investigate potential attack |

### 13.6 Fraud, Refund, Chargeback, Dispute — Future Requirements

These are documented as future requirements (NOT implemented in Phase 26):

| Area | Future Requirement | Phase |
|------|-------------------|-------|
| Fraud | Velocity checks on orders | Phase 27 |
| Fraud | Device fingerprinting | Phase 27 |
| Fraud | Suspicious activity monitoring | Phase 27 |
| Refund | Automated refund processing | Phase 27 |
| Refund | Refund reason categorization | Phase 27 |
| Chargeback | Chargeback detection via webhook | Phase 27 |
| Chargeback | Chargeback evidence collection | Phase 27 |
| Dispute | Dispute evidence upload | Phase 27 |
| Dispute | Auto-escalation rules | Phase 28 |
| Dispute | Legal hold on accounts in dispute | Phase 28 |
| Disputes | Chargeback tracking (Dispute.type = CHARBACK) | Phase 27 |
