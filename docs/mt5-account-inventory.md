# MT5 Account Inventory

**Last Updated:** 2026-09-20

## Overview

The MT5 Account Inventory system allows administrators to manage MT5 demo accounts used for trader evaluations and funded accounts. Accounts are manually created and managed through the admin panel.

## Account Inventory Architecture

### Components

| Component | Path | Description |
|---|---|---|
| Admin UI | `/admin/accounts` | Inventory table, search, filters, add form |
| Account Detail | `/admin/accounts/[id]` | View details, status, health |
| API: List/Create | `/api/accounts` | GET (list with filters), POST (create) |
| API: Detail | `/api/accounts/[id]` | GET (single), PUT (update), DELETE (archival check) |
| API: Status | `/api/accounts/[id]/status` | PUT (change account status with transition validation) |
| API: Health | `/api/accounts/[id]/health` | PUT (update health + lastHealthCheck) |

### Authentication

All inventory operations require ADMIN role. Authentication is enforced server-side in every API route via JWT session validation.

## Account Fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `accountNumber` | String (unique, max 50) | Yes | — | Account number/login identifier |
| `broker` | String? | No | — | Broker/provider name |
| `server` | String? | No | — | MT5 server name |
| `login` | String? | No | — | MT5 login (username, not password) |
| `accountSize` | Decimal (18,2)? | No | — | Account size |
| `currency` | String | No | "USD" | Account currency |
| `purpose` | MT5AccountPurpose? | No | — | Account purpose (EVALUATION, FUNDED, OTHER) |
| `status` | AccountStatus | No | AVAILABLE | Account status |
| `healthStatus` | MT5HealthStatus | No | DISCONNECTED | Health status |
| `credentials` | String? | No | — | **Encrypted at rest** (AES-256-GCM) — see security section |
| `notes` | String? | No | — | Admin notes |
| `lastHealthCheck` | DateTime? | No | — | Last health check timestamp |
| `createdAt` | DateTime | Auto | now() | Creation timestamp |
| `updatedAt` | DateTime | Auto | auto | Update timestamp |

## Status Lifecycle

### Account Status

```
AVAILABLE → IN_USE → INACTIVE → MAINTENANCE → AVAILABLE
                ↓             ↑             ↓
              MAINTENANCE ← ← ← ← ← ← ← ←
```

| From | To | Description |
|---|---|---|
| AVAILABLE | IN_USE | Assigned to trader |
| AVAILABLE | INACTIVE | Admin deactivation |
| AVAILABLE | MAINTENANCE | Admin places in maintenance |
| IN_USE | INACTIVE | Admin deactivation |
| IN_USE | MAINTENANCE | Admin places in maintenance |
| INACTIVE | AVAILABLE | Admin reactivation |
| INACTIVE | MAINTENANCE | Admin places in maintenance |
| MAINTENANCE | AVAILABLE | Admin post-maintenance |
| MAINTENANCE | INACTIVE | Admin deactivation |

**Invalid transitions are rejected.** For example: IN_USE → AVAILABLE, MAINTENANCE → IN_USE, etc.

### Health Status

| Status | Description |
|---|---|
| `CONNECTED` | MT5 server connection active |
| `DISCONNECTED` | No active connection |
| `ERROR` | Connection error |

Health status is updated manually by administrators. The `lastHealthCheck` timestamp is recorded when health status is updated.

## Admin Permissions

| Action | Required Role | Endpoint / UI |
|---|---|---|
| View account list | ADMIN | `GET /api/accounts` / `/admin/accounts` |
| View account details | ADMIN | `GET /api/accounts/[id]` / `/admin/accounts/[id]` |
| Create account | ADMIN | `POST /api/accounts` |
| Update account metadata | ADMIN | `PUT /api/accounts/[id]` |
| Update account status | ADMIN | `PUT /api/accounts/[id]/status` |
| Update health status | ADMIN | `PUT /api/accounts/[id]/health` |
| Delete account | ADMIN | `DELETE /api/accounts/[id]` (blocked if dependencies exist) |

**All operations check both JWT session validity and ADMIN role server-side.**

## Credential Security

### Encryption Implementation

Credentials are encrypted at rest using **AES-256-GCM** (authenticated encryption).

| Parameter | Value |
|---|---|
| Algorithm | AES-256-GCM |
| Key Source | `MT5_ENCRYPTION_KEY` environment variable |
| Key Derivation | scrypt with application salt |
| IV | Random 12 bytes per encryption operation |
| Auth Tag | 16 bytes (GCM standard) |

### Encryption Key Requirements

- `MT5_ENCRYPTION_KEY` must be at least 32 characters
- Loaded exclusively from environment variable at runtime
- Never hardcoded in source code
- Must be a cryptographically random string in production
- If not configured, credential storage is rejected (not stored as plaintext)

### Data Flow

