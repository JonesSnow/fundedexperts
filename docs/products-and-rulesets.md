# Products and Rulesets

**Last Updated:** 2026-10-14

## Product Catalog

Products represent configured simulated evaluation offers. A record or category label is not an offer: only active products that pass publication validation and have published, active stage rules can appear in the public catalog.

### Product Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | String (unique, max 100) | Yes | Product display name |
| `description` | String? | No | Product description |
| `accountSize` | Decimal? | No | MT5 account size (e.g., $100,000) |
| `price` | Decimal? | No | Product price |
| `currency` | String | No | Currency code (default: "USD") |
| `rulesetId` | String? | No | Associated ruleset |
| `isActive` | Boolean | No | Whether product is available (default: true) |
| `displayOrder` | Int | No | Catalog ordering (default: 0) |
| `settings` | Json? | No | Flexible configuration |
| `pricingPlan` | String? | No | Pricing plan reference |
| `createdAt` | DateTime | Auto | Creation timestamp |
| `updatedAt` | DateTime | Auto | Update timestamp |

### Product category concepts

| Category | Meaning |
|---|---|
| Beginner | Category label; not evidence of an active offer |
| Pro | Category label; not evidence of an active offer |
| Expert | Category label; not evidence of an active offer |
| Direct Funded | Category label; fulfillment is unavailable until implemented |

Only validated, active product records are offers. Product briefs and category labels do not create offers, prices, account sizes, or purchase availability.

## Ruleset Management

Rulesets define the evaluation criteria for funded account challenges.

### Ruleset Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | String (unique) | Yes | Ruleset name |
| `description` | String? | No | Ruleset description |
| `isActive` | Boolean | No | Whether ruleset is active (default: true) |
| `createdAt` | DateTime | Auto | Creation timestamp |
| `updatedAt` | DateTime | Auto | Update timestamp |

### Ruleset Versioning

Rulesets support immutable versioning. Each version is a snapshot of the rules at a point in time.

**Key Rules:**
- **Published versions cannot be modified.** Creating a new version is the only way to change rules.
- **Existing evaluations reference the exact version used at evaluation time.**
- Each version has a status: `DRAFT`, `PUBLISHED`, or `ARCHIVED`.

### Ruleset Version Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | String | Yes | Version number (e.g., "1.0.0") |
| `rulesetId` | String | Yes | Parent ruleset |
| `status` | RulesetVersionStatus | No | Version status (default: DRAFT) |
| `effectiveDate` | DateTime? | No | When this version takes effect |
| `isActive` | Boolean | No | Whether version is active (default: true) |
| `createdAt` | DateTime | Auto | Creation timestamp |
| `updatedAt` | DateTime | Auto | Update timestamp |

### Version Lifecycle

```
DRAFT → PUBLISHED → ARCHIVED
```

- **DRAFT:** Editable. Can be published when ready.
- **PUBLISHED:** Immutable. Used in active evaluations. Can be archived.
- **ARCHIVED:** Read-only. Historical reference only.

### Rules

Rules are individual criteria within a ruleset version.

| Field | Type | Required | Description |
|---|---|---|---|
| `ruleType` | RuleType | Yes | Type of rule (profit target, drawdown, etc.) |
| `name` | String | Yes | Rule name |
| `value` | Json? | No | Rule threshold (varies by type) |
| `isRequired` | Boolean | No | Whether rule must pass (default: true) |
| `effectiveDate` | DateTime? | No | When rule takes effect |
| `createdAt` | DateTime | Auto | Creation timestamp |

### Supported Rule Types

| Type | Description | Value Format |
|---|---|---|
| `PROFIT_TARGET` | Minimum profit percentage | Decimal (e.g., 10.00 for 10%) |
| `DRAWDOWN_LIMIT` | Maximum overall drawdown | Decimal (e.g., 5.00 for 5%) |
| `MAX_DAILY_LOSS` | Maximum daily loss | Decimal (e.g., 3.00 for 3%) |
| `MIN_TRADES` | Minimum number of trades | Integer |
| `MAX_OPEN_TRADES` | Maximum open positions | Integer |
| `MAX_LEVERAGE` | Maximum allowed leverage | Integer (e.g., 30 for 1:30) |
| `TRADING_SESSION` | Trading time restrictions | String (e.g., "NYC", "LON", "SYD") |
| `TRADING_HOURS` | Trading hour constraints | String (e.g., "09:00-17:00") |

**Note:** Rule value types are flexible (Json?) to accommodate different rule types. Application logic must validate the format based on ruleType.

## Admin Permissions

