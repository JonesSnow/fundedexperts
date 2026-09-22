# Prisma Schema Documentation

**Last Updated:** 2026-09-20

## Overview

The Prisma schema defines the data layer for Funded Experts, running on PostgreSQL. It covers traders, evaluation rulesets, MT5 accounts, evaluations, funded accounts, assignment history, and audit logging.

## Entities

### Trader

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| email | String | Unique |
| firstName | String? | Optional |
| lastName | String? | Optional |
| status | TraderStatus | PENDING, ACTIVE, SUSPENDED, INACTIVE |
| createdAt | DateTime | Auto-set |
| updatedAt | DateTime | Auto-updated |

**Relationships:** Evaluations, FundedAccounts, AccountAssignments, AuditLogs

### Product

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| name | String | Unique |
| description | String? | Optional |
| pricingPlan | String? | Pricing plan name |
| settings | Json? | Flexible platform settings |
| isActive | Boolean | Default true |

**Relationships:** AuditLogs

### Ruleset

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| name | String | Unique |
| description | String? | Optional |
| isActive | Boolean | Default true |

**Relationships:** RulesetVersions, AuditLogs

### RulesetVersion

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| version | String | Semantic version (e.g., "1.0.0") |
| rulesetId | String | Foreign key → Ruleset |
| isActive | Boolean | Default true |

**Relationships:** Rules (1:N), Evaluations (1:N)
**Index:** Unique on (rulesetId, version)
**Immutable:** Once created, version fields should not change — new versions are created for modifications.

### Rule

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| rulesetVersionId | String | Foreign key → RulesetVersion |
| ruleType | RuleType | Profit target, drawdown limit, trading hours, etc. |
| name | String | Human-readable rule name |
| value | Json? | Flexible: Decimal, String, Int depending on ruleType |
| isRequired | Boolean | Default true |

**Relationships:** RulesetVersion (N:1), RuleEvaluation (1:N)

### MT5Account

| Field | Type | Notes |
|---|---|---|
| `id` | String (UUID) | Primary key |
| `accountNumber` | String | Unique account/login identifier |
| `broker` | String? | Broker/provider name |
| `server` | String? | MT5 server name |
| `login` | String? | MT5 login (not password) |
| `accountSize` | Decimal? (18,2) | Account size |
| `currency` | String | Account currency (default: "USD") |
| `purpose` | MT5AccountPurpose? | EVALUATION, FUNDED, OTHER |
| `status` | AccountStatus | AVAILABLE, IN_USE, INACTIVE, MAINTENANCE |
| `healthStatus` | MT5HealthStatus | CONNECTED, DISCONNECTED, ERROR |
| `credentials` | String? | **Encrypted at rest** with AES-256-GCM (see security notes) |
| `notes` | String? | Admin notes |
| `lastHealthCheck` | DateTime? | Last health check timestamp |

**Relationships:** AccountAssignments, RuleEvents, Evaluations, FundedAccounts, AuditLogs

### MT5AccountPurpose

| Value | Description |
|---|---|
| `EVALUATION` | Account used for evaluation |
| `FUNDED` | Account for funded trader |
| `OTHER` | Other purpose |

### Evaluation

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| traderId | String | Foreign key → Trader |
| rulesetVersionId | String | Foreign key → RulesetVersion |
| accountId | String? | Foreign key → MT5Account |
| status | EvaluationStatus | IN_PROGRESS, PASSED, FAILED, ABANDONED |
| startedAt | DateTime | Auto-set |
| completedAt | DateTime? | When evaluation finished |
| totalPnl | Decimal? | Total profit/loss, 18 digits, 2 decimal places |
| maxDrawdown | Decimal? | Maximum drawdown, 18/2 |
| notes | String? | Optional notes |

**Relationships:** Trader (N:1), RulesetVersion (N:1), MT5Account (N:1), RuleEvaluations, AuditLogs

