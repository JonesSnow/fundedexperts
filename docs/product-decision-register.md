# Funded Experts Product Decision Register

**Prepared:** 2026-10-13
**Status:** Decisions below are unresolved unless explicitly marked as configured source data. This register does not create customer terms.

## Evidence and publication rule

Static inspection covered `prisma/schema.prisma`, `docs/products-and-rulesets.md`, `docs/commercial-domain-design.md`, `app/api/products/route.ts`, `app/api/rulesets/route.ts`, the published-rules API, and the current public UI. The active catalog is database-backed, so this review did not connect to it. Exact current active products, denominations, prices, and published rule values cannot be confirmed without an independently approved read-only target.

The `Product` model stores name, nullable description, nullable account size, nullable price, currency, optional ruleset relation, `settings` JSON and display order. The public product API returns name, description, account size, price, currency, active state, display order, and ruleset name. It does not return `settings`, a product category, phase structure, account-size currency, or an exact ruleset version. The `RuleType` enum includes profit target, drawdown limit, daily loss, minimum trades, maximum open trades, maximum leverage, trading session and trading hours. It has no dedicated minimum trading days, news, weekend, strategy, consistency, KYC, payout or refund types.

A visible value from an active published ruleset is classified as **configured rule data**. It is not evidence that the evaluation engine enforces it correctly. A missing term is **awaiting owner confirmation**. Competitor policies appear only in `docs/competitor-policy-research.md` and are not Funded Experts terms.

## Product and offer decisions

| Decision required | Affected products / stages | Source inspected | Why it matters | Evidence-based proposal | Approval before publication | Affected surfaces / APIs |
|---|---|---|---|---|---|---|
| Confirm the four product category names and add an authoritative product-type mapping. | Beginner, Pro, Expert, Direct Funded; all sizes | Product brief; product docs list Beginner, Pro, Experts, Direct Funded; Prisma `Product` has no category field | Current UI can only match category names in product text; a name match is not a stable product identity. | Add an approved product taxonomy in the product source of truth in a later product/schema/API task; retain unclassified products until then. | Yes | Catalog, pricing, home comparison, rules applicability; product API/schema |
| Confirm exact active denominations for every category. | All categories | Prompt's proposed ladder is not represented as database seed/configuration; runtime records not queried | Visitors need to know which sizes are real offers and the account inventory must support them. | Draft ladder for owner review only: Beginner $5K/$10K/$25K/$50K/$60K; Pro $10K/$25K/$50K/$60K; Expert $10K/$25K/$50K/$100K; Direct Funded $10K/$25K/$50K/$100K. These are not current offers. | Yes | Product admin/API, catalog, pricing, inventory/allocation |
| Confirm exact per-product price, price currency, account-size denomination currency, taxes, fees and any add-ons. | Every category, size and stage | `Product.price`, `Product.currency`, `Product.accountSize`; public product API; no runtime records inspected | Wrong currency or missing fees can misstate amount charged and simulated balance. | Publish the stored configured price and currency only after the owner confirms each active offer; separately define size denomination and tax/fee disclosure. | Yes | Product admin/API, pricing, order review, payment integration |
| Confirm Beginner's 3-step versus 4-step availability and the mapping of each product to each phase. | Beginner, each size and each phase | Product brief permits 3 or 4 steps; schema has no stage model; public endpoint returns no settings | Stage labels, target display and transition instructions depend on the exact product. | Treat each distinct configured product separately; do not combine products solely by category. | Yes | Product source of truth, catalog, rules, evaluation lifecycle |
| Confirm the structure and eligibility of Pro, Expert and Direct Funded offers. | Pro, Expert, Direct Funded, all stages | Product brief gives intended 2-step, 1-step and no-evaluation models; API does not expose stage fields | A one-step or direct path must not imply no constraints, instant account allocation or live capital. | Keep model descriptions marked as brief concepts until each active product and ruleset supplies its own terms. | Yes | Catalog, pricing, home, how-it-works, order/activation |
| Confirm exact targets, measurement baseline, measurement time, stage completion and progression conditions. | Every evaluation product and phase | `PROFIT_TARGET` can store a value but its calculation semantics are not encoded in the public API | A target alone may not prove a pass or progression. | Define target basis and a complete transition matrix per product/stage, then align enforcement before representing outcomes as reliable. | Yes | Rules, catalog details, evaluation API/engine, dashboard |

