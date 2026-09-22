# Products and Rulesets

**Last Updated:** 2026-09-20

## Product Catalog

Products represent funded account packages offered to traders.

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

### Products

| Name | Type |
|---|---|
| Beginner | Entry-level challenge |
| Pro | Intermediate challenge |
| Experts | Advanced challenge |
| Direct Funded | Direct funded account |

**Note:** Product entries are created and managed through the admin panel. The catalog page displays active products.

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
