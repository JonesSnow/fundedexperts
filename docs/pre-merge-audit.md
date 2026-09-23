# Pre-Merge Technical Audit

**Date:** 2026-09-22
**Scope:** Evaluation API and security-hardening commit (`c05dcd2`)
**Branch:** `audit/pre-merge-evaluation-api` (read-only audit, no modifications to `main`)
**Status:** COMPLETED

---

## 1. Missing or Incomplete Frontend Pages

| Page | Status | Evidence |
|------|--------|----------|
| Orders | **MISSING** | No `app/orders/page.tsx` or `app/orders/**` routes. Orders exist in DB schema and API (`/api/orders`, `/api/orders/[id]`) but no UI. |
| Evaluation details | **MISSING** | No `app/evaluations/**` pages. Evaluations have API endpoints but no UI for viewing details. |
| Funded account details | **MISSING** | No `app/funded-accounts/**` pages. Funded accounts have API but no UI for individual account viewing. |
| Ledger | **MISSING** | No `app/ledger/**` pages and no `app/api/ledger/**` routes. `LedgerEntry` exists in Prisma schema with full CRUD fields but no API endpoint or UI. |
| Notifications | **MISSING** | No notification DB model, no API routes, no UI pages. Entirely absent from the platform. |
| Monitoring | **PARTIAL** | `lib/monitoring/` exists with worker, scheduler, types, repository, health check, mock adapter. No UI page (`app/monitoring/`) and no API endpoints (`app/api/monitoring/`). |
| Profile/settings | **MISSING** | No `app/profile/**` or `app/settings/**` pages. Traders cannot update name, email, or password. |

**Impact:** Traders and admins cannot access key financial data (ledger, orders, evaluations) through the UI. Must rely on API calls or DB queries directly.

---

## 2. API Gaps and Inconsistencies

### 2.1 Missing Endpoints

| Endpoint | Expected | Status |
|----------|----------|--------|
| `GET /api/ledger` | List ledger entries | **MISSING** |
| `GET /api/ledger/:id` | Get specific entry | **MISSING** |
| `GET /api/notifications` | List notifications | **MISSING** |
| `POST /api/notifications/:id/ack` | Acknowledge notification | **MISSING** |
| `GET /api/monitoring/:accountId/metrics` | Get monitoring metrics | **MISSING** |
| `GET /api/profile` | Get trader profile | **MISSING** |
| `PUT /api/profile` | Update trader profile | **MISSING** |
| `GET /api/orders` | List orders (exists) | EXISTS but no UI |
| `GET /api/evaluations/:id/audit` | Evaluation audit trail | **MISSING** (documented as future work) |

### 2.2 Authorization Risks

| Risk | Location | Detail |
|------|----------|--------|
| **Sensitive data exposure** | `GET /api/funded-accounts/:id` | Response includes account data via `lib/funded-account.ts:getFundedAccount()`. While the list endpoint includes `select` with limited fields, the single-endpoint returns the full account object from the library function. Credential exposure risk if `getFundedAccount` includes credentials in its return type. |
| **No rate limiting on evaluation endpoints** | `GET /api/evaluations`, `GET /api/evaluations/:id` | No `checkRateLimit()` calls. Login/register have rate limiting, but evaluation listing could be abused for data scraping. |
| **No rate limiting on account management** | `POST /api/accounts`, `GET /api/accounts` | Account creation and listing have no rate limiting. |
| **No audit logging on GET endpoints** | `GET /api/orders`, `GET /api/evaluations`, `GET /api/evaluations/:id`, `GET /api/orders/:id`, `GET /api/funded-accounts` | No `AuditLog` entries created for read operations. Data access is untrackable. |
| **Logout doesn't invalidate sessions** | `POST /api/auth/logout` | Only clears cookie. JWT session remains valid server-side until expiry (7 days). No session blacklist or token revocation. |
| **Admin-only endpoints with no rate limiting** | `POST /api/accounts`, `POST /api/funded-accounts` | Admin operations lack rate protection against accidental or malicious bulk operations. |

### 2.3 Duplicate Helper Functions

