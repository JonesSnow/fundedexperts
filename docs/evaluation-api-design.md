# Evaluation API Design

## Implemented Endpoints

### GET /api/evaluations

List evaluations for the authenticated trader.

**Authorization**:
- TRADER: sees only own evaluations (scoped by `traderId`)
- ADMIN: sees all evaluations

**Query Parameters**:
- `status` (optional): Filter by EvaluationStatus (IN_PROGRESS, PASSED, FAILED, ABANDONED)

**Response**: `{ success: true, evaluations: EvaluationSummary[] }`

**EvaluationSummary fields**:
- `id`: Unique evaluation identifier
- `rulesetVersionId`: Associated ruleset version ID
- `rulesetName`: Name of the associated ruleset (from Ruleset model)
- `rulesetVersion`: Version string (e.g., "1.0")
- `status`: EvaluationStatus (IN_PROGRESS, PASSED, FAILED, ABANDONED)
- `account`: Safe account info (id, accountNumber, status, healthStatus) or null
- `startedAt`: When the evaluation began
- `completedAt`: When the evaluation finished (nullable)
- `totalPnl`: Total profit/loss (nullable, Decimal)
- `maxDrawdown`: Maximum drawdown (nullable, Decimal)
- `rulePassedCount`: Number of passed rule evaluations
- `ruleFailedCount`: Number of failed rule evaluations
- `ruleWarningCount`: Number of warning rule evaluations
- `ruleResults`: Array of individual rule results (ruleType, ruleName, result, evaluatedAt)
- `createdAt`: Record creation timestamp
- `updatedAt`: Record update timestamp

**Security**:
- `traderId` is included ONLY in admin responses
- MT5 credentials are never exposed (account select excludes credentials, login, server, broker)
- All queries are scoped by `traderId` for non-admin users at the database level

### GET /api/evaluations/[id]

Get a specific evaluation by ID.

**Authorization**:
- TRADER: can access only own evaluations (ownership check via `traderId`)
- ADMIN: can access any evaluation

**Response**: `{ success: true, evaluation: EvaluationDetail }` or `{ success: false, error: "Evaluation not found" }` (404)

Returns the same fields as list endpoint with full detail.

**Security**:
- Returns 403 if trader accesses another trader's evaluation
- `traderId` included only in admin responses
- MT5 credentials never exposed

## Authorization Rules Summary

| Endpoint | TRADER | ADMIN | Unauthenticated |
|----------|--------|-------|-----------------|
| GET /api/evaluations | Own evaluations only | All evaluations | 401 |
| GET /api/evaluations/:id | Own evaluations only | All evaluations | 401 |
| | 403 for cross-trader access | — | — |

## Response Field Limitations

### Never Exposed
- `traderId` (non-admin responses)
- MT5 account credentials
- MT5 account login, server, broker (sensitive infrastructure details)
- Trader email, password, or authentication tokens
- Internal Prisma model fields not listed above

### Safe to Expose
- Evaluation ID and timestamps
- Ruleset name and version
- Evaluation status (from EvaluationStatus enum)
- Account number (from MT5Account, credentials excluded)
- Account status and health status
- Rule evaluation results (PASS/FAIL/WARNING)
- PnL and drawdown data

## Data Accuracy

- Evaluation status comes from actual Evaluation records (not inferred from order status)
- Rule compliance counts are derived from persisted RuleEvaluation records
- Unavailable data (e.g., no evaluation yet) is shown as empty/null, NOT as zero progress
- Order status is NOT treated as evaluation status

## Data Flow

1. User purchases product → Order created (CREATED → PENDING_PAYMENT → PAID)
2. User activates paid order → `POST /api/orders/:id/activate` → Evaluation created (IN_PROGRESS)
3. Evaluation progresses via business logic → PASSED or FAILED
4. PASSED evaluation → Funded account eligible (create via `POST /api/funded-accounts`)

## Remaining Future Work

- POST /api/evaluations/:id/complete — Mark evaluation as PASSED/FAILED (admin-only)
- PUT /api/evaluations/:id — Update evaluation notes or status (admin-only)
- GET /api/evaluations/:id/audit — Retrieve evaluation audit trail
- Evaluation metrics dashboard (live rule compliance during IN_PROGRESS)
- Cross-evaluation comparison and progress analytics
