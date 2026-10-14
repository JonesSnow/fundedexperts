# Master Scope Completion Matrix — 2026-10-14

This is the working checklist for the master brief supplied on 2026-10-14. It uses the source audit dated 2026-10-12 and current source inspection. “Implemented but not verified” means code exists but its runtime dependencies were intentionally not exercised. No database target was considered safe for connection.

## Public website

| Requirement | Status | Evidence and remaining work |
|---|---|---|
| Home header, navigation, hero, product showcase, process, features, rules/FAQ previews, disclosures, CTA, footer | PARTIALLY IMPLEMENTED | app/page.tsx, components/header.tsx, components/product-showcase.tsx, components/site-footer.tsx. Static review only; verify each section, links, responsive/keyboard behavior; avoid unsupported claims. |
| Pricing product comparison and authoritative terms | PARTIALLY IMPLEMENTED | app/pricing/page.tsx and components/product-showcase.tsx use configured product data. No database-backed catalog was read; active prices/rules are not verified. |
| Catalog discovery, terms, availability, loading/error/empty states | PARTIALLY IMPLEMENTED | app/catalog/page.tsx, app/api/products/route.ts. Product request creates a pending order only; no provider checkout or reliable allocation. Remove the purchasable action and label pending orders honestly. |
| Rules page: active published rules, calculations/timezone, fees, restrictions, lifecycle | PARTIALLY IMPLEMENTED | app/rules/page.tsx, app/api/rulesets/route.ts, lib/rule-engine.ts. Do not expose drafts; baseline F-06–F-09 remain rule-integrity blockers. |
| FAQ covers actual flows and unavailable product features | PARTIALLY IMPLEMENTED | app/faq/page.tsx. Verify answers against current auth/checkout/payout/support implementation; add clear unavailable statements. |
| Responsive/accessibility/browser validation | IMPLEMENTED BUT NOT VERIFIED | No browser, keyboard, reduced-motion, or screen-size walkthrough was run. |

## Authentication, OTP, and email