| Function | Duplications | Locations |
|----------|-------------|-----------|
| `getAuthenticatedUser()` | **17 instances** | `app/api/orders/route.ts`, `app/api/orders/[id]/route.ts`, `app/api/products/route.ts`, `app/api/products/[id]/route.ts`, `app/api/accounts/route.ts`, `app/api/accounts/[id]/route.ts`, `app/api/accounts/[id]/status/route.ts`, `app/api/accounts/[id]/health/route.ts`, `app/api/funded-accounts/route.ts`, `app/api/funded-accounts/[id]/route.ts`, `app/api/rulesets/route.ts`, `app/api/rulesets/[id]/route.ts`, `app/api/rulesets/[id]/versions/route.ts`, `app/api/rulesets/[id]/versions/[version]/route.ts`, `app/api/rulesets/[id]/versions/[version]/publish/route.ts`, `app/api/rulesets/[id]/versions/[version]/rules/route.ts`, `app/api/auth/session/route.ts` |
| `omitCredentials()` | **4 instances** | `app/api/accounts/route.ts`, `app/api/accounts/[id]/route.ts`, `app/api/accounts/[id]/status/route.ts`, `app/api/accounts/[id]/health/route.ts` |
| `safeEvaluation()` | **2 instances** | `app/api/evaluations/route.ts`, `app/api/evaluations/[id]/route.ts` |
| `getAuthenticatedTrader()` | **2 instances** | `app/api/evaluations/route.ts`, `app/api/evaluations/[id]/route.ts` |

### 2.4 Validation Duplication

| Centralized | Duplicate | Location |
|-------------|-----------|----------|
| `lib/order-validation.ts:validateCreateOrderInput()` | `app/api/orders/route.ts:validateOrderInput()` | Inline function in orders route. Similar but not identical validation rules (different parameter types, different field checks). |
| `lib/auth/validation.ts:validateLoginInput()` | `app/api/orders/[id]/activate/route.ts` | Activation route has its own input validation logic not using shared validation. |

---

## 3. Code Quality

### 3.1 Repeated `safeEvaluation()` Logic

Defined identically in both `app/api/evaluations/route.ts` and `app/api/evaluations/[id]/route.ts`. Same function body, same types, same `Number()` conversions. Should be extracted to a shared utility (e.g., `lib/api/safe-evaluation.ts`).

### 3.2 PrismaClient Instantiation Patterns

**22 instances** of `new PrismaClient()` across all API route files. No connection pooling, no singleton pattern, no cleanup. Each route creates its own connection pool, exhausting database resources under load.

Files with `PrismaClient` instantiation (22 total):
- All 16 API route files
- `middleware.ts`
- `app/api/auth/session/route.ts`
- `app/api/auth/login/route.ts`
- `app/api/auth/register/route.ts`
- `tests/evaluations-api.test.ts`
- Other test files

### 3.3 Deprecated Next.js Middleware Convention

`middleware.ts` uses the `middleware` file convention which is deprecated in Next.js 16. Will be replaced by the `proxy` pattern.

```typescript
// middleware.ts line 7
export async function middleware(request: NextRequest) { ... }
```

Additionally, `middleware.ts` instantiates `PrismaClient` at module level (line 5) without cleanup, potentially leaking connections.

### 3.4 Error Handling Inconsistencies

| Issue | Count | Examples |
|-------|-------|---------|
| Empty `catch { }` blocks (swallow errors) | **14 occurrences** across API routes | `app/api/evaluations/route.ts:137`, `app/api/funded-accounts/route.ts:75,129`, `app/api/evaluations/[id]/route.ts:138`, `app/api/accounts/route.ts:206`, `app/api/accounts/[id]/route.ts:64,203`, etc. |
| Inconsistent error response shapes | Multiple | Some routes return `{ success: false, error: "..." }`, others return `{ success: false, errors: {...} }`, others return `{ success: false, error: "...", errorCategory: "..." }` |
| No error logging in catch blocks | 14 | Empty catch blocks provide no error visibility |
| Unauthorized routes return inconsistent status codes | Multiple | Some return 401 with `{ success: false, error: "Unauthorized" }`, others use different error keys |

### 3.5 Other Code Quality Issues

| Issue | Detail |
|-------|--------|
| **Dashboard page title inconsistency** | `app/catalog/page.tsx:33` shows title "Funded Accounts" but the page displays products/catalog content. |
| **Admin pages are placeholders** | `app/admin/page.tsx:41,55` shows "Product management interface will be expanded in a future phase." and "Ruleset management interface will be expanded in a future phase." |
| **`validateOrderInput` vs `validateCreateOrderInput`** | `app/api/orders/route.ts:191` defines inline validation; `lib/order-validation.ts:10` exports shared validation. Similar but different signatures - inline version takes `Record<string, unknown>`, shared version takes typed `CreateOrderInput`. |

