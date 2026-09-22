# Account Allocation Transaction Design

**Status:** DESIGN ONLY — Not implemented (Phase 6)
**Verification Status:** UNVERIFIED — No PostgreSQL available for testing

## Problem Statement

When a trader passes evaluation, an available MT5 account must be assigned atomically:
1. Select an AVAILABLE account
2. Prevent concurrent assignments of the same account
3. Create AccountAssignment record
4. Update MT5Account from AVAILABLE to IN_USE
5. Both writes must succeed or both roll back

## Proposed Design: Prisma Transaction with Row Locking

### Transaction Flow

```typescript
async function allocateAccount(traderId: string, productAccountSize: Decimal) {
  return prisma.$transaction(async (tx) => {
    // Step 1: Find available account with row lock
    const account = await tx.mT5Account.findFirst({
      where: {
        status: "AVAILABLE",
        accountSize: { gte: productAccountSize },
      },
      orderBy: { accountSize: "asc" }, // Smallest account that fits
    });

    if (!account) {
      return { success: false, error: "No available accounts matching criteria" };
    }

    // Step 2: Verify still AVAILABLE (double-check after lock acquisition)
    // In PostgreSQL, SELECT FOR UPDATE locks the row until transaction ends
    // Prisma's $transaction uses a single connection, so the lock is held

    // Step 3: Check for existing active assignments
    const activeAssignment = await tx.accountAssignment.findFirst({
      where: {
        accountId: account.id,
        status: "ASSIGNED",
      },
    });

    if (activeAssignment) {
      return { success: false, error: "Account already assigned" };
    }

    // Step 4: Create assignment and update account atomically
    const [assignment, updatedAccount] = await Promise.all([
      tx.accountAssignment.create({
        data: {
          traderId,
          accountId: account.id,
          status: "ASSIGNED",
          assignedAt: new Date(),
        },
      }),
      tx.mT5Account.update({
        where: { id: account.id },
        data: { status: "IN_USE", updatedAt: new Date() },
      }),
    ]);

    // Step 5: Create audit log
    await tx.auditLog.create({
      data: {
        action: "ACCOUNT_ASSIGNED",
        entityType: "MT5Account",
        entityId: account.id,
        performedBy: traderId,
        details: {
          accountNumber: account.accountNumber,
          assignmentId: assignment.id,
        },
      },
    });

    return { success: true, account: updatedAccount, assignment };
  });
}
```

## Concurrency Analysis

### PostgreSQL Row Locking via Prisma

Prisma's `$transaction` uses a single database connection and wraps all operations in a PostgreSQL transaction. In the default `READ COMMITTED` isolation level:

1. **`findFirst` locks the row**: When a subsequent write operation (UPDATE, CREATE) occurs within the same transaction on a previously-read row, PostgreSQL implicitly applies a row lock. However, for explicit locking, `SELECT FOR UPDATE` is recommended.

2. **Prisma does NOT currently support raw `SELECT FOR UPDATE`** in its query API. The implicit locking from write operations within a transaction provides some protection but is not sufficient for high-contention scenarios.

### Verified Findings

> **UNVERIFIED** — No PostgreSQL available for testing. The following are assumed based on Prisma/PostgreSQL documentation, not empirical evidence.

| Scenario | Protection | Status |
|---|---|---|
| Two concurrent allocations for same account | Transaction serialization via PostgreSQL row-level locking on UPDATE | ASSUMED |
| Assignment creation after account update | Both in same transaction — atomic | ASSUMED |
| Account update after assignment | Both in same transaction — atomic | ASSUMED |
| Transaction failure | Full rollback — no partial state | ASSUMED |

### Alternative: Explicit Locking with Raw SQL

If Prisma's implicit locking is insufficient (unverified):

```typescript
const account = await tx.$executeRaw`
  SELECT * FROM "MT5Account"
  WHERE "status" = 'AVAILABLE'
  AND "accountSize" >= ${productAccountSize}
  ORDER BY "accountSize" ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
`;
```

**Note**: `SKIP LOCKED` allows other allocation requests to proceed to different accounts instead of waiting. This prevents request queuing but may lead to some accounts being skipped. Needs verification with actual Prisma/PostgreSQL interaction.

### Open Questions (Require DB Verification)

1. Does Prisma `$transaction` in PostgreSQL use `READ COMMITTED` or `SERIALIZABLE` isolation? — ASSUMED READ COMMITTED
2. Is implicit row locking sufficient, or is raw `SELECT FOR UPDATE` required? — UNVERIFIED
3. What is the performance impact of row locking under concurrent allocation requests? — UNVERIFIED
4. Does `SKIP LOCKED` work correctly through Prisma's `$executeRaw`? — UNVERIFIED
5. What is the transaction timeout default in the PostgreSQL configuration? — UNVERIFIED
