# WP4 — Minimal Financial Ledger Boundary

**Date:** 2026-09-22
**Phase:** 27
**WP:** 4
**Status:** COMPLETED

---

## Design Decisions

### Amount Convention
- **Choice: Direction enum (DEBIT/CREDIT) with positive amounts**
- Rationale: More audit-friendly — amounts are always positive, direction explicitly states the effect
- No negative numbers in the system; no confusion about sign conventions
- Easier to verify totals and reconcile against external statements

### Append-Only Records
- Ledger entries are immutable once created
- No update or delete operations in the service layer
- Reversals are handled by creating a new entry (entry type REFUND or INTERNAL_ADJUSTMENT)
- No `updatedAt` field — only `createdAt` records the immutable timestamp

### Duplicate Prevention
- `referenceId` field with unique database constraint
- Duplicate submissions return the existing entry (idempotent)
- Same referenceId = same financial event

### What Is NOT Stored
- Card numbers, CVVs, expiration dates
- Full payment credentials
- PII beyond traderId reference
- Detailed tax calculations (future requirement)

### Payouts
- TRADER_PAYOUT entry type exists in the enum
- Payout workflow NOT implemented — documented as future requirement
- Requires separate approval workflow and bank account management

### Not a Complete Accounting System
- This is a transaction log, not a full ledger
- No double-entry bookkeeping
- No trial balance or chart of accounts
- No tax calculation or reporting
- Professional accounting review required before using for tax/regulatory purposes

---

## Schema Changes

### New Model: LedgerEntry

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | String (uuid) | @id @default(uuid()) | Primary key |
| entryNumber | String | @unique | Human-readable identifier |
| traderId | String? | Foreign key (Trader) | Nullable for system entries |
| orderId | String? | Foreign key (Order) | Nullable for non-order entries |
| referenceId | String | @unique | Idempotency key |
| entryType | LedgerEntryType | Enum | CUSTOMER_PAYMENT, REFUND, PLATFORM_FEE, TRADER_PAYOUT, INTERNAL_ADJUSTMENT |
| amount | Decimal | @db.Decimal(18, 2) | Always positive |
| direction | LedgerDirection | Enum | DEBIT or CREDIT |
| currency | String | @default("USD") | 3-letter ISO code |
| status | LedgerEntryStatus | @default(PENDING) | PENDING, POSTED, REVERSED |
| metadata | Json? | Nullable | Optional context data |
| createdBy | String? | Nullable | Operator/system identifier |
| createdAt | DateTime | @default(now()) | Immutable creation timestamp |

### New Enums
- **LedgerEntryType**: CUSTOMER_PAYMENT, REFUND, PLATFORM_FEE, TRADER_PAYOUT, INTERNAL_ADJUSTMENT
- **LedgerDirection**: DEBIT, CREDIT
- **LedgerEntryStatus**: PENDING, POSTED, REVERSED

### Relationships
- LedgerEntry → Trader (many-to-one, nullable)
- LedgerEntry → Order (many-to-one, nullable)
- Trader → LedgerEntry (one-to-many)
- Order → LedgerEntry (one-to-many)

### Indexes
- `traderId, entryType` — for trader transaction history filtering
- `orderId` — for order-linked ledger entries
- `referenceId` — for idempotency lookups (unique)

---

## Service Functions

### `lib/ledger.ts`

| Function | Description |
|----------|-------------|
| `createLedgerEntry(prisma, input)` | Creates a ledger entry with validation, idempotency check, and audit logging |
| `getLedgerEntries(prisma, query, limit)` | Lists entries with optional filters |
| `getLedgerEntryByReference(prisma, referenceId)` | Retrieves a single entry by its idempotency reference |

### `CreateLedgerEntryInput`

| Field | Required | Notes |
|-------|----------|-------|
| referenceId | Yes | Unique idempotency key |
| entryType | Yes | Must be valid LedgerEntryType |
| amount | Yes | Must be positive number |
| direction | Yes | Must be DEBIT or CREDIT |
| traderId | No | Links to trader |
| orderId | No | Links to order |
| currency | No | Default "USD" |
| metadata | No | Optional JSON context |
| createdBy | No | Operator identifier |

---

## Validation Rules

- `referenceId`: required, string
- `entryType`: required, must be valid enum value
- `amount`: required, must be positive finite number (> 0)
- `direction`: required, must be DEBIT or CREDIT
- `currency`: if provided, must be 3-letter string
- `traderId`: if provided, must be string
- `orderId`: if provided, must be string

---

## Audit Logging

All ledger entry creations are logged via `lib/logger.ts` with:
- Category: "LEDGER"
- Entity type: "LedgerEntry"
- Metadata includes: entryNumber, referenceId, entryType, amount, direction, currency, orderId, traderId
- Sensitive data (metadata) is sanitized by logger (patterns: password, token, secret, key, credential, card, cvv, auth)

---

## Security Concerns

- No card/payment credential storage
- No MT5 credential exposure
- Trader references by ID only (no PII in ledger)
- Append-only — no update/delete in service layer
- DB unique constraints enforce idempotency at data layer
- All financial operations logged with correlation IDs

---

## Validation Results
- TypeScript: 0 errors
- Prettier: formatted
- Prisma validate: schema valid
- Tests: 15/15 passed, 0 failed
- Migration: `20260922111800_add_ledger_entry` applied

---

## Open Decisions Requiring Review
- Whether `status` transitions (PENDING → POSTED → REVERSED) should be enforced at DB level
- Whether `metadata` should be restricted to a defined schema
- Whether `createdBy` should reference an admin/user model
- Tax calculation and regulatory reporting requirements (professional review needed)