| Requirement | Status | Evidence and remaining work |
|---|---|---|
| Registration with verification OTP, resend cooldown, expired/invalid/reused handling | IMPLEMENTED BUT NOT VERIFIED | app/api/auth/register/route.ts, app/api/auth/verify-email/route.ts, app/api/auth/verify-email/confirm/route.ts, lib/auth/otp.ts, components/email-otp-verification.tsx. Helper tests pass; DB-backed route behavior and real delivery not tested. |
| Unverified/active/suspended login policy | PARTIALLY IMPLEMENTED | app/api/auth/login/route.ts. New unverified login is gated; account-state responses/session behavior need regression review. |
| Password recovery by OTP and one-time proof | IMPLEMENTED BUT NOT VERIFIED | app/api/auth/forgot-password/route.ts, app/api/auth/reset-password/verify/route.ts, app/api/auth/reset-password/route.ts, app/reset-password/page.tsx. DB concurrency and session invalidation need verification. |
| Email-change verification | NOT IMPLEMENTED | app/settings/page.tsx and app/api/auth/settings/route.ts have no verified pending-email lifecycle. Requires dedicated persistence and policy. |
| Session revocation on logout, password reset, suspension | NOT IMPLEMENTED | lib/auth/session.ts issues stateless JWTs. No durable session/version/revocation store is established. |
| Distributed throttling and abuse protection | PARTIALLY IMPLEMENTED | lib/auth/rate-limit.ts uses process-local state; does not coordinate multiple instances. |
| Gmail SMTP configuration/OTP templates/diagnostics | IMPLEMENTED BUT NOT VERIFIED | lib/email/config.ts, lib/email/provider.ts, lib/email/templates/*, lib/email/index.ts. Unit tests cover formatting/config only; no credential/connectivity/provider handoff test. |
| Delivery failures, retry, and observable truthful UI | PARTIALLY IMPLEMENTED | Registration/resend report failure; SMTP persistence/retries remain request-bound and database-dependent. No outbox worker. |

## Trader pages and flows

| Requirement | Status | Evidence and remaining work |
|---|---|---|
| Dashboard verified metrics, account/evaluation summaries, states | PARTIALLY IMPLEMENTED | app/dashboard/page.tsx and related APIs. No live data was checked; never fabricate metrics. Existing backend calculation/monitoring findings remain. |
| Accounts/evaluations list/detail/history and ownership | IMPLEMENTED BUT NOT VERIFIED | app/accounts/*, app/evaluations/* and API routes. No DB route tests or browser validation. |
| Orders/payment state and detail UX | PARTIALLY IMPLEMENTED | app/orders/*, app/api/orders/*. Orders can be created pending; checkout/provider is absent and simulated payment path remains a baseline blocker. |
| Settings profile/password/verification/email change | PARTIALLY IMPLEMENTED | app/settings/page.tsx and app/api/auth/settings/route.ts. Email change and durable session revocation are missing. |
| Notifications read/unread and navigation | IMPLEMENTED BUT NOT VERIFIED | app/notifications/page.tsx, app/api/notifications/*. No live API validation. |
| Payouts | NOT IMPLEMENTED end to end | app/payouts/page.tsx exists; baseline audit finds no payout lifecycle backend. UI must remain clearly unavailable. |
| Support | NOT IMPLEMENTED end to end | app/support/page.tsx exists; no verified ticket/submission backend identified. Do not simulate submission. |
| Loading, empty, errors, expired session, responsive/accessibility | IMPLEMENTED BUT NOT VERIFIED | Static page review only; no browser/API/database execution. |

## Admin and operational workflows

| Requirement | Status | Evidence and remaining work |
|---|---|---|
| Admin route coverage and role checks | PARTIALLY IMPLEMENTED | app/admin/* and app/api/admin/*; page/API ownership checks need route-by-route regression validation. |
| Search/filter/pagination/bounds | PARTIALLY IMPLEMENTED | Some client filters exist; baseline F-23 identifies unbounded APIs and missing indexes. |
| Safe account/evaluation status transitions | NOT VERIFIED; HIGH RISK | app/api/accounts/[id]/status/route.ts, app/api/admin/lifecycle/route.ts and assignment services. Baseline F-19 reports contradictory AVAILABLE state with an active assignment. |
| Product/ruleset management | PARTIALLY IMPLEMENTED | app/admin/products/*, app/admin/rulesets/* and APIs. Published-version immutability finding F-09 remains. |
| Orders/payment, MT5 inventory/monitoring, audit logs, users, payouts/support | PARTIALLY IMPLEMENTED or NOT IMPLEMENTED | Existing routes are inventoried in the audit follow-up; there is no verified provider checkout, full monitoring worker, payout, or support-ticket workflow. |

## Product, rules, and financial integrity

| Requirement | Status | Evidence and remaining work |
|---|---|---|
| Inventory authoritative Beginner/Pro/Expert/Instant Funded offers and terms | BLOCKED BY AN EXPLICIT SAFETY OR EXTERNAL DEPENDENCY | Product/rules are DB-configured. No DB access is allowed and product-owner proposals are not approved commercial terms. |
| Product-to-rules compatibility and purchase eligibility | PARTIALLY IMPLEMENTED | app/api/products/route.ts validates published product completeness; orders resolve product terms. Baseline F-04 and F-05 require safe lifecycle corrections. |
| Evaluation, profit target, daily/max drawdown, min days/trades, trading hours | NOT READY FOR PRODUCTION | lib/rule-engine.ts, lib/monitoring-pipeline.ts, lib/monitoring/normalize.ts. Baseline F-06–F-08 are high-severity defects; no financial logic edits are authorized in this batch without explicit product decisions. |
| Account inventory, allocation, funded lifecycle, idempotency | NOT READY FOR PRODUCTION | lib/allocation.ts, lib/activation.ts, app/api/funded-accounts/*. Baseline F-12, F-19–F-21 remain. |
| Payment, ledger, coupon reconciliation | NOT READY FOR PRODUCTION | app/api/orders/*, lib/mock-payment-provider.ts. No real provider/webhook; baseline F-02/F-03/F-13/F-22 remain. |
| MT5 credentials and live monitoring | NOT READY FOR PRODUCTION | lib/monitoring/* and admin MT5 APIs. Baseline F-10/F-11/F-24/F-26 remain; never test against a live broker. |

## Security, operations, cleanup, and validation

| Requirement | Status | Evidence and remaining work |
|---|---|---|
| Audit all security/business/DB findings and regression tests | PARTIALLY IMPLEMENTED | docs/full-project-audit-report.md enumerates 33 findings; this batch must fix only low-risk UI/API issues and leave high-risk domain changes blocked/decision-dependent. |
| Dark theme, consistent states, 3D accessibility/performance | PARTIALLY IMPLEMENTED | app/globals.css and shared components. Visual browser checks and reduced-motion/performance validation remain. |
| Remove provably unused files/dependencies only | NOT IMPLEMENTED | No deletion is justified from static references alone; do not remove framework routes, test guards, generated files, migrations, docs, or user work. |
| Environment-variable inventory by category, names only | PARTIALLY IMPLEMENTED | .env.example and source references. Build a complete static name/purpose/required-by-environment inventory; never inspect actual local environment files. |
| TypeScript, lint, tests, build, static consistency | PARTIALLY IMPLEMENTED | Prior known results: TypeScript and targeted lint pass; OTP unit tests pass. Build is constrained by earlier font-fetch and Windows .next permission errors plus Prisma generation in the build script. |
| Git diff/status and original audit preservation | BLOCKED BY AN EXPLICIT SAFETY OR EXTERNAL DEPENDENCY | Known worktree/ownership failure; do not bypass repository metadata checks. Original 2026-10-12 report remains preserved. |
| Public launch readiness | NOT READY | Payment, financial-rule, allocation, monitoring, and payout blockers are still present. |

## Work sequence

1. Make catalog/pricing/purchase availability honest and prevent unsupported checkout claims.
2. Review FAQ/rules/public exposure and fix safe read-only API disclosure defects.
3. Review trader page states and admin access/status UI without live calls.
4. Complete environment-variable inventory and route/page status details.
5. Revisit session/email-change/rate-limit architecture; implement only if it can be validated without DB access or unsafe schema/client changes.
6. Re-run safe unit tests, TypeScript, targeted lint, and static consistency checks; update the follow-up report with exact outcomes.

## Master-scope continuation — current source review

This addition records the continuation work performed after the first matrix draft. It does not replace the 2026-10-12 source audit or claim runtime verification. Browser flows and every API response remain unverified because invoking the application would issue database-backed requests.

### Public and authentication pages

| Route | Current implementation and data/API | Status | Remaining evidence or blocker |
|---|---|---|---|
| `/` | Header/footer, simulated-product disclosure, catalog preview via `GET /api/products`, rules/FAQ preview, lifecycle caveats, and CTA navigation. | IMPLEMENTED BUT NOT VERIFIED | Browser, responsive, keyboard, and API rendering not checked. Catalog requires active database records. |
| `/pricing` | Uses the same configured catalog API and displays product-model concepts separately from actual offers. | IMPLEMENTED BUT NOT VERIFIED | Current commercial terms cannot be verified without a safe DB snapshot and product-owner approval. |
| `/catalog` | Read-only configured product/rules display; purchase action is disabled with an explicit checkout/allocation explanation. | IMPLEMENTED BUT NOT VERIFIED | API is not called; direct order/payment APIs remain a separate backend risk and must not be mistaken for a checkout. |
| `/rules` | Shows active published ruleset data, search/filter, per-version values, and calculation definitions. | PARTIALLY IMPLEMENTED | Rule engine correctness, effective-date semantics, reset timezone, and product-specific financial calculations remain unresolved in F-06–F-09. |
| `/faq` | Static answers now include OTP verification, password reset, unavailable email changes, account status, and unavailable payment/payout/support flows. | IMPLEMENTED BUT NOT VERIFIED | Content is source-checked only; no browser/owner policy approval. |
| `/how-it-works` | Lifecycle steps distinguish available UI from unavailable/unverified checkout, account assignment, trading, and payouts. | IMPLEMENTED BUT NOT VERIFIED | Claims are based on source audit; deployment and live operations were not checked. |
| `/policies` | Publication register truthfully shows missing terms/privacy/refund/support policies. | IMPLEMENTED BUT NOT VERIFIED | Legal review and approved policy content remain external dependencies. |
| `/support` | Self-service resource links; explicitly says no ticket, contact, or appeal channel is configured. | IMPLEMENTED BUT NOT VERIFIED | A product owner must provide a verified contact and case workflow. |
| `/register`, `/login`, `/verify-email`, `/verify-email-pending`, `/forgot-password`, `/reset-password` | OTP-based source flows and UI were added in the preceding batch; helper-level tests only. | IMPLEMENTED BUT NOT VERIFIED | Database-backed route tests and real SMTP handoff are blocked by safety restrictions. |

### Trader pages

| Route | API/source relationship | Status | Remaining blocker |
|---|---|---|---|
| `/dashboard` | Trader order, evaluation, and funded-account APIs; financial values are not fabricated when unavailable. | IMPLEMENTED BUT NOT VERIFIED | No live API, DB, monitoring, or browser validation. |
| `/accounts`, `/accounts/[id]` | `/api/accounts` and `/api/accounts/[id]`; record ownership is enforced by backend paths reviewed in the prior batch. | IMPLEMENTED BUT NOT VERIFIED | Runtime ownership and state tests require a verified test DB. |
| `/evaluations`, `/evaluations/[id]` | `/api/evaluations` and `/api/evaluations/[id]`; state/progress is presented as recorded data. | IMPLEMENTED BUT NOT VERIFIED | Evaluation calculation correctness and runtime API behavior remain blocked by F-06–F-08. |
| `/orders`, `/orders/[id]` | `/api/orders` and `/api/orders/[id]`; payment and order states are separated. | PARTIALLY IMPLEMENTED | Provider checkout/confirmation, duplicate safety, ledger consistency, and activation are not launch-ready (F-02/F-03/F-13/F-22). |
| `/settings` | `/api/auth/settings` supports profile/password changes; verified-email status and OTP recovery link are shown. | PARTIALLY IMPLEMENTED | Email change and durable session revocation are absent; password/session lifecycle is not DB-verified. |
| `/notifications` | `/api/notifications` and `/api/notifications/[id]`; read state is API-backed. | IMPLEMENTED BUT NOT VERIFIED | Read/unread effects and associated navigation were not exercised against a safe DB. |
| `/payouts` | Static unavailable state; no payout API or payout model found. | BLOCKED BY AN EXPLICIT SAFETY OR EXTERNAL DEPENDENCY | Requires approved payout policy, ledger source, service/API, and external payment operations. |
| `/support` | Static self-service page; no ticket API or verified contact channel found. | BLOCKED BY AN EXPLICIT SAFETY OR EXTERNAL DEPENDENCY | Requires an owner-approved channel and support/appeal workflow. |

### Admin pages and API route inventory

| Admin route | Visible workflow | Status and blocker |
|---|---|---|
| `/admin` | Product/ruleset/customer lookup tabs and links into editors. | IMPLEMENTED BUT NOT VERIFIED; API and role behavior were not exercised. |
| `/admin/accounts` | Account list, search, add form, delete action with browser confirmation. | PARTIALLY IMPLEMENTED; delete can affect historical relationships, requires backend lifecycle review and safe test coverage. |
| `/admin/accounts/[id]` | Account detail with status and health mutations. | PARTIALLY IMPLEMENTED; F-19 active-assignment contradiction is unresolved and high risk. |
| `/admin/customers/[id]` | Customer lifecycle overview via admin lifecycle API. | IMPLEMENTED BUT NOT VERIFIED; no live customer data was queried. |
| `/admin/notifications` | Admin notification management. | IMPLEMENTED BUT NOT VERIFIED; no read/delete action was invoked. |
| `/admin/products` | Product draft/stage/ruleset linking, publish, pause, retire. | PARTIALLY IMPLEMENTED; database mutation and publication policy are not runtime-verified. |
| `/admin/products/new` | Create product draft. | IMPLEMENTED BUT NOT VERIFIED; form not submitted. |
| `/admin/rulesets` | Ruleset/version/rule editing and publish actions. | PARTIALLY IMPLEMENTED; F-09 published-version integrity remains; mutations not run. |
| `/admin/rulesets/new` | Create ruleset. | IMPLEMENTED BUT NOT VERIFIED; form not submitted. |

Absent trader/admin-facing operations include a unified order/payment console, evaluation queue, audit-log browser, monitoring health dashboard, payout workflow, support/appeal queue, and dedicated user-management list. Related APIs/data exist for some operations, but no UI route was found. Admin actions were reviewed statically and none were invoked.

The complete API route file inventory (54 route handlers) is:

```text
/api/accounts
/api/accounts/[id]
/api/accounts/[id]/health
/api/accounts/[id]/status
/api/admin/lifecycle
/api/admin/mt5-accounts
/api/admin/mt5-accounts/[id]
/api/admin/products
/api/admin/rulesets
/api/assignments
/api/auth/forgot-password
/api/auth/login
/api/auth/logout
/api/auth/register
/api/auth/reset-password
/api/auth/reset-password/verify
/api/auth/session
/api/auth/settings
/api/auth/verify-email
/api/auth/verify-email/confirm
/api/coupons
/api/evaluations
/api/evaluations/[id]
/api/evaluations/[id]/start
/api/funded-accounts
/api/funded-accounts/[id]
/api/funded-accounts/[id]/approve
/api/funded-accounts/[id]/link-account
/api/funded-accounts/[id]/transition
/api/monitoring/[accountId]/process
/api/monitoring/[accountId]/status
/api/notifications
/api/notifications/[id]
/api/orders
/api/orders/[id]
/api/orders/[id]/activate
/api/orders/[id]/activate-evaluation
/api/orders/[id]/allocate
/api/orders/[id]/pay
/api/products
/api/products/[id]
/api/products/[id]/publish
/api/products/[id]/stages
/api/products/[id]/stages/[stageId]
/api/products/[id]/status
/api/rulesets
/api/rulesets/[id]
/api/rulesets/[id]/versions
/api/rulesets/[id]/versions/[version]
/api/rulesets/[id]/versions/[version]/publish
/api/rulesets/[id]/versions/[version]/rules
/api/rulesets/[id]/versions/[version]/rules/[ruleId]
/api/trader/evaluations
/api/trader/funded-accounts
```

Authentication, role, ownership, and validation were inspected in the earlier focused review and by static source search. No live route was called; the handler inventory does not establish runtime correctness.

### Product and rules matrix — source of truth

| Product field | Source of truth | Current conclusion |
|---|---|---|
| Product name, category, structure, account size, price, price currency, denomination currency, status | Active `Product` records returned by `GET /api/products`; `ProductShowcase` renders these values. | Exact live rows cannot be safely enumerated without DB access. No historical or proposed price is presented as a current offer. |
| Evaluation stages and stage labels | `ProductStage` records linked to an exact `RulesetVersion`. | Requires DB state; no public lifecycle completion claim. |
| Profit target, daily/maximum loss, leverage, activity/restrictions, calculations | Published `Rule` values and calculation JSON. | Configured values can be displayed; actual rule semantics remain incomplete/unsafe per F-06–F-09. |
| Refund, reset, payout eligibility, timing, split, payment methods | No authoritative public product/API source identified. | NOT IMPLEMENTED or awaiting owner-approved policy; do not advertise. |
| Beginner, Pro, Expert, Instant Funded/Direct Funded concepts | Product brief and `ACCOUNT_PATHWAYS` are descriptive concepts, not proof of active product rows. | Terminology and approved terms require owner decision; no DB values inferred. |

### Changes from this continuation

- Production email configuration now rejects `EMAIL_MODE=console`, requires one configured HTTPS site origin, and rejects browser-prefixed `NEXT_PUBLIC_SMTP_*` settings without exposing their values.
- Email footer labels were changed from “Contact Support” to “View Help Resources” to match the actual self-service-only support page; a welcome-email claim about funded trading was narrowed to simulated evaluations and published rules.
- FAQ now explicitly covers email OTP, password reset, unavailable email changes, and where recorded account/evaluation states are shown. Settings calls the reset flow a code flow, and the how-it-works CTA no longer suggests an order becomes available when terms are complete.
- A categorized, names-only variable inventory is in `docs/environment-variable-inventory-2026-10-14.md`.

### Explicitly blocked or not attempted

- No database, migration, seed, reset, cleanup, live API, SMTP provider, payment, broker, or trading action was invoked.
- Session revocation and email-change verification require durable state not present in the current schema. Distributed throttling requires a shared store; `REDIS_URL` is only a template entry and no runtime consumer was found. These remain unimplemented rather than simulated.
- No unused file or dependency was deleted. Static reference searches cannot establish ownership of files while Git status/diff remains unavailable due the known worktree/ownership issue.
- No browser walkthrough or production build was run. The build script invokes Prisma Client generation, and earlier environment attempts encountered font-network and `.next` permission blockers.

### Validation results for this continuation

- `pnpm exec tsx tests/auth-otp.unit.test.ts`: PASS, 16/16.
- `pnpm test:safety`: PASS, 30/30 mocked/static guard tests; no database client or connection.
- `pnpm exec tsc --noEmit --incremental false`: PASS.
- Targeted ESLint on changed TypeScript/TSX: PASS, zero errors and warnings.
- `pnpm lint`: FAIL, 8 errors and 96 warnings remain after excluding the nested managed worktree and removing a proven unused test helper; changed files pass targeted lint. All 8 remaining errors are `require()` style in direct check/reset/environment scripts; changing their module order could affect the database guard.
- Static literal-link scan: 33 page routes, 24 literal internal links checked, zero unmatched paths. This does not validate dynamic links or runtime navigation.
- Production build and browser walkthrough: NOT RUN for the safety/environment blockers above.

## Severity-ranked remaining launch blockers

| Priority | Baseline findings | Impact and required next step |
|---|---|---|
| Critical / gate | F-01 | Test bootstrap and direct runners now fail closed and the mocked guard suite passes, but broad cleanup remains in DB suites and no configured target was proven disposable. Keep every database-backed test blocked until the owner verifies and isolates that target. |
| High | F-02, F-03, F-13, F-22 | Payment can be self-declared in backend paths; there is no verified provider checkout/webhook/reconciliation, and payment/ledger/coupon transitions have consistency and race risks. Select a provider and design signed, idempotent settlement before accepting money. |
| High | F-04, F-05, F-06–F-09, F-12 | Product/ruleset binding, account purpose/size allocation, financial calculations, rule semantics, published-rule mutation, and funded-account concurrency can produce wrong pass/fail or assignment outcomes. Require domain-owner approval and isolated route/concurrency tests. |
| High | F-10, F-11, F-24, F-26 | Legacy MT5 credential paths and unverified monitoring ingestion/normalization make live account status untrustworthy. Choose a worker/credential architecture and validate against a non-production broker before any live use. |
| High | F-14, F-27 | CI/deployment/migration controls are incomplete; email delivery retries run synchronously in request paths. Establish release, rollback, observability, and durable delivery procedures. |
| Medium | F-16, F-17, F-29 | Stateless JWTs cannot be revoked on logout/password reset; rate limits are process-local; account-state response differences remain. Requires a durable/shared auth design and regression tests. |
| Medium | F-18–F-21, F-23 | Cross-user idempotency, admin availability overrides, duplicate evaluation activation, repurchase reuse, unbounded APIs, and missing indexes affect isolation and scale. Correct server invariants and add ownership/concurrency/pagination tests. |
| Medium | F-25 | Payout, minimum-trading-day, and instant/direct-funded lifecycles are not implemented. Approve terms and build the corresponding lifecycle before advertising them. |
| Low / unverified | F-28, F-30, F-31, F-32, F-33 | Current source appears to filter draft rules from public reads and format amounts by product currency; setup/readiness documentation was updated in this batch. Runtime route/browser validation remains absent. Security headers are still unverified, and root lint still has 8 errors/96 warnings. |

The original report contains the full finding evidence and remediation detail. This table records current prioritization only; no high-risk financial, trading, allocation, credential, or lifecycle fix was attempted without safe isolated verification.
