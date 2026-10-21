# Block 2 — Product Catalog, Pricing and Rules Foundation

**Review date:** 2026-10-13
**Status:** Technical groundwork implemented; live offers remain blocked pending policy approval and evaluator remediation.

## Executive status

The code now has a structured product identity, product lifecycle, stage-to-ruleset-version links, explicit rule disposition and calculation-definition fields, server-resolved order pricing, and an order-item terms snapshot. Admin draft workflows and public website consumers use those structures. No product catalog entries or prices were invented or seeded.

This is not a launch-ready product catalog. No runtime database records were inspected. The migration has not been applied. Publication currently fails closed because the product validator has no evaluator rule types certified by default. That is appropriate given the enforcement gaps below, but it means no product can presently become a verified live offer through these routes. Direct Funded also remains blocked because its fulfillment path is not implemented.

## Files changed for this batch

This list covers Block 2 implementation/report changes and excludes inherited F-01, website-redesign, and other dirty work that was already present:

- `prisma/schema.prisma`; `prisma/migrations/20261013000000_product_domain_foundation/migration.sql`
- `lib/product-domain.ts`; `lib/order-validation.ts`; `lib/allocation.ts`; `lib/product-experience.ts`; `tests/product-domain.test.ts`
- `app/api/products/route.ts`; `app/api/products/[id]/route.ts`; `app/api/products/[id]/publish/route.ts`; `app/api/products/[id]/status/route.ts`; `app/api/products/[id]/stages/route.ts`; `app/api/products/[id]/stages/[stageId]/route.ts`
- `app/api/admin/products/route.ts`; `app/api/admin/rulesets/route.ts`
- `app/api/rulesets/route.ts`; `app/api/rulesets/[id]/route.ts`; `app/api/rulesets/[id]/versions/route.ts`; `app/api/rulesets/[id]/versions/[version]/route.ts`; `app/api/rulesets/[id]/versions/[version]/publish/route.ts`; `app/api/rulesets/[id]/versions/[version]/rules/route.ts`; `app/api/rulesets/[id]/versions/[version]/rules/[ruleId]/route.ts`
- `app/api/orders/route.ts`; `app/api/orders/[id]/route.ts`; `app/api/orders/[id]/activate-evaluation/route.ts`
- `app/admin/page.tsx`; `app/admin/products/page.tsx`; `app/admin/products/new/page.tsx`; `app/admin/rulesets/page.tsx`
- `components/product-showcase.tsx`; `components/account-size-explorer.tsx`; `components/home-catalog-context.tsx`
- `app/page.tsx`; `app/catalog/page.tsx`; `app/pricing/page.tsx`; `app/rules/page.tsx`; `app/how-it-works/page.tsx`; `app/faq/page.tsx`
- `docs/block-2-product-foundation.md`; `docs/master-project-audit.md`; `docs/product-decision-register.md`; `docs/known-limitations.md`; `docs/architecture.md`; `docs/products-and-rulesets.md`

## Canonical model and dependency map

| Link | Implementation status | Evidence / limit |
|---|---|---|
| Product identity and terms | Implemented in schema and draft APIs | `Product` now carries a stable optional code, category, evaluation structure, status, account size, price currency, and account-denomination currency. Code, positive size/price, and valid currencies are publication requirements. |
| Product → stages | Implemented | `ProductStage` gives each evaluation stage a stable key/order and a `RulesetVersion` reference. Unique constraints protect per-product stage keys and positions. |
| Stage → ruleset version → rules | Implemented with a publication gate | Rule values, disposition, and calculation JSON are validated; published versions are read-only through the new mutation routes. No quantitative rule type is enabled by default. |
| Public APIs → website | Implemented in code; live behavior unverified | The catalog endpoint filters to active products and filters out any product that fails publication validation. Home, catalog, pricing, rules, how-it-works, and FAQ consumers use structured API data and no longer infer product structure from marketing names. No database-backed browser check was run. |
| Product → order | Implemented in code; not route-tested | The order API resolves product terms server-side, rejects browser-supplied price/category/size/rules/stage-version values, uses Prisma Decimal arithmetic, and stores a product snapshot on `OrderItem`. New orders remain `PENDING_PAYMENT`. |
| Order snapshot → evaluation | Partially implemented | Activation checks the order-item snapshot and ties the evaluation to its product stage and ruleset version. Legacy orders without the new snapshot are rejected for admin review. No mocked route contract test was added. |
| Evaluation → account allocation | Compatibility adjustment only; not runtime-verified | The activation path supplies the snapshot account size as both a minimum and maximum to allocation. No allocation was invoked. The existing allocation path remains a production integration risk until isolated tests cover size matching, concurrency, and rollback. |
| Admin create/edit/validate/publish/retire | Partially implemented | Server routes require an active ADMIN and log mutations. Draft metadata, stage creation/removal, ruleset versions, rule create/update/delete endpoints, publish, pause, and retire are available. The UI does not yet expose every backend edit operation (including stage/rule editing); Direct Funded configuration is unavailable. |