### FundedAccount

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| traderId | String | Foreign key → Trader |
| accountId | String? | Foreign key → MT5Account |
| rulesetVersionId | String? | Foreign key → RulesetVersion |
| status | FundedAccountStatus | ACTIVE, CLOSED, SUSPENDED |
| allocatedAt | DateTime? | When account was allocated |
| activatedAt | DateTime? | When trading was enabled |
| closedAt | DateTime? | When account was closed |
| totalPnl | Decimal? | Cumulative P&L, 18/2 |

**Relationships:** Trader (N:1), MT5Account (N:1), RulesetVersion (N:1), AuditLogs

### AccountAssignment

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| traderId | String | Foreign key → Trader |
| accountId | String | Foreign key → MT5Account |
| status | AccountAssignmentStatus | ASSIGNED, RETURNED, REVOKED |
| assignedAt | DateTime | When assignment started |
| returnedAt | DateTime? | When assignment was returned |
| revokedAt | DateTime? | When assignment was revoked |

**Relationships:** Trader (N:1), MT5Account (N:1)
**Index:** Unique on (traderId, accountId, assignedAt) — preserves assignment history
**Purpose:** Tracks the full lifecycle of account assignments, separate from evaluation.

### RuleEvaluation

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| evaluationId | String | Foreign key → Evaluation |
| ruleId | String | Foreign key → Rule |
| result | RuleResult | PASS, FAIL, WARNING |
| actualValue | Json? | Measured value during evaluation |
| expectedValue | Json? | Threshold from Rule |
| details | String? | Failure explanation |
| evaluatedAt | DateTime | Auto-set |

**Relationships:** Evaluation (N:1), Rule (N:1)
**Index:** Unique on (evaluationId, ruleId)
**Purpose:** Records individual rule results during an evaluation run.

### RuleEvent

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| accountId | String | Foreign key → MT5Account |
| eventType | String | Technical monitoring event type |
| severity | String? | INFO, WARNING, ERROR |
| message | String | Event description |
| occurredAt | DateTime | When the event occurred |
| acknowledged | Boolean | Whether it was reviewed |

**Relationships:** MT5Account (N:1)
**Purpose:** Technical monitoring events (connection issues, server errors). Distinct from trader violations recorded in RuleEvaluation.

### AuditLog

| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| action | AuditAction | The action type |
| entityType | String | Entity name (e.g., "Trader", "Ruleset") |
| entityId | String | Entity ID |
| performedBy | String? | User ID (nullable for system events) |
| details | Json? | Additional context |
| timestamp | DateTime | Auto-set |

**Purpose:** Immutable log of all system events. Append-only — never update or delete rows.

## Enums Reference

| Enum | Values |
|---|---|
| TraderStatus | PENDING, ACTIVE, SUSPENDED, INACTIVE |
| EvaluationStatus | IN_PROGRESS, PASSED, FAILED, ABANDONED |
| FundedAccountStatus | ACTIVE, CLOSED, SUSPENDED |
| AccountStatus | AVAILABLE, IN_USE, INACTIVE, MAINTENANCE |
| AccountAssignmentStatus | ASSIGNED, RETURNED, REVOKED |
| MT5AccountPurpose | EVALUATION, FUNDED, OTHER |
| MT5HealthStatus | CONNECTED, DISCONNECTED, ERROR |
| RuleType | PROFIT_TARGET, DRAWDOWN_LIMIT, TRADING_HOURS, MIN_TRADES, MAX_DAILY_LOSS, MAX_OPEN_TRADES, MAX_LEVERAGE, TRADING_SESSION |
| AuditAction | EVALUATION_STARTED, EVALUATION_COMPLETED, EVALUATION_FAILED, RULE_CHANGED, RULE_VERSION_CREATED, TRADER_CREATED, TRADER_UPDATED, TRADER_SUSPENDED, ACCOUNT_CREATED, ACCOUNT_UPDATED, ACCOUNT_ASSIGNED, ACCOUNT_RETURNED, ACCOUNT_REVOKED, FUNDED_ACCOUNT_CREATED, FUNDED_ACCOUNT_CLOSED, FUNDED_ACCOUNT_SUSPENDED, CONFIGURATION_CHANGED, SYSTEM_EVENT |
| RuleResult | PASS, FAIL, WARNING |