## Risk, trading and account policies

| Decision required | Affected products / stages | Source inspected | Why it matters | Evidence-based proposal | Approval before publication | Affected surfaces / APIs |
|---|---|---|---|---|---|---|
| Define daily-loss baseline, time zone, rollover, realized/floating P&L, fees/commission/swap treatment and breach timing. | Every product/stage with daily loss | `MAX_DAILY_LOSS` type; `docs/phase29-financial-rules.md`; evaluation audit findings | The number is not meaningful without the calculation and time boundary; the current evaluator has known correctness gaps. | Approve an explicit formula, timezone/DST policy, examples, stale-data behavior and test vectors before advertising enforceable limits. | Yes | Rules, product details, rule engine, monitoring and dashboard |
| Define maximum-loss/drawdown model, balance/equity basis, reference point and update timing. | Every product/stage with drawdown | `DRAWDOWN_LIMIT` type; current rule engine/monitoring audit | Static and trailing limits have materially different outcomes; current source has peak/reference calculation concerns. | Choose and version the exact model per product and stage; validate implementation independently before customer pass/fail use. | Yes | Rules, product configuration, evaluator/monitoring |
| Define minimum trade count, minimum trading days, day boundaries, completed-trade definition and inactivity policy. | Every evaluation phase and any simulated funded status | `MIN_TRADES` exists; no dedicated `MIN_TRADING_DAYS` enum/config contract | The existing minimum-trade evaluator can fail before a period completes; minimum trading days are not modeled as a dedicated rule type. | Specify each requirement separately and distinguish incomplete from failed; do not borrow a competitor minimum. | Yes | Rules, FAQ, evaluator, account status/dashboard |
| Define consistency, daily concentration, position risk, exposure, correlated positions and maximum-open-risk policy. | Evaluation and any simulated funded status | `MAX_OPEN_TRADES` exists; other rule types absent | These policies affect permission to trade and payout eligibility. | Publish only formulas explicitly approved and supported by rule configuration/enforcement. | Yes | Rules, account/risk monitoring, payout if in scope |
| Define news, high-impact calendar, event windows, instrument scope, opening/closing/holding treatment and consequence. | Each product and lifecycle state | No dedicated policy rule type; current config not queried | Different treatment between evaluation and later states can alter economics and breach risk. | Choose per product/state and identify calendar source/timezone; otherwise state “awaiting confirmation.” | Yes | Rules, FAQ, monitoring/evaluator |
| Define overnight, weekend, market-close, market-open and instrument-specific holding rules. | Each product/stage | No dedicated holding-policy rule type | Customers need to know whether open positions are allowed and how gaps are treated. | Decide per product; include exceptions and outage/market closure treatment. | Yes | Rules, catalog details, FAQ, monitoring |
| Define policies for copy trading, EAs/automation, HFT, latency/arbitrage, grid, martingale, hedging, signals, third-party trading, account/device sharing and feed-error exploitation. | All products or explicit exceptions | No complete approved policy in product schema/public rules | Ambiguous enforcement can lead to inconsistent account decisions and disputes. | Product/legal review should define allowed, restricted and prohibited behavior, evidence, notice and appeal; competitor policy is reference only. | Yes | Rules, terms, onboarding, monitoring/manual review |
| Define supported instruments, platform, leverage, contract size, spread/commission/swap and execution environment. | Each account size/platform | `MAX_LEVERAGE`, `TRADING_SESSION`, `TRADING_HOURS`; no instruments or execution model field | Users cannot accurately assess trade constraints or costs without them. | Publish only settings verified for the actual platform/account configuration; do not imply a broker or execution guarantee. | Yes | Catalog, rules, dashboard/account access, MT5 integration |
| Define identity/KYC, age/jurisdiction eligibility, account ownership, multiple-account, IP/device, verification timing and data retention. | Registration, order, evaluation and progression | Email-verification routes exist; no customer KYC process confirmed | Identity review can block purchase/progression and affects personal data handling. | Distinguish email verification from identity verification; obtain privacy/legal review before collecting documents. | Yes | Registration, account access, policies, admin review |
| Define breach, warning, suspension, termination, stale monitoring, manual review, dispute/appeal, support contact and response process. | All account lifecycle states | Status enums/routes exist; no verified appeal/support workflow | Customers need a clear route for incorrect or unavailable rule results. | Establish a human review and incident process before promising reversibility or support response. | Yes | Rules, FAQ, dashboard, support operations |