---

## 4. Testing Gaps

### 4.1 Tests Using Simulated Helpers Instead of HTTP Execution

| Test File | Helper Used | What It Tests |
|-----------|------------|---------------|
| `tests/evaluations-api.test.ts` | `simulateEvaluationsList()` | Simulates list logic instead of calling `GET /api/evaluations` via HTTP |
| `tests/evaluations-api.test.ts` | `simulateEvaluationGet()` | Simulates get logic instead of calling `GET /api/evaluations/:id` via HTTP |
| `tests/activation.test.ts` | `activateEvaluation()` (service function) | Tests service layer directly instead of calling `POST /api/orders/:id/activate` via HTTP |

**Impact:** Simulated tests don't catch middleware, route-level validation, serialization, or HTTP contract issues. A route could pass simulated tests but fail in production due to auth middleware, body parsing, or response serialization differences.

### 4.2 Missing Frontend Tests

No tests exist for any frontend page:
- `app/dashboard/page.tsx` - 688 lines, no tests
- `app/admin/page.tsx` - no tests
- `app/catalog/page.tsx` - no tests
- `app/login/page.tsx` - no tests
- `app/register/page.tsx` - no tests

### 4.3 Missing Concurrency Tests

No tests for:
- Parallel order creation (idempotency key race conditions)
- Simultaneous evaluation status transitions
- Concurrent funded account approvals
- Multiple traders accessing the same MT5 account

### 4.4 Missing Payment and Monitoring Integration Coverage

| Area | Coverage |
|------|----------|
| Mock payment provider | Tested in `tests/activation.test.ts` |
| Real payment provider | **NO TESTS** - `lib/payment.ts` defines interface but no integration tests exist |
| Monitoring worker | **NO TESTS** - `lib/monitoring/worker.ts` and related files have no test coverage |
| Monitoring scheduler | **NO TESTS** |
| Monitoring health check | **NO TESTS** |
| Monitoring mock adapter | **NO TESTS** |
| Encryption | Partially tested (`tests/mt5-accounts.test.ts` has encryption tests) |
| Session management | Partially tested (`tests/auth.test.ts` has session tests) |

---

## 5. Prioritized Action Plan

### 5.1 Critical (block next phase)

| # | Finding | Action |
|---|---------|--------|
| C1 | **No ledger API endpoints** | Create `app/api/ledger/route.ts` and `app/api/ledger/[id]/route.ts`. LedgerEntry is in schema with full fields but no API access. |
| C2 | **22 PrismaClient instances with no pooling** | Create a shared PrismaClient singleton in `lib/prisma.ts` and update all 22 route files to use it. Risk of connection exhaustion under load. |
| C3 | **Logout doesn't invalidate sessions** | Implement session blacklist in `lib/auth/session.ts` or switch to opaque tokens with server-side storage. Current 7-day JWT validity after logout is a security risk. |
| C4 | **14 empty catch blocks swallow errors** | Add error logging to all catch blocks. Current state means failures in API routes are silent. |

### 5.2 High (significant risk or effort)

| # | Finding | Action |
|---|---------|--------|
| H1 | **`getAuthenticatedUser` duplicated 17 times** | Extract to shared middleware or utility function in `lib/api/auth.ts`. Variations in signatures need to be reconciled. |
| H2 | **`omitCredentials` duplicated 4 times** | Extract to shared utility in `lib/api/safe-fields.ts`. |
| H3 | **`safeEvaluation` duplicated 2 times** | Extract to `lib/api/safe-evaluation.ts`. |
| H4 | **`validateOrderInput` duplicates `validateCreateOrderInput`** | Remove inline version, use shared version consistently in orders route. Reconcile validation rules. |
| H5 | **No rate limiting on evaluation/account endpoints** | Add `checkRateLimit()` to `GET /api/evaluations`, `GET /api/evaluations/:id`, `GET /api/accounts`, `POST /api/accounts`. |
| H6 | **No audit logging on GET endpoints** | Add `AuditLog` entries for `GET /api/orders`, `GET /api/evaluations`, `GET /api/evaluations/:id`, `GET /api/orders/:id`, `GET /api/funded-accounts`. |
| H7 | **Middleware deprecation** | Migrate `middleware.ts` to `proxy` convention before Next.js 16 upgrade. Also move PrismaClient out of module-level scope. |
| H8 | **Tests use simulated helpers** | Add integration tests that execute actual HTTP routes using a test server (e.g., `supertest` or Next.js test utilities). |