## Indexes

| Model | Fields | Type | Purpose |
|---|---|---|---|
| RulesetVersion | (rulesetId, version) | Unique | Prevent duplicate versions per ruleset |
| AccountAssignment | (traderId, accountId, assignedAt) | Unique | Preserve assignment history without overlap |
| RuleEvaluation | (evaluationId, ruleId) | Unique | One result per rule per evaluation |
| Trader | email | Unique | Fast trader lookup by email |
| MT5Account | accountNumber | Unique | Fast account lookup by number |
| Ruleset | name | Unique | Unique ruleset names |
| Product | name | Unique | Unique product names |

## Lifecycle Separation

### Evaluation Lifecycle
`IN_PROGRESS → PASSED | FAILED | ABANDONED`

Evaluation runs under a specific RulesetVersion. RuleEvaluation records individual rule results. P&L and drawdown are tracked.

### Funded Account Lifecycle
`ACTIVE → CLOSED | SUSPENDED`

Funded accounts are created after a trader passes evaluation. They reference the original evaluation's RulesetVersion for audit trail. MT5Account linkage is optional (account may be allocated later).

### Account Assignment Lifecycle
`ASSIGNED → RETURNED | REVOKED`

Tracks which MT5Account is assigned to which Trader and when. Preserves full history via timestamps. Separate from evaluation — an account can be assigned without an active evaluation.

## Security Notes

### MT5 Credentials Encryption

The `MT5Account.credentials` field is encrypted at rest using **AES-256-GCM**.

| Parameter | Value |
|---|---|
| Algorithm | AES-256-GCM |
| Key Source | `MT5_ENCRYPTION_KEY` environment variable |
| Key Derivation | scrypt with application salt |
| IV | Random 12 bytes per encryption |
| Auth Tag | 16 bytes (GCM standard) |

**Encryption key** must be set via `MT5_ENCRYPTION_KEY` environment variable (minimum 32 characters). If not configured, credential storage is rejected.

**Security guarantees:**
- Authenticated encryption ensures confidentiality and integrity
- Unique IV per encryption (same plaintext → different ciphertext)
- No plaintext credentials stored in database
- No plaintext credentials in API responses
- No plaintext credentials in logs

**Current limitations:**
- Decryption not yet implemented (no MT5 connectivity)
- Key rotation not implemented
- No HSM/KMS integration

Until MT5 connectivity is implemented, the decryption function in `lib/encryption.ts` exists but is not called by any route handler.

## Known Limitations

1. **No real-time monitoring tables** — RuleEvent captures discrete events but does not support continuous time-series health data. A separate time-series approach (or external service) is needed for granular monitoring.

2. **Rule `value` field is JSON** — Rules have varied value types (Decimal for profit targets, String for trading hours). JSON provides flexibility but loses database-level type constraints. Application logic must validate types.

3. **No trader authentication table** — Authentication is outside Prisma schema scope (handled separately, e.g., NextAuth).

4. **AuditLog is append-only** but has no retention policy — old records accumulate indefinitely. A retention or archival strategy should be defined before production deployment.

5. **No Product-Ruleset relationship** — Products (pricing plans) are tracked but not yet linked to Rulesets. This relationship should be added when pricing plans are configured per ruleset.

## Unresolved XM Connectivity Requirements

> **Status:** BLOCKER (see docs/architecture.md §4.1)

The following are unknown and must be confirmed before expanding the schema:

- Whether XM exposes any API for automated account provisioning
- Whether XM supports webhooks for real-time account event notifications
- Whether XM API responses include fields not modeled here (e.g., margin levels, margin calls, swap rates)
- Whether XM requires specific authentication flow beyond standard MT5 login credentials

**Do not add XM-specific fields to this schema until they are documented and approved.**