## Payments, resets, payouts and legal decisions

| Decision required | Affected products / stages | Source inspected | Why it matters | Evidence-based proposal | Approval before publication | Affected surfaces / APIs |
|---|---|---|---|---|---|---|
| Select payment provider, supported payment methods/currencies, settlement evidence, refunds, chargebacks and reconciliation policy. | Checkout/order/payment | Order API creates records; audit found client-simulatable paid transition and no verified signed provider callback | A pending order cannot be represented as paid; customer money and entitlements require independent provider evidence. | Select a provider and design replay-safe verified settlement and reconciliation before enabling paid launch. | Yes | Pricing/catalog, order API, payment, ledger, operations |
| Define reset/retry eligibility, number of attempts, price, timing, failed-stage behavior and cancellation. | Each challenge/product/status | No approved customer reset policy found | Changes fee and customer entitlement after failure. | No reset action or price until approved and implemented. | Yes | Pricing, FAQ, account dashboard, order/evaluation APIs |
| Decide whether rewards/payouts are part of the product at all; if yes define eligibility, split, frequency, minimums, methods, review, tax, and disputes. | Direct Funded and post-evaluation states | No payout model or customer/admin payout API found; email templates alone are not a payout workflow | Payout claims create a financial obligation and expectations. | Exclude payout claims until scope, terms, provider and operational process are approved and implemented. | Yes | Website, ledger, payout API, reconciliation, policies |
| Approve terms of service, privacy notice, simulated-trading/risk disclosure, refund/cancellation policy and support contact. | All public and authenticated journeys | Customer-facing legal/support pages are absent; repo copy is not a professional legal review | Required customer disclosures and data handling cannot be inferred. | Obtain named owner/legal review; publication register currently marks these missing or pending. | Yes | Footer, policies page, registration, checkout, account data |

## Publication gate

A proposal may move to a public “configured” label only after the product owner approves it, the product/rules source of truth contains the exact value and applicability, the public API exposes the required fields, and the implementation enforces the published semantics with appropriate regression coverage. Runtime catalog contents and customer account records were not inspected for this register.

## Block 2 implementation update — 2026-10-13

Structured product fields, product stages, ruleset-version associations, explicit rule disposition/calculation metadata, public filtering, and order snapshots are implemented in code. No approved product, denomination, price, or rule matrix was supplied or seeded. The publication gate remains closed because evaluator readiness is not certified. Confirmed runtime gaps that block affected products include premature MIN_TRADES failure, incorrect MAX_DAILY_LOSS sign/basis handling, unconditional TRADING_SESSION pass, and incomplete TRADING_HOURS timezone/trade-time handling. Direct Funded remains unavailable until a separate operating policy and fulfillment flow are approved and implemented. See [docs/block-2-product-foundation.md](block-2-product-foundation.md) for the route/model map, test limits, and follow-up requirements. No database was queried or modified.