| Action | Role Required | API Endpoint |
|---|---|---|
| View products | Public | `GET /api/products` |
| Create product | ADMIN | `POST /api/products` |
| Update product | ADMIN | `PUT /api/products/[id]` |
| View rulesets | Public | `GET /api/rulesets` |
| Create ruleset | ADMIN | `POST /api/rulesets` |
| Create version | ADMIN | `POST /api/rulesets/[id]/versions` |
| Update version (draft) | ADMIN | `PUT /api/rulesets/[id]/versions/[version]` |
| Publish version | ADMIN | `POST /api/rulesets/[id]/versions/[version]/publish` |
| Add rule | ADMIN | `POST /api/rulesets/[id]/versions/[version]/rules` |

**All admin operations check both JWT session validity and ADMIN role server-side.**

## Public catalog API contract

Public reads require no session and expose only validated active products and published rules attached to those products. Inactive products, unsupported direct-funded offers, draft or archived versions, and unrelated rulesets are excluded.

| Endpoint | Success response | Empty result | Failure status |
|---|---|---|---|
| `GET /api/products` | `{ "success": true, "products": [...] }` | HTTP 200 with `products: []` | HTTP 429 when rate limited; HTTP 503 when catalog data cannot be read or safely serialized |
| `GET /api/rulesets` | `{ "success": true, "rulesets": [...] }` | HTTP 200 with `rulesets: []` | HTTP 503 when approved product rules cannot be read or safely serialized |
| `GET /api/rulesets/{id}/versions/{version}/rules` | `{ "success": true, "rules": [...] }` | HTTP 200 with `rules: []` for an attached published version | HTTP 400 for malformed identifiers, HTTP 404 for a version not attached to a public offer, HTTP 503 when published rules cannot be read |

Failure bodies use `{ "success": false, "code": "...", "error": "...", "correlationId": "..." }`. Server logs record the correlation ID and a sanitized database/query failure category; raw exception messages, connection strings, and credentials are not returned to callers. Product prices and account sizes are decimal strings to avoid floating-point rounding.

`/catalog` is the canonical plan-discovery route. `/pricing` redirects to `/catalog#configured-products` for existing links.

## Security Notes

- **Published ruleset versions cannot be modified.** The API enforces this by rejecting updates to PUBLISHED versions.
- **Evaluation integrity:** Existing evaluations remain linked to their original ruleset version. Modifying a version (via new version creation) does not affect past evaluations.
- **Account status:** SUSPENDED/INACTIVE traders cannot access admin endpoints.
- **Rate limiting:** In-memory rate limiting applies to product listing.

## Known Limitations

1. **No checkout/payment** — Products have pricing but no payment processing. Registration does not assign a product.
2. **Product ruleset association** — A product links to a ruleset, but the relationship is not enforced at the database level beyond a foreign key.
3. **No product assignment** — Traders are not yet assigned to products during registration.
4. **Ruleset publishing** — Publishing does not automatically archive other versions. Manual archiving is required.
5. **Admin UI** — Admin interfaces are basic forms. Full CRUD interfaces will be built in later phases.

## Future Integration Requirements

1. **Payment processing** — Integrate crypto payment workflow for product purchase
2. **Product assignment** — Link trader registration to a selected product
3. **Ruleset evaluation engine** — Link ruleset rules to evaluation results
4. **Automated version lifecycle** — Auto-archive old versions when new ones are published
5. **Product-specific rulesets** — Enforce one ruleset per product or allow multiple
6. **Admin notifications** — Notify admins of pending approvals or status changes
7. **Audit logging** — Extend AuditLog entries for all product/ruleset mutations (partially implemented)

## Block 2 implementation update — 2026-10-13

The schema and APIs now represent product category, evaluation structure, lifecycle status, separate price/account-denomination currencies, ordered product stages, explicit rule disposition and calculation metadata, and a product/order-item terms snapshot. Product publication requires complete terms and published stage versions; ruleset publication is draft-only and validates rule fields. The public product API only returns active configurations that pass validation. No records were seeded or queried, so this document does not assert any live product values. Existing products will be DRAFT after the unapplied migration and require review.

The implementation does not make the evaluator correct merely by storing calculation definitions. Current MIN_TRADES, MAX_DAILY_LOSS, TRADING_SESSION, and TRADING_HOURS behavior blocks activation pending fixes and regression coverage. Direct Funded has no evaluation stage but remains unpublished until post-activation policy and fulfillment exist. Admin APIs cover more operations than the current UI exposes. See [docs/block-2-product-foundation.md](block-2-product-foundation.md) for the compatibility matrix, validation, and remaining decisions.