### 5.3 Medium (improve maintainability)

| # | Finding | Action |
|---|---------|--------|
| M1 | **Missing frontend pages** | Create pages for Orders, Evaluation Details, Funded Account Details, Ledger, Notifications, Monitoring, Profile/Settings. |
| M2 | **Monitoring infrastructure has no UI/API** | Create `app/monitoring/page.tsx` and `app/api/monitoring/**` routes. |
| M3 | **Dashboard title mismatch** | Fix `app/catalog/page.tsx:33` - title says "Funded Accounts" but page shows products. |
| M4 | **Admin pages are placeholders** | Implement actual product and ruleset management UI. |
| M5 | **Profile/settings pages missing** | Create profile view and settings update pages. |
| M6 | **Inconsistent error response shapes** | Standardize on `{ success: false, error: string }` for simple errors and `{ success: false, errors: Record<string, string> }` for validation errors across all routes. |
| M7 | **`validateOrderInput` vs `validateCreateOrderInput`** | Consolidate into single function in `lib/order-validation.ts`. |
| M8 | **No notification system** | Design and implement notification model, API, and UI. |

### 5.4 Low (nice to have)

| # | Finding | Action |
|---|---------|--------|
| L1 | **No concurrency tests** | Add tests for parallel order creation, simultaneous evaluations, concurrent account access. |
| L2 | **No payment integration tests** | Create integration tests for real payment provider (mock provider is tested). |
| L3 | **No monitoring integration tests** | Add tests for monitoring worker, scheduler, health checks. |
| L4 | **Empty admin pages** | Expand admin UI beyond placeholder text. |
| L5 | **No profile page** | Allow traders to update name, email, or password. |
| L6 | **`GET /api/accounts` is ADMIN-only** | Consider allowing traders to view their own MT5 accounts with credential filtering. |
| L7 | **`GET /api/funded-accounts/:id` response** | Verify `lib/funded-account.ts:getFundedAccount()` response doesn't include credentials. |

---

## 6. Files Audited

| Category | Files |
|----------|-------|
| API routes | All 30+ route files in `app/api/**` |
| Pages | All 11 page files in `app/**/page.tsx` |
| Layout | `app/layout.tsx` |
| Middleware | `middleware.ts` |
| Auth | `lib/auth/session.ts`, `lib/auth/validation.ts`, `lib/auth/hash.ts`, `lib/auth/rate-limit.ts` |
| API helpers | `lib/api/*`, `lib/payment.ts`, `lib/logger.ts`, `lib/order-validation.ts` |
| Monitoring | `lib/monitoring/*.ts` (12 files) |
| Tests | `tests/evaluations-api.test.ts`, `tests/activation.test.ts`, `tests/auth.test.ts` |
| Config | `tsconfig.json`, `package.json`, `.gitignore`, `eslint.config.mjs` |
| Schema | `prisma/schema.prisma` |
| Docs | `docs/evaluation-api-design.md`, `docs/evaluation-security-review.md` |

---

## 7. Commit Reference

| | |
|---|---|
| **Commit** | `c05dcd2` |
| **Message** | `feat(evaluation-api): implement Evaluation API endpoints with security hardening` |
| **Parent** | `9a9d14c` |
| **Changed files** | 12 |
| **Lines added** | 2,324 |
| **Lines removed** | 87 |

---

## 8. Conclusion

The evaluation API implementation is functionally complete and secure, with proper authorization and field exposure controls. However, the audit reveals significant technical debt in:

1. **Helper duplication** - 17+ copies of auth checks, 4 copies of credential filtering, 2 copies of safe evaluation
2. **Resource management** - 22 unpooled PrismaClient instances
3. **Error observability** - 14 silent catch blocks across API routes
4. **Test coverage gaps** - Simulated tests miss real HTTP behavior; no integration, concurrency, or monitoring tests
5. **Missing UI** - 7 page types with no frontend implementation

All findings are documented without modifying the production codebase on `main`.