1. Admin enters credentials via form (plaintext over HTTPS)
2. Server encrypts using AES-256-GCM before database write
3. Encrypted value stored in PostgreSQL `credentials` column (base64 encoded)
4. Credentials are **never** included in API responses
5. Credentials are **never** displayed in UI
6. Credentials are **never** logged
7. Decryption is restricted to minimum required server-side code (not yet needed — MT5 connectivity not implemented)

### Security Measures

- **Authenticated encryption**: AES-256-GCM ensures both confidentiality and integrity
- **Unique IV per encryption**: Same plaintext produces different ciphertext each time
- **Key from environment**: No hardcoded keys
- **No plaintext storage**: Plaintext credentials exist only during the encryption operation in memory
- **Credential exclusion**: All API routes use `omitCredentials` helper
- **Audit logging**: Credential changes are logged without recording secret values

### Current Limitations

1. **Decryption not implemented** — MT5 connectivity not yet implemented; encrypted credentials cannot be retrieved currently
2. **Key rotation not implemented** — Requires re-encryption of all stored credentials
3. **No HSM/KMS** — Key stored in environment variable; for production, use a hardware security module or key management service

## Audit Logging

All administrative account actions are recorded via the `AuditLog` model:

| Action | Entity Type | Trigger |
|---|---|---|
| `ACCOUNT_CREATED` | MT5Account | New account created (includes credentialsStored flag) |
| `ACCOUNT_UPDATED` | MT5Account | Metadata update, status change, health change, or deletion |

Audit entries include:
- `action` — The action type (AuditAction enum)
- `entityType` — "MT5Account"
- `entityId` — Account UUID
- `performedBy` — Admin trader ID
- `details` — JSON with change context (account number, status changes, health changes, credential change flag)
- `timestamp` — Auto-set creation time

**Audit logs are append-only** — never update or delete audit log rows.

**Credential values are never logged** — Only a `credentialsStored` flag is recorded.

## Assignment History

The `AccountAssignment` model tracks full assignment lifecycle:

| Field | Description |
|---|---|
| `traderId` | Assigned trader |
| `accountId` | Assigned account |
| `status` | ASSIGNED, RETURNED, REVOKED |
| `assignedAt` | When assignment started |
| `returnedAt` | When assignment was returned |
| `revokedAt` | When assignment was revoked |

### Safety Guarantees

- **Unique constraint** on `(traderId, accountId, assignedAt)` preserves assignment history without overlap
- **No silent deletion** — Assignments are never deleted; only status changes (RETURNED, REVOKED)
- **Available vs occupied** — Account `status` field clearly identifies AVAILABLE (free) vs IN_USE (occupied)
- **Assignment history** — All historical assignments are preserved with timestamps

### Deletion Policy

Accounts **cannot be physically deleted** if they have dependent records:
- AccountAssignments (history)
- Evaluations
- FundedAccounts
- RuleEvents

If deletion is attempted with dependencies, a 409 Conflict error is returned. Prefer setting status to INACTIVE for soft archival.

### Known Limitations

1. **No automatic assignment** — Account assignment is manual only
2. **No concurrency control** — Concurrent assignment operations are not protected
3. **No real-time monitoring** — Health status requires manual updates
4. **No MT5 API integration** — All account management is through admin panel
5. **Decryption not yet available** — Credentials stored encrypted but cannot be retrieved yet
6. **Deletion blocked by dependencies** — Physical deletion prevented when records exist; archival via INACTIVE status recommended

## Database Schema Changes

### MT5Account Model Additions (Phase 5)

| Field | Type | Added | Description |
|---|---|---|---|
| `broker` | String? | Phase 5 | Broker/provider name |
| `accountSize` | Decimal? @db.Decimal(18,2) | Phase 5 | Account size |
| `currency` | String | Phase 5 | Account currency (default: "USD") |
| `purpose` | MT5AccountPurpose? | Phase 5 | Account purpose enum |
| `notes` | String? | Phase 5 | Admin notes |
| `credentials` | String? | Phase 5 | Encrypted with AES-256-GCM |

### MT5AccountPurpose Enum (Phase 5)

| Value | Description |
|---|---|
| `EVALUATION` | Account used for evaluation |
| `FUNDED` | Account for funded trader |
| `OTHER` | Other purpose |

### Existing Fields (Unchanged)

| Field | Type | Notes |
|---|---|---|
| `id` | String (UUID) | Primary key |
| `accountNumber` | String | Unique identifier |
| `server` | String? | MT5 server name |
| `login` | String? | MT5 login (not password) |
| `healthStatus` | MT5HealthStatus | CONNECTED, DISCONNECTED, ERROR |
| `status` | AccountStatus | AVAILABLE, IN_USE, INACTIVE, MAINTENANCE |
| `lastHealthCheck` | DateTime? | Last health check timestamp |
| `createdAt` | DateTime | Auto-set |
| `updatedAt` | DateTime | Auto-updated |

See `prisma/schema.prisma` for the complete schema.