## Master implementation specification alignment — 2026-10-20

The owner-supplied **Funded Experts — Master Implementation Specification and Execution Prompt** is the current business and product requirements source for future work. It directs continued development of this existing application, requires existing work to be preserved, and prohibits treating pages or mocked tests as proof that a workflow is production-ready. This register remains the in-repository decision record. Where earlier business proposals conflict, retain the conflict as unresolved; do not infer approval from source-code values.

The specification's project metadata names `D:\fundedexperts`, while the owner has designated the active project as `C:\FundedExperts\app`. This update applies to the active repository only.

### Planned offer matrix and historical commercial proposals

The specification lists these planned sizes:

| Product variant | Planned account sizes | Offer count |
|---|---|---:|
| Beginner 3-Step | $5,000, $10,000, $25,000, $50,000, $60,000 | 5 |
| Beginner 4-Step | $5,000, $10,000, $25,000, $50,000, $60,000 | 5 |
| Pro 2-Step | $10,000, $25,000, $50,000, $60,000 | 4 |
| Expert 1-Step | $10,000, $25,000, $50,000, $100,000 | 4 |
| Instant / Direct | $10,000, $25,000, $50,000, $100,000 | 4 |
| **Total if both Beginner variants are offered** |  | **22** |

The same specification also calls this a planned 17-offer matrix. Its five listed variant counts sum to 22; 17 is the total only if one of the two Beginner variants is excluded. The owner must decide whether both Beginner variants are intended. Do not remove an offer or create records to force either count. The pricing proposal contains one Beginner ladder, so whether it applies to both Beginner variants or only one is also unresolved.

Every value below is a **historical proposal, not an approved customer term**:

| Category | Proposed price ladder (USD) | Proposed evaluation targets | Proposed risk baseline |
|---|---|---|---|
| Beginner 3-Step | $5,000: $7; $10,000: $12; $25,000: $19; $50,000: $29; $60,000: $35 | Stage 1: 5%; Stage 2: 4%; Stage 3: 3% | Daily loss 5%; maximum loss 10%, static |
| Beginner 4-Step | Same ladder proposed for both Beginner variants; whether intended remains unresolved | Stage 1: 5%; Stage 2: 4%; Stage 3: 3%; Stage 4: 2% | Daily loss 5%; maximum loss 10%, static |
| Pro 2-Step | $10,000: $19; $25,000: $35; $50,000: $55; $60,000: $65 | Stage 1: 8%; Stage 2: 5% | Daily loss 5%; maximum loss 10%, static |
| Expert 1-Step | $10,000: $29; $25,000: $49; $50,000: $79; $100,000: $129 | Stage 1: 10% | Daily loss 4%; maximum loss 8%, trailing |
| Instant / Direct | $10,000: $49; $25,000: $89; $50,000: $149; $100,000: $249 | No conventional evaluation target | Daily loss 3%; maximum loss 6%, trailing |

The specification additionally records 1:100 leverage as a working baseline. These target and loss numbers do not define their calculation bases, trading-day boundaries, floating-PnL treatment, fees, commissions, swaps, breach comparisons, stale-data behavior or complete pass conditions. “Static” and “trailing” are not sufficiently precise formulas. Do not publish or enforce them as final commercial semantics until those definitions and evaluator behavior are approved and verified.

### Profit share, payout and remaining commercial decisions

The specification explicitly records conflicting historical profit-share proposals: Beginner 80%, Pro 85%, Expert 90%, Instant / Direct 80%; a general 80/20 arrangement; a 70% Instant share; and selected premium offers up to 100%. No option is approved by this register. A separate 14-calendar-day funded-stage waiting period and $50 minimum eligible net profit are also historical payout proposals only.

The following remain unresolved or require independent technical/operational verification before publication or launch:

- Whether the two Beginner variants are both offered and the final offer count.
- Prices, currency, taxes/fees, and the product/variant mapping for every price.
- Approved target bases and exact daily/static/trailing risk formulas.
- Minimum trading days (three days per stage was proposed), its definition and outage/late-data treatment; no maximum evaluation duration was proposed.
- Profit-share policy, eligible profit definition, payout eligibility, timing, minimum, and payout execution/reconciliation.
- Supported crypto payment provider, assets/networks, confirmation thresholds, refunds and reconciliation.
- Broker capability and actual MT5 demo-account connectivity; XM is only a candidate.
- Customer eligibility, legal terms, refund/cancellation policy, support/appeals process, and deployment/database readiness.

No database, product record, payment provider, broker, or production service was accessed or changed while aligning this register. All proposals remain draft-only; the existing publication gate remains closed.

### Source-status verification — 2026-10-20

The older 2026-10-13 implementation notes above are historical snapshots. A read-only check of the current schema, rule engine, capability registry, and database-free evaluator tests found these later changes:

| Area | Current source evidence | Current limitation |
|---|---|---|
| Product and stage model | `Product` now has category, evaluation structure, separate price and account-denomination currencies, status, ordered `ProductStage` mappings, and versioned ruleset relations in `prisma/schema.prisma`. | Live products, prices, and stages remain unverified because the database target has not been approved for inspection; the reported missing `ProductStage` table remains an external schema/deployment blocker. |
| Minimum-trade outcomes | `MIN_TRADES` and `MIN_TRADING_DAYS` are represented in the Prisma enum. The pure evaluator returns `INCOMPLETE` below a minimum, requires complete uniquely identified history, and has regression tests for duplicate snapshots and day-boundary counting. | The live MT5 adapter does not provide a complete, uniquely identified event history; both rule types remain unsupported by the publication capability registry. No customer offer is certified by the unit tests. |
| Daily loss | The evaluator now consumes explicit PnL components, an IANA timezone and reset time, a matching period start, source freshness, and an explicit comparison policy. | The production adapter does not supply verified components and a verified daily period, and business owners have not approved the exact formula/reset terms. Publication capability remains disabled. |
| Drawdown | The evaluator supports explicit static-starting-equity and trailing-peak methods, and fails closed when the reference history is unavailable. | The registry only permits static drawdown and the live product publication route has no approved evaluator allowlist. Trailing drawdown and customer-facing enforcement remain uncertified. |
| Trading hours and session | Trading-hours calculation checks individual event timestamps in the configured IANA timezone. `TRADING_SESSION` checks configured allowed symbols; it is not a general market-session policy. | The live adapter does not establish a complete verified activity-event window. Both capabilities remain unsupported for publication; rules for sessions, instruments, and event windows still need owner approval. |
| Profit target | The pure calculation combines realized and floating PnL only when complete history and position data are present. | Commission, swap, fee, lifecycle, and live-adapter semantics are not fully certified; this rule remains unsupported for product publication. |
| Evaluation activation integrity | `activatePaidOrder` runs evaluation creation, matching-account reservation, assignment, account status, initial rule records, and audit writes inside one repository transaction; per-order and per-trader advisory locks and `FOR UPDATE SKIP LOCKED` protect competing activation requests. | Database-free mocked tests cover retries, concurrency, inventory failure, and rollback. This does not prove production database behavior, and activation remains dependent on verified payment evidence, a migrated schema, compatible inventory, and a verified database target. |

This source review did not access a database, run a migration, verify live catalog records, or exercise the MT5 integration. The reported `ProductStage` availability and all customer-facing commercial terms therefore remain unresolved.

### Read-only Neon branch check — 2026-10-20

The Neon console view for the Funded Experts project showed the selected `production` branch marked as the default, with one row visible in the branch table. This view does not prove that no separate development branch exists, and it was not compared with the application's configured database target. No branch was switched, created, or modified; no database connection or query, migration, or write was performed. The exact development target and its isolation from production remain unverified.
