# WP5 — Evaluation Activation Workflow

**Date:** 2026-09-22
**Phase:** 27
**WP:** 5
**Status:** COMPLETED

---

## Silent Error Fix (Allocation)

### Before
```typescript
// lib/allocation.ts line 133 — error silently swallowed
} catch {
  evaluationLinked = false;
  await prisma.auditLog.create({ ... }); // No error details logged
}
```

### After
```typescript
} catch (e) {
  evaluationLinked = false;
  const errorMsg = e instanceof Error ? e.message : "Unknown error";
  logger.error("ALLOCATION", "Evaluation linking failed after allocation", {
    correlationId: generateCorrelationId(),
    actor: { type: "system", id: traderId },
    entity: { type: "Evaluation", id: evaluationId },
    error: { code: "EVALUATION_LINK_FAILED", message: errorMsg },
  });
  await prisma.auditLog.create({ ... }); // Error details in audit
}
```

Key change: Error is now logged with correlation ID, error code, and message. The `logger` import was added.

---

## Activation Workflow

The `activateEvaluation` function in `lib/activation.ts` implements the server-side activation workflow:

1. **Authenticate**: Verify trader session via JWT (handled by API route)
2. **Verify ownership**: `order.traderId === performedBy` (server-side check)
3. **Load order**: Fetch order from DB including status and rulesetVersionId
4. **Verify eligibility**: Order must be PAID or have confirmed payment reference; not cancelled
5. **Confirm payment**: If `paymentReference` provided, check via `provider.getPaymentStatus()` (MOCK only). If no reference, check `order.status === "PAID"`.
6. **Do NOT trust browser payment status**: Payment verified server-side only
7. **Idempotency check**: Look for existing evaluation for same (trader, rulesetVersion)
8. **Create evaluation**: Within transaction — creates evaluation or reuses existing
9. **Allocate account**: Call `allocateAccount()` (existing logic)
10. **Link evaluation**: Call `linkEvaluation()` (existing logic)
11. **Create ledger entry**: If payment reference provided, create CUSTOMER_PAYMENT ledger entry
12. **Audit logging**: All steps logged with correlation IDs
13. **Return explicit result**: Success or recoverable failure (never false success)

---

## Design Decisions

### Payment Verification
- **Mock provider only**: `provider.getPaymentStatus()` returns COMPLETED for mock payments
- **No production payment verification**: Documented limitation — in production, would integrate with Stripe/PayPal server-side verification
- **No webhook assumptions**: Activation is initiated by trader action, not payment webhook
- **Do not activate based on client-provided paymentStatus=PAID**: Server verifies via provider API or order status only

### Error Handling
- All errors are logged with correlation IDs
- Errors returned as explicit failure results (never swallowed)
- Recovery flag indicates whether the operation can be retried
- `allocateAccount` errors propagated explicitly
- `linkEvaluation` errors propagated explicitly with recovery indication

### Idempotency
- Duplicate activation returns existing evaluation with `wasAlreadyActivated: true`
- No duplicate evaluations created
- No duplicate assignments created
- Same result returned on repeated calls

### Transaction Boundaries
- Evaluation creation wrapped in `$transaction`
- Account allocation + assignment NOT in same transaction as evaluation (separate calls)
- Documented: if allocation succeeds but linking fails, allocation is committed and recovery via `recoverEvaluationLink()` can fix

---

## API

### POST /api/orders/[id]/activate

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| paymentReference | string | No | Payment ID for mock provider verification |

| Response | Status | Description |
|----------|--------|-------------|
| success=true | 200 | Activation complete (or already activated) |
| success=false | 400 | Activation failed with error category |
| success=false | 401 | Unauthorized |
| success=false | 404 | Order not found |

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| evaluation | Evaluation | The activated evaluation |
| account | MT5Account | Allocated account |
| assignment | AccountAssignment | Assignment record |
| ledgerEntry | LedgerEntry | Created payment ledger entry |
| wasAlreadyActivated | boolean | Whether evaluation was already active |
| correlationId | string | Request correlation ID |

---

## Error Categories

| Category | Recoverable | Description |
|----------|-------------|-------------|
| NOT_FOUND | false | Order does not exist |
| FORBIDDEN | false | Trader does not own order |
| ORDER_CANCELLED | false | Order is cancelled |
| ORDER_NOT_PAID | false | Order not paid |
| PAYMENT_NOT_CONFIRMED | true | Mock payment not completed |
| NO_RULESET | false | No ruleset version available |
| EVALUATION_CREATE_FAILED | true | Evaluation creation error |
| ALLOCATION_FAILED | true | Account allocation error |
| LINK_FAILED | partial | Evaluation linking error |
| ACTIVATION_REQUEST_FAILED | false | Unexpected error |

---

## Security

- Trader can only activate own orders (server-side ownership check)
- No MT5 credential exposure in API responses
- No payment credentials stored or logged
- All financial operations logged with correlation IDs
- Input validated server-side
- JWT-based authentication enforced at API route level

---

## Known Limitations

1. **Mock payment provider**: Payment verification uses mock provider. In production, must integrate with selected payment provider's server-side API.
2. **No persistent Payment model**: Payment records not persisted to DB. Payment provider stores them internally.
3. **Transaction scope**: Account allocation and evaluation creation are in separate transactions. If allocation succeeds but linking fails, allocation is committed. Recovery via `recoverEvaluationLink()` handles this case.
4. **Race conditions**: Concurrent activation requests for same order may both pass ownership check before either creates evaluation. Result: one succeeds, one returns `wasAlreadyActivated: true`. No duplicate evaluations created due to rulesetVersionId lookup.
5. **No persistent evaluation linking state**: Activation result doesn't verify final evaluation state after linking. If linking fails silently after transaction commit, state is inconsistent until next reconciliation.

---

## Validation Results
- TypeScript: 0 errors
- Prettier: all files formatted
- Prisma validate: schema valid (payment model deferred)
- Activation tests: 10/10 passed, 0 failed
- Order tests: 13/13 passed, 0 failed
- Build: Next.js build PASS (19 routes)