The existing generic `Product.rulesetId` relation remains for compatibility. New staged products use `ProductStage.rulesetVersionId` as their order/evaluation source of truth. The legacy relation is still returned by the admin products API and accepted by draft APIs, so operators must not treat it as equivalent to the stage-version mapping. A follow-up should either retire it safely or define and enforce its relationship to the staged mapping.

## Configured products, prices and migration

- No products, denominations, prices, rules, or seed data were created by this batch. The exact live catalog remains unknown because no database was queried.
- The brief's proposed size ladders and indicative prices remain proposals. They are not represented as live offers.
- Price and size are persisted as Prisma `Decimal`; price currency and simulated-account denomination currency are separate fields. No conversion, tax, fee, or discount policy was invented.
- Missing or zero price fails product validation and order creation. Order totals use the server-side product price; coupon percentage arithmetic uses `Prisma.Decimal` and rounds to two decimal places.
- The migration adds the structured fields, `ProductStage`, rule disposition/calculation fields, order snapshots, and evaluation stage/order references. Existing products receive status `DRAFT` from the database default when the migration is eventually applied; they will not remain automatically purchasable and require explicit review and publication.
- Existing `Rule.isRequired` values are mapped to `REQUIRED` or `OPTIONAL` in the migration. No runtime migration or data update was run. Existing order items receive a nullable snapshot field; the new activation route refuses to infer historical terms where the snapshot is absent.

## Rules coverage and evaluator traceability

The new schema can store explicit `REQUIRED`, `OPTIONAL`, and `UNRESOLVED` disposition. Unresolved required decisions and evaluator types not explicitly certified prevent publication. The `calculation` definition is stored and validated, but the existing evaluator consumes legacy `Rule.value` fields and does not execute the new calculation contract. A stored definition therefore does not prove enforcement.

| Rule | Existing runtime path and inputs | Test evidence inspected | Status for product publication |
|---|---|---|---|
| Profit target | `evaluateProfitTarget` in `lib/rule-engine.ts`; configured target and monitoring snapshot | Existing monitoring tests exist; no route/product integration test run | Present, but approved target formula and lifecycle linkage are not verified; blocked by default. |
| Drawdown limit | `evaluateDrawdownLimit`; snapshot balance/equity and configured maximum | Existing monitoring tests exercise basic threshold outcomes; they do not establish the approved peak/reference model | Partial; calculation JSON is not consumed and semantics remain unresolved; blocked. |
| Minimum trades | `evaluateMinTrades`; history deal count plus currently open positions | Existing tests cover basic threshold behavior | Defect confirmed in current code: below-minimum returns `FAIL` immediately, even while an evaluation could still be in progress. Must distinguish incomplete from failed; blocked. |
| Maximum daily loss | `evaluateMaxDailyLoss`; `historySummary.totalRealizedPnl` | Existing tests cover threshold outcomes, not full accounting semantics | Defect confirmed: it treats positive realized PnL as a positive loss amount and compares it to the loss ceiling; floating PnL, explicit fees/swap inclusion, and an approved daily reset boundary are not applied here. Blocked. |
| Trading hours | `evaluateTradingHours`; monitoring snapshot timestamp and rule-value hours/timezone | Existing monitoring tests are not a product-contract proof | Partial: checks snapshot time rather than each trade time. It recognizes fixed numeric offsets; an IANA zone falls back to UTC in the evaluator. Blocked. |
| Trading session | `evaluateTradingSession`; `sessionRules`/`allowedSymbols` and open positions | Existing tests do not establish session enforcement | Defect confirmed: when either setting exists, the evaluator returns `PASS` without checking whether the positions comply. Blocked. |
| Maximum open trades | `evaluateMaxOpenTrades`; count of open positions | Existing monitoring tests exercise simple counts | Basic evaluator exists; exact product semantics and end-to-end inputs remain unverified; blocked by default. |
| Maximum leverage | `evaluateMaxLeverage`; provider-supplied leverage in snapshot | Existing monitoring tests exercise basic outcomes | Basic evaluator exists; provider freshness and unavailable-data behavior are not verified for products; blocked by default. |
| Minimum trading days, consistency, news/holding/strategy restrictions, instruments and payout terms | No corresponding complete rule contract was identified in the product schema/evaluator set | No applicable isolated tests | Not implemented or awaiting owner decision; cannot be represented as active terms. |

