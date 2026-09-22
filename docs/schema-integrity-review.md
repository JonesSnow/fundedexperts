# Database Schema Integrity Review

**Date:** 2026-09-20
**Schema:** prisma/schema.prisma

## Unique Constraints

| Model | Fields | Status | Purpose |
|---|---|---|---|
| Trader | email | ✅ | Prevents duplicate accounts |
| Product | name | ✅ | Unique product names |
| Ruleset | name | ✅ | Unique ruleset names |
| RulesetVersion | (rulesetId, version) | ✅ | Prevents duplicate versions per ruleset |
| MT5Account | accountNumber | ✅ | Prevents duplicate account numbers |
| RuleEvaluation | (evaluationId, ruleId) | ✅ | One result per rule per evaluation |
| AccountAssignment | (traderId, accountId, assignedAt) | ✅ | Prevents exact duplicate assignments, preserves history |

**Finding:** All critical unique constraints are properly defined. No gaps identified.

## Foreign Keys / Relations

| Model | Field | References | Type | Status |
|---|---|---|---|---|
| Product | rulesetId | Ruleset.id | N:1 | ✅ Optional |
| RulesetVersion | rulesetId | Ruleset.id | N:1 | ✅ Required |
| Rule | rulesetVersionId | RulesetVersion.id | N:1 | ✅ Required |
| Evaluation | traderId | Trader.id | N:1 | ✅ Required |
| Evaluation | rulesetVersionId | RulesetVersion.id | N:1 | ✅ Required |
| Evaluation | accountId | MT5Account.id | N:1 | ✅ Optional |
| FundedAccount | traderId | Trader.id | N:1 | ✅ Required |
| FundedAccount | accountId | MT5Account.id | N:1 | ✅ Optional |
| FundedAccount | rulesetVersionId | RulesetVersion.id | N:1 | ✅ Optional |
| AccountAssignment | traderId | Trader.id | N:1 | ✅ Required |
| AccountAssignment | accountId | MT5Account.id | N:1 | ✅ Required |
| RuleEvaluation | evaluationId | Evaluation.id | N:1 | ✅ Required |
| RuleEvaluation | ruleId | Rule.id | N:1 | ✅ Required |
| RuleEvent | accountId | MT5Account.id | N:1 | ✅ Required |
| AuditLog | (via relations) | Multiple | 1:N | ✅ |

**Finding:** All foreign key relationships are properly defined with correct cardinality. No orphaned relations.

## Default Values

| Model | Field | Default | Status |
|---|---|---|---|
| MT5Account | currency | "USD" | ✅ |
| MT5Account | status | AVAILABLE | ✅ |
| MT5Account | healthStatus | DISCONNECTED | ✅ |
| Product | isActive | true | ✅ |
| Product | displayOrder | 0 | ✅ |
| Product | currency | "USD" | ✅ |
| FundedAccount | status | ACTIVE | ✅ |
| AccountAssignment | status | ASSIGNED | ✅ |
| Rule | isRequired | true | ✅ |
| All | id | uuid() | ✅ |
| All | createdAt | now() | ✅ |
| All | updatedAt | updatedAt() | ✅ |

**Finding:** All sensible defaults are in place.

## Indexes

| Model | Fields | Type | Purpose |
|---|---|---|---|
| Trader | email | Unique | Fast trader lookup |
| Trader | role | Index | Filter by role |
| MT5Account | accountNumber | Unique | Fast account lookup |
| Ruleset | name | Unique | Fast ruleset lookup |
| RulesetVersion | (rulesetId, version) | Unique | Prevent duplicate versions |
| AccountAssignment | (traderId, accountId, assignedAt) | Unique | History preservation |
| RuleEvaluation | (evaluationId, ruleId) | Unique | One result per rule |

**Finding:** Core unique indexes are present. Missing application-level indexes:
- MT5Account `status` — for `/api/accounts?status=AVAILABLE` filter (low priority at current scale)
- MT5Account `broker` — for `/api/accounts?broker=XM` filter
- MT5Account `purpose` — for `/api/accounts?purpose=EVALUATION` filter
- MT5Account `accountSize` — for range-based allocation queries

These can be added when query performance becomes a concern.

## Decimal Field Handling

| Model | Field | Type | Status |
|---|---|---|---|
| Product | accountSize | Decimal? @db.Decimal(18, 2) | ✅ |
| Product | price | Decimal? @db.Decimal(18, 2) | ✅ |
| Evaluation | totalPnl | Decimal? @db.Decimal(18, 2) | ✅ |
| Evaluation | maxDrawdown | Decimal? @db.Decimal(18, 2) | ✅ |
| FundedAccount | totalPnl | Decimal? @db.Decimal(18, 2) | ✅ |
| MT5Account | accountSize | Decimal? @db.Decimal(18, 2) | ✅ |

**Finding:** All financial fields use `Decimal` type with appropriate precision (18, 2). No floating-point types used for monetary values.

## Deletion Behavior (ON DELETE)

Prisma defaults to `RESTRICT` for all relations (no cascading deletes). This means:
- Cannot delete a Trader with related records — explicit error
- Cannot delete a Ruleset with versions — explicit error
- Cannot delete a RulesetVersion with rules/evaluations — explicit error
- Cannot delete an MT5Account with assignments/evaluations/fundedAccounts/ruleEvents — explicit error
- Cannot delete a Ruleset with products — explicit error

**Finding:** RESTRICT behavior aligns with audit trail requirements. Prevents accidental data loss. Complements the DELETE safety check in `/api/accounts/[id]` route.

## Audit Log Relationships

AuditLog has no foreign key constraints — it uses loose `entityType` + `entityId` string references instead. This is a design choice:
- **Pros:** Audit logs survive entity deletions (if they were soft-deleted), flexibility across entity types
- **Cons:** No referential integrity — orphaned audit logs possible if entities are hard-deleted

**Finding:** Current implementation preserves audit logs when accounts are deleted (deletion blocked when dependencies exist). If hard deletion were implemented, audit logs could become orphaned. Recommend soft-delete pattern instead.

## Assignment History Preservation

AccountAssignment has:
- `@@unique([traderId, accountId, assignedAt])` — preserves history without overlap
- `returnedAt`, `revokedAt` timestamps — tracks lifecycle without deletion
- No cascade deletes on trader or account deletion (RESTRICT)

**Finding:** Assignment history is properly preserved. No silent deletion. Historical records remain intact.

## Schema Integrity: PASS

All critical constraints, relationships, and defaults are properly defined. No blocking issues identified.