The runtime publication routes call the validator with its default empty evaluator allowlist. Passing a rule type into the pure helper is only a test mechanism; no production route certifies a type. This guard must remain closed until owner-approved semantics and evaluator regression coverage exist.

## API, financial integrity and lifecycle limits

- Product and ruleset mutations are server-side ADMIN-only, validate inputs, and write audit records in the relevant transaction. Draft-only checks protect the new stage/rule mutation paths; published rule versions cannot be changed through those routes.
- Product status changes are explicit: active offers can be paused or retired; publication requires complete terms and compatible stage counts. Direct Funded requires a separate operating ruleset and still fails publication because fulfillment is missing.
- Order creation snapshots price, currency, category, structure, size, denomination currency, stage/version IDs, rule dispositions/values/calculations, and any operating rules. It does not mark an order paid or perform payment settlement.
- Cross-customer reuse of an idempotency key returns a generic conflict. The unique database constraint remains the final duplicate guard; concurrency behavior was not route-tested.
- The evaluation activation route now validates the snapshot against the product/order/ruleset identity and links the evaluation to the recorded stage. It may continue into the pre-existing allocation path after validation. No route was invoked and no account was allocated.
- The activation path still creates the `IN_PROGRESS` evaluation and audit entry before account allocation completes. If inventory allocation fails, the endpoint returns an error while the evaluation remains in progress without an account; retries can revisit that partial state. The transition is not atomic and needs an isolated mocked/concurrency test plus a lifecycle-safe correction before activation.
- Activation loads the current rules from the referenced published database version when creating `RuleEvaluation` rows; it does not compare those rule values to the order snapshot. Normal API routes block published-version edits, but there is no database-level immutability enforcement, so out-of-band changes could make a historical order's snapshot disagree with the evaluation's instantiated rules.
- The JSON snapshot is protected by application write paths, not a database immutability trigger. No endpoint in the new workflow edits it, but database-level immutability is not established.
- Admin stage update and rule update endpoints exist, but the current admin screens do not expose all of them. Admin publication and draft flows were typechecked/built, not exercised against mocked HTTP or a database.

## Product-owner decisions still required

Approval is required for exact active product combinations and denominations, exact per-product prices/currencies, Beginner three-step versus four-step availability, every stage target and measurement formula, daily rollover/timezone and included PnL components, drawdown basis/reference, activity and consistency requirements, trading strategy and holding policies, permitted instruments/leverage, account verification and suspension/appeal terms, refund/reset terms, and whether/how payouts exist. Competitor research was not performed in this batch; competitor references remain non-binding.

## Validation and safety

| Check | Result |
|---|---|
| `pnpm exec tsc --noEmit --incremental false` | Passed. |
| `pnpm exec tsx tests/product-domain.test.ts` | Passed: 12 tests, 0 failures. These are pure validation/snapshot tests; they do not exercise route handlers or prove database behavior. |
| Targeted ESLint over the changed product, ruleset, order, admin, and website files | Passed with no diagnostics after removing unused parameters/imports and restructuring the ruleset page's initial fetch. |
| `pnpm exec next build` | Passed. Next reported static pages and dynamic API routes; the existing middleware-convention deprecation warning remains. The command bypassed the package `build` script's Prisma generation step. Next reported `.env.local` loaded automatically; its values were not inspected or printed, and no database route was executed. |
| `pnpm exec prisma format` | Passed earlier in this batch. |
| `pnpm exec prisma validate` | Blocked because `DATABASE_URL` was absent. No value was substituted or displayed. |
| `pnpm exec prisma generate` | Failed with a Windows `EPERM` while renaming the generated query-engine DLL; this is a local generation/file-lock issue, not a database check. TypeScript and the standalone Next build passed afterward. |
| `git status`, `git diff`, `git diff --check` | Git identifies `main` and the expected HEAD, and `git ls-files --modified/--others` lists dirty files; status/diff commands fail with “this operation must be run in a work tree.” No reset, clean, stash, discard, or overwrite was used. |
| Database safety | No database connection/query, migration, seed, reset, cleanup, deletion, or write occurred. No database-backed test suite ran. No payment, email delivery, or broker operation was triggered. |

## Prioritized follow-up

| Stage | Work | Effort | Dependencies |
|---|---|---|---|
| P0 | Correct daily-loss, trading-session, minimum-trade lifecycle, and trading-hour calculations before certifying any affected rule. | L | Owner-approved formula/timezone/data-freshness decisions; isolated regression fixtures. |
| P1 | Add mocked route/contract tests for ADMIN authorization, draft immutability, public filtering, order ownership/idempotency, snapshot integrity, and activation size/stage compatibility. | L | Mockable Prisma/auth/email boundaries; no live database required. |
| P1 | Complete evaluator-to-product/ruleset end-to-end traces and determine required rule-type allowlist from measured enforcement, not UI configuration. | M | P0 fixes and approved terms. |
| P2 | Resolve legacy `Product.rulesetId` semantics and expose stage/rule editing in the admin workflow; add Direct Funded fulfillment only after its product/operating decisions are approved. | M–L | Data compatibility review and product-owner approval. |
| P2 | Review and validate the new migration against the approved disposable database before deployment; explicitly inventory products that will become drafts. | M | Independently verified disposable target and migration review; no migration was run here. |
| P3 | Expand monitoring freshness, outage behavior, concurrency and throughput tests; document recovery and operator procedures. | M | Safe test infrastructure and observability requirements. |

## Source-status refresh — 2026-10-20

The evaluator table above records the state observed during the 2026-10-13 Block 2 batch. It is not a description of the current rule-engine source. Read-only inspection of `prisma/schema.prisma`, `lib/rule-engine.ts`, `lib/evaluation-calculations.ts`, `lib/rule-capabilities.ts`, and the isolated tests shows subsequent corrections:

- `MIN_TRADES` below its threshold produces `INCOMPLETE` rather than `FAIL`; the Prisma `RuleType` now also includes `MIN_TRADING_DAYS`, with distinct-day calculation and tests.
- Daily loss uses explicitly configured net PnL components, the configured timezone/reset boundary, a matching data period, and freshness checks. It returns unavailable when required evidence is absent.
- Drawdown calculation consumes the configured static or trailing method and requires complete peak history for trailing mode.
- Trading-hours evaluation uses each activity event's timestamp and an IANA timezone. Trading-session evaluation checks configured allowed symbols rather than unconditionally passing.
- These pure functions do not make the live integration ready. `RULE_CAPABILITY_REGISTRY` still marks profit target, daily loss, minimum activity, trading hours, and trading session unsupported because the live adapter does not provide complete verified inputs. The product publication route remains closed by default.
- The earlier activation warning in the historical API/lifecycle section is also superseded: the current activation service runs evaluation, inventory reservation, assignment, account status, initial rule evaluations, and audit records in one transaction. Database-free mocked tests cover no-inventory/init-failure rollback, retry idempotency, and concurrent activation. This has not been verified against the database adapter or a real isolated database.

The associated isolated evaluator tests are run as part of this refresh. No database, migration, account inventory, payment provider, or external MT5 service was accessed. The earlier blocker concerning missing live `ProductStage` data remains unverified and is not resolved by these source-level corrections.

## Launch recommendation

**NO-GO for paid public launch or database-backed product activation.** The structured foundation compiles and builds, but there are no verified catalog values, the migration is unapplied, the evaluator has confirmed fail/pass correctness defects, route-level contracts are not covered by isolated mocks, Direct Funded fulfillment is absent, and commercial terms remain unapproved. Internal code review of the draft foundation is appropriate; activation must remain closed.
