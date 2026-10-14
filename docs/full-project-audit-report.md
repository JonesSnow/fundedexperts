# Funded Experts — Full Project Engineering Audit

**Audit date:** 2026-10-12
**Requested project location:** C:\FundedExperts
**Git repository audited:** C:\FundedExperts\app
**Audit type:** Read-only engineering and launch-readiness audit

## 1. Executive summary

The application is a substantial Next.js/Prisma implementation with authentication, catalog and order APIs, account inventory, evaluations, funded-account lifecycle services, email templates, and a monitoring/rule-engine prototype. It is not ready for a paid public launch or operation with real MT5 accounts.

The most urgent issue is a **conditional critical data-loss hazard in the documented test runner**: it reads .env.local as its database configuration, then the all-tests runner invokes a script that truncates application tables with CASCADE before each test. Project documentation itself describes .env.local as the production/shared database configuration. The newer Phase 33 guard is safer, but it is not used consistently by legacy test scripts and suites. No database-backed test or migration was run during this audit.

The commercial path is also incomplete: an authenticated user can mark an order PAID through a request field that defaults to simulated success, while the catalog only creates a pending order and never calls that payment endpoint. The evaluation engine has rule calculations that can produce false failures or allow configured restrictions to pass, and the primary activation flow can allocate an account without checking its purpose or size. MT5 credentials are stored unencrypted by a reachable legacy admin API. Live monitoring is not wired to an independently deployed worker or broker data source.

**Readiness recommendation: NO-GO for private beta with real users, real payments, or real trading accounts.** The code can support an isolated internal demo using mock data after test-database isolation is established. It should not be treated as a simulation of a reliable funded-account lifecycle until the P0/P1 findings below are addressed and verified.

### Baseline and scope

- At audit start the Git repository was on branch main at commit 1b55fab28c22e0ce3abc2d108d404874e5a6bd05, with a clean working tree and one local commit ahead of origin/main.
- No existing docs/full-project-audit-report.md was present at the final pre-write check.
- C:\FundedExperts\app is the Git repository. The parent C:\FundedExperts contains support directories; the worker directory contains only an example environment file and no runnable worker source.
- The report is the only intended audit artifact. No application source, tests, configuration, schema, migration, dependency, environment, database, or deployment setting was changed.
- .env.local and .env.test.local exist, but their contents were not opened or printed. No database target was assumed safe.

## 2. Overall readiness assessment

| Area | Assessment | Evidence |
|---|---|---|
| Internal mock demo | Limited / conditional | UI and APIs exist, but product/ruleset data must be administered and monitoring is manual/mock. |
| Private beta with real customers | Not ready | Checkout is incomplete, evaluation rules can miscalculate, account allocation constraints are incomplete, and API/security gaps remain. |
| Paid public launch | No-go | No real payment processor or verified webhook exists; payment success is client-declared simulation. |
| Real MT5 operations | No-go | Monitoring is not connected to a deployed worker/provider path; account lifecycle state does not enforce broker-side suspension or termination. |
| Database/test safety | No-go until guarded | Legacy test runners can use .env.local and truncate tables; no verified safe database was available. |
| CI and deployment | Not ready | The only .github/workflows/ci.yml is Markdown content rather than a runnable GitHub Actions workflow; no deployment/rollback configuration was found in the repository. |

## 3. Architecture and module inventory

### Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4.
- Prisma 6 with PostgreSQL and 12 migration directories.
- pnpm; bcryptjs for password hashing; jose for HS256 JWT sessions; nodemailer for SMTP.
- One web application with route handlers under app/api and domain/service code under lib.

### Implemented modules

- **User lifecycle:** registration, login/logout, session lookup, email verification, password reset, settings, roles, and account statuses.
- **Products and rulesets:** admin product/ruleset/version management, public listing, version publishing, rule creation.
- **Commerce:** order creation/listing, coupon application, simulated payment, ledger entries, and evaluation activation.
- **Account lifecycle:** MT5 account inventory, assignments, evaluation linking/release, funded-account approval/link/status transitions, admin overrides, and audit records.
- **Monitoring:** provider types, mock and real-MT5 adapter code, normalization, eligibility, scheduler/worker classes, persistence, and a manual admin processing endpoint.
- **Email:** templates for account, evaluation, payment, password, and payout events; SMTP and console providers; persistent delivery records and retries.
- **UI:** public landing/catalog, login/register/recovery/verification, trader dashboard, and basic admin pages for accounts, customers, notifications, products, and rulesets.

### Important missing or prototype components

- No real payment gateway SDK, signed webhook endpoint, or reconciliation worker.
- No runnable monitoring worker entry point/deployment in the parent worker directory; no production broker connection was independently verified.
- No payout model or payout API despite payout ledger enum values and email templates.
- No MIN_TRADING_DAYS rule type or implementation.
- No explicit direct-funded activation lifecycle, although product documentation lists Direct Funded.
- No code-defined product seed/catalog guaranteeing Beginner, Pro, Expert, or their exact rules; administrators must create product data.
- No Vercel, Docker, production migration, rollback, backup, or alerting configuration was found in the repository.

## 4. Findings dashboard

Counts below include confirmed defects and confirmed implementation gaps; conditional impact is called out in each finding.

| Severity | Count |
|---|---:|
| Critical | 1 |
| High | 13 |
| Medium | 13 |
| Low | 6 |

| ID | Severity | Category | Finding |
|---|---|---|---|
| F-01 | Critical | Test safety / data integrity | Test runner can connect to .env.local and truncate production/shared tables. |
| F-02 | High | Payments | Client can self-declare simulated payment success in any environment. |
| F-03 | High | Checkout / frontend | Catalog creates pending orders but never initiates payment. |
| F-04 | High | Business logic | Order can bind a product to an unrelated published ruleset version. |
| F-05 | High | Account allocation | Primary activation flow omits account purpose and size filters. |
| F-06 | High | Financial/rule integrity | PnL and drawdown calculations do not represent evaluation or daily values. |
| F-07 | High | Evaluation rules | Minimum-trade rule immediately fails users below the threshold. |
| F-08 | High | Evaluation rules | Trading-session rule always passes; trading-hours checks sampling time. |
| F-09 | High | Ruleset integrity | Admin API can add rules to published versions. |
| F-10 | High | Credential security | Legacy admin API stores MT5 credentials as supplied. |
| F-11 | High | Monitoring / launch | Monitoring accepts caller-provided snapshots and has no live deployed ingestion path. |
| F-12 | High | Funded lifecycle / database | Funded-account creation is race-prone; account linking/status does not reserve broker inventory. |
| F-13 | High | Financial records | Paid-order state and ledger entry are not atomic; concurrent failure can downgrade PAID. |
| F-14 | High | CI / deployment | No runnable CI workflow or production deployment/migration controls are present. |
| F-15 | Medium | Authentication | Unverified users receive sessions and can call authenticated APIs. |
| F-16 | Medium | Authentication/recovery | Password reset and logout do not revoke existing stateless JWT sessions; reset is race-prone. |
| F-17 | Medium | Abuse controls | Forgot-password throttling is cleared immediately; process-local limiter is bypassable and unbounded. |
| F-18 | Medium | Authorization / data exposure | Reused global idempotency key returns another trader’s order. |
| F-19 | Medium | Inventory consistency | Admin override can set AVAILABLE while an active assignment remains. |
| F-20 | Medium | Evaluation lifecycle | Repurchase can reuse a prior PASSED/FAILED evaluation for the same ruleset. |
| F-21 | Medium | API correctness | Legacy activate-evaluation route allocates/links and then tries to link the same evaluation again. |
| F-22 | Medium | Coupons / ledger | Coupon caps race under concurrency; order item price does not reflect discount. |
| F-23 | Medium | Performance / database | Several list APIs are unbounded and core query indexes are missing. |
| F-24 | Medium | Monitoring correctness | Runner ignores normalization success when a non-null partial snapshot is returned. |
| F-25 | Medium | Product completeness | Payouts, minimum trading days, and direct-funded lifecycle are absent. |
| F-26 | Medium | Monitoring scalability | Runner excludes accounts with null monitoring status and processes sequentially. |
| F-27 | Medium | Email/reliability | SMTP retries are synchronous in request paths and may delay or time out completed operations. |
| F-28 | Low | Information disclosure | Public ruleset endpoints expose draft versions and draft rules. |
| F-29 | Low | Authentication | Registration and suspended-account responses allow account enumeration. |
| F-30 | Low | Frontend | Catalog renders a dollar sign regardless of product currency. |
| F-31 | Low | Documentation | README, phase docs, and current implementation contradict each other. |
| F-32 | Low | Web security | No application security headers are configured in next.config.ts; hosting-layer policy is unverified. |
| F-33 | Low | Code quality | Lint has errors and many warnings; the root lint command also scans a nested worktree. |

## 5. Detailed findings

### F-01 — Test runner can truncate the shared/production database

**Severity:** Critical
**Confidence:** Confirmed; data loss occurs if the documented runner is pointed at the shared/production URL.

**Evidence:** scripts/run-all-tests.js:5–24 reads .env.local into process.env, then lines 46–60 invokes a database reset before each test. scripts/test-reset.cjs:4–31 reads the same file and executes TRUNCATE TABLE … CASCADE across Trader, LedgerEntry, orders, evaluations, accounts, products, and AuditLog. scripts/run-tests.js:4–24 also imports .env.local without target validation. tests/support/test-env.ts:8–10 documents that .env.local points at production/shared DB. A newer Phase 33 guard exists in tests/support/test-db-guard.ts, but these older runners do not use it consistently.

**Scenario and impact:** An operator follows the documented test workflow with the normal .env.local present. The all-tests runner connects to that database and truncates user, account, order, ledger, and audit data. This is an irreversible production data-loss path.

**Remediation:** Make test execution default-deny unless a separately supplied TEST_DATABASE_URL or PHASE33_DATABASE_URL passes a host/name allowlist and differs from DATABASE_URL. Remove production .env.local loading and global reset behavior; require isolated schema/database and per-test fixtures. Wire every DB test through the same guard.

**Regression test required:** Assert runners reject missing/production/equal test URLs before opening Prisma; use a fake Prisma client to prove no truncate/delete call occurs on rejection; run test suite against a dedicated disposable database only.

**Dependencies:** Test infrastructure decision and dedicated test database; no production migration should be needed.

### F-02 — Any authenticated trader can mark an order paid

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** app/api/orders/[id]/pay/route.ts:90–106 accepts simulateSuccess, defaults it to true, and restricts method names to SIMULATED_* values. Lines 135–148 mark CREATED/PENDING_PAYMENT orders PAID. No payment-provider event, signature, transaction ID, or environment guard is checked. lib/mock-payment-provider.ts is in-memory; no real provider/webhook route was found.

**Scenario and impact:** A trader sends the endpoint a successful simulated request and receives a PAID order without sending funds. If this route is exposed in a paid deployment, the order can proceed to evaluation/account allocation for free. It is explicitly a simulated path, so this is acceptable only in a clearly isolated demo.

**Remediation:** Replace client-declared success with server-verified provider results, signed webhook events, amount/currency/order matching, replay protection, and idempotent state transitions. Disable simulation routes in production.

**Regression test required:** Production-mode requests cannot mark orders paid; unsigned, replayed, wrong-order, wrong-amount, and wrong-currency events are rejected; valid provider events create one paid transition.

**Dependencies:** Payment provider, product currency/pricing policy, webhook endpoint and secret management; ledger transaction design.

### F-03 — Catalog checkout stops after creating a pending order

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** app/catalog/page.tsx:76–108 calls only POST /api/orders and reports that the order was created. It does not call /api/orders/{id}/pay or redirect to a provider. app/dashboard/page.tsx:376 and 401–403 only show activation for PAID orders; lines 638–680 show an activation action, not a payment action.

**Scenario and impact:** A normal user creates an order, which remains PENDING_PAYMENT, then sees no payment action in the catalog or dashboard. The purchase flow is not end to end even though the UI presents products and a purchase button.

**Remediation:** Complete the checkout flow with a real provider handoff/status display, failure/retry handling, and a clear return path. Do not use the simulated payment endpoint as the production UI path.

**Regression test required:** Browser/API integration test verifies purchase progresses through provider payment and activation, while cancellation/failure leaves the order unpaid.

**Dependencies:** F-02 provider decision and checkout UX/product requirements.

### F-04 — Order can be assigned a published ruleset unrelated to its product

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** app/api/orders/route.ts:76–92 looks up a caller-supplied rulesetVersionId and checks only that it exists and is PUBLISHED. It never compares rulesetVersion.rulesetId with product.rulesetId. The selected version is stored on the order at lines 142–148; activation later uses that order version.

**Scenario and impact:** A buyer or API client submits a product ID with a different published version that has easier rules or a different account size policy. The order price/product identity stays unchanged while evaluation uses the unrelated rule set.

**Remediation:** Resolve the version server-side from the selected product, or enforce exact ruleset ownership and active/effective version rules. Validate product ruleset configuration before accepting checkout.

**Regression test required:** Reject version IDs from another ruleset; assert every order’s stored version belongs to its product’s ruleset.

**Dependencies:** Product-to-ruleset policy; potentially a database constraint or migration if the model is tightened.

### F-05 — Main evaluation activation does not constrain account allocation

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** The dashboard calls app/api/orders/[id]/activate/route.ts, which invokes lib/activation.ts. At lib/activation.ts:250–252 the call to allocateAccount supplies only traderId. lib/allocation.ts:61–68 applies purpose and minimum-size filtering only when those optional arguments are passed. A separate activate-evaluation route supplies purpose and account-size values, but the current dashboard route uses the service path above.

**Scenario and impact:** The first available inventory row can be allocated to an evaluation even if it is a funded/other-purpose account or smaller than the purchased product. This misallocates inventory and can apply the wrong capital assumptions.

**Remediation:** Pass the purchased product’s required purpose and size from the authoritative order item; enforce constraints inside the allocation transaction and verify the selected account before assignment.

**Regression test required:** With mixed purposes/sizes in inventory, activation only selects an eligible evaluation account meeting the product’s minimum size.

**Dependencies:** Product/account allocation rules; likely no migration unless constraints are made database-enforced.

### F-06 — PnL and drawdown rules do not measure the required evaluation periods

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** lib/monitoring/real-mt5-adapter.ts:288–292 requests only the preceding seven days of deal history. lib/monitoring/normalize.ts:217–244 sums each deal’s profit into one total; it does not group by trading day or include commissions/swaps. lib/rule-engine.ts:178–206 compares the absolute value of that net total with MAX_DAILY_LOSS, so a large positive profit can fail a loss rule. Profit target uses this rolling total plus open-position profit. lib/monitoring-pipeline.ts:57–66 calculates drawdown from max(current balance, current equity, starting balance), not the historical equity peak.

**Scenario and impact:** A profitable account whose seven-day net exceeds the daily-loss threshold can be failed. A loss on one day can be hidden by gains on another; older evaluation profit drops out after seven days; charges are omitted; and drawdown from an earlier equity peak can be missed. Evaluation pass/fail decisions and customer balances can be wrong.

**Remediation:** Define the authoritative PnL semantics (evaluation start, realized/unrealized, fees, rollover timezone, static/trailing drawdown). Persist or reconstruct daily and lifetime equity peaks from provider data with timestamp/sequence validation. Treat stale or missing samples as indeterminate, not pass.

**Regression test required:** Fixtures covering multi-day gains/losses, positive net above loss limit, open PnL, commissions/swaps, gaps, stale samples, and historical peak-to-current decline.

**Dependencies:** Product owner trading-rule definitions and broker data contract; schema/storage changes likely for durable peak and daily aggregates.

### F-07 — Minimum-trade rules immediately fail an evaluation below the minimum

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** lib/rule-engine.ts:146–175 returns FAIL whenever total deal/position count is below minTrades. lib/monitoring-pipeline.ts:161–165 treats any required FAIL as a breach; lines 273–282 fail and release the evaluation.

**Scenario and impact:** On the first monitoring run, a trader who has not yet had time to make the minimum number of trades is failed for being below a completion requirement. Since required rules default true in app/api/rulesets/[id]/versions/[version]/rules/route.ts:96–105, this can terminate the evaluation immediately.

**Remediation:** Model minimum trades as a nonterminal progress condition. Fail only when the evaluation’s applicable deadline/closing condition is reached, if that is the chosen policy. Count completed trades consistently rather than raw provider deals plus open positions.

**Regression test required:** A new evaluation below the minimum remains IN_PROGRESS; reaching the threshold passes; deadline behavior follows the chosen rule policy.

**Dependencies:** Product rule definition and lifecycle policy.

### F-08 — Trading-session rules always pass; trading-hours rules inspect the sampling time

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** lib/rule-engine.ts:336–360 returns PASS whenever sessionRules or allowedSymbols is configured; it does not compare positions/trades to either setting. Lines 237–293 evaluate the current snapshot timestamp rather than the timestamps of trades and fall back to UTC for named time zones; overnight intervals are not represented by the simple start < end check.

**Scenario and impact:** A trader can use a forbidden symbol/session and still pass TRADING_SESSION. Conversely, a monitor running outside the allowed hours can fail a trader who made no out-of-hours trade, while a prior violating trade can be missed if the next sample is within hours.

**Remediation:** Evaluate actual provider position/deal timestamps and symbols against a validated session calendar and IANA timezone, including overnight sessions and DST. Reject unsupported rule configurations at publish time.

**Regression test required:** Forbidden symbol/session, off-hours deal, quiet account monitored outside hours, overnight range, DST boundary, and named timezone cases.

**Dependencies:** Rule schema/product policy and provider timestamp/symbol fields; possibly schema migration for normalized trade events.

### F-09 — Published ruleset versions are mutable through the add-rule endpoint

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** app/api/rulesets/[id]/versions/[version]/rules/route.ts:76–107 resolves a version and creates a Rule without checking that the version is DRAFT. The pipeline loads rules through the evaluation’s version relation at lib/monitoring-pipeline.ts:108 and 142.

**Scenario and impact:** An admin can append a rule to a published version. Existing active evaluations reference that version and can begin using changed rules on the next monitoring run, contradicting the documented immutable-version contract.

**Remediation:** Require DRAFT status for every mutation endpoint and enforce immutable snapshots in the domain service/DB. Publish a new version for any rule change.

**Regression test required:** Every mutation endpoint rejects PUBLISHED and ARCHIVED versions; existing evaluation decisions remain tied to immutable rule snapshots.

**Dependencies:** Existing-version data review; migration may be needed if rules must be snapshotted per evaluation.

### F-10 — Legacy admin account APIs persist MT5 credentials without encryption

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** app/api/admin/mt5-accounts/route.ts:140–152 writes credentials directly to MT5Account.credentials. app/api/admin/mt5-accounts/[id]/route.ts:137–145 also copies credentials directly. The schema stores a nullable String at prisma/schema.prisma:118–135. The canonical app/api/accounts/route.ts:149–182 instead calls encryptIfEnabled and refuses credential storage if encryption is unavailable.

**Scenario and impact:** Credentials submitted through either legacy route are stored in plaintext and appear in database dumps, backups, and privileged database queries. The safer route does not protect writes made through the legacy endpoints.

**Remediation:** Remove or route legacy writes through the canonical encryption service; refuse plaintext persistence; rotate any credentials already stored through this path. Add key versioning and rotation procedure.

**Regression test required:** Both admin endpoints store ciphertext only and never return the credential; missing key fails closed; rotation/decryption tests cover old and current key versions.

**Dependencies:** MT5_ENCRYPTION_KEY deployment, credential rotation, and likely a data migration/re-encryption for existing rows.

### F-11 — No live broker monitoring path is wired into the application

**Severity:** High
**Confidence:** Confirmed for the checked repository; production integration remains unverified.

**Evidence:** app/api/monitoring/[accountId]/process/route.ts:46–51 is admin-only, but lines 65–118 accept a caller-provided snapshot and lines 194–208 pass it directly to the evaluation pipeline. The endpoint also exposes explicit mock data. lib/monitoring/worker.ts:74 defaults to MockMT5Adapter. No MonitoringRunner instantiation or worker entry point was found in application scripts; C:\FundedExperts\worker contains only an example environment file. RealMT5Adapter is a local Python/terminal bridge, not a configured web-provider client.

**Scenario and impact:** Evaluation decisions depend on manual/admin-supplied or mock snapshots. There is no verified automatic source of broker balances, open positions, daily PnL, or stale-data status. A compromised/mistaken admin can create false passes or failures; missed monitoring can leave a breached account active.

**Remediation:** Define and deploy an isolated monitoring worker on supported infrastructure, authenticate its data path, validate freshness/sequence/provider identity, and make provider failures explicitly non-passing. Restrict the manual snapshot endpoint to test/admin environments and label/audit every override.

**Regression test required:** Provider integration contract tests, signed/authenticated worker ingestion, replay/stale snapshot tests, and end-to-end breach-to-suspension tests on a dedicated demo account.

**Dependencies:** Broker authorization and hosting choice (docs propose Windows MT5 terminal); infrastructure, secrets, operational ownership, and monitoring SLA.

### F-12 — Funded-account creation/linking is not fully idempotent or inventory-safe

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** lib/funded-account.ts:191–231 checks for an existing funded account, then creates in a separate transaction; prisma/schema.prisma:190–204 has no unique constraint on FundedAccount.evaluationId. Concurrent calls can both pass the check. In linkAccount, lines 358–439 validate the funded row but do not verify that the MT5 account is AVAILABLE, of funded purpose, or not already linked elsewhere, and update only the FundedAccount row. Status transitions at lib/funded-account.ts:544–582 update funded-account state without disabling broker access or synchronizing MT5Account status.

**Scenario and impact:** Retry/concurrent pass processing can create duplicate funded accounts for one evaluation. The same MT5 account may be linked to multiple funded rows or to the wrong-purpose account. Suspending/terminating an internal funded row does not itself revoke real trading access.

**Remediation:** Add unique evaluation linkage and transactional compare-and-set; reserve and transition MT5Account inventory in the same transaction; enforce assignment ownership/purpose; integrate broker-side suspend/close actions with retryable outbox state.

**Regression test required:** Concurrent funded creation, concurrent linking of one account, wrong-purpose/unavailable account rejection, and suspension/termination access-revocation tests.

**Dependencies:** Database migration for uniqueness/constraints; broker API capability and operational recovery design.

### F-13 — Paid status and ledger are separate; failure can overwrite a successful payment

**Severity:** High
**Confidence:** Confirmed.

**Evidence:** app/api/orders/[id]/pay/route.ts:135–148 commits PAID status in a transaction. It creates the ledger entry later at lines 164–187; ledger failure is logged but the paid response still proceeds. The simulated failure path at lines 106–110 updates the order to FAILED without a status predicate, even though the request checked the order’s earlier state before this branch.

**Scenario and impact:** A database error can leave a PAID order with no ledger record. Concurrent success/failure requests can commit success and then downgrade the same order to FAILED, breaking reconciliation and activation eligibility.

**Remediation:** Use a single database transaction for conditional state transition plus ledger write, with explicit terminal-state rules and provider-event idempotency. Do not let failure events overwrite PAID; reconcile provider events separately and alert on ledger invariant violations.

**Regression test required:** Simultaneous success/failure, duplicate success, ledger write failure, and retry tests assert one terminal order state and exactly one ledger entry.

**Dependencies:** Payment-provider event model; possible migration for provider transaction/event identifiers.

### F-14 — CI and deployment controls are absent or non-runnable

**Severity:** High
**Confidence:** Confirmed for repository files; hosted GitHub/Vercel settings were not inspected.

**Evidence:** .github/workflows/ci.yml begins with a Phase report and Markdown tables/fenced example instead of a GitHub Actions workflow. docs/ci-cd-baseline.md says CI is not operational. The embedded workflow example targets master while this repository branch is main. No deployment or rollback workflow, Vercel config, Dockerfile/compose file, production migration job, health endpoint, or backup configuration was found.

**Scenario and impact:** Changes can merge without the claimed static/database checks. Production schema rollout and rollback are undocumented, and the app/monitoring worker have no reproducible deployment boundary.

**Remediation:** Replace the prose file with a valid workflow on the actual protected branch; run type, lint, schema, safe unit, and isolated database checks. Add separate deploy and migration strategy with rollback/backup ownership and worker health/alerting.

**Regression test required:** Validate workflow YAML, trigger it on a test PR, verify it rejects unsafe DB configuration and blocks merge on failed checks.

**Dependencies:** GitHub branch-protection and secret decisions; deployment host, DB migration, backup, and rollback policy.

### F-15 — Email verification is not an API access gate

**Severity:** Medium
**Confidence:** Confirmed.

**Evidence:** app/api/auth/register/route.ts:55–78 creates an unverified trader and immediately issues a session cookie. app/api/auth/login/route.ts:99–118 returns emailVerified but still issues a session for false. Order/API authentication helpers, for example app/api/orders/route.ts:245–264, reject only missing, SUSPENDED, or INACTIVE users. Trader defaults to PENDING and emailVerified=false in prisma/schema.prisma:18 and 25, but PENDING is allowed by these checks.

**Scenario and impact:** An unverified email can call authenticated APIs, create orders, and access account flows despite the verification UI. This undermines email ownership checks and can enable abuse using addresses the caller does not control.

**Remediation:** Define whether verification is required, then enforce it centrally for protected actions and at login/session issuance. Keep a narrow allowlist for verification/resend endpoints.

**Regression test required:** Unverified user cannot reach protected purchase/account APIs; verified user can; verification and resend endpoints remain accessible.

**Dependencies:** Product decision on verification gating and existing account remediation.

### F-16 — Logout/password reset do not revoke existing JWT sessions

**Severity:** Medium
**Confidence:** Confirmed.

**Evidence:** lib/auth/session.ts:22–38 issues stateless seven-day JWTs and verifies only signature/expiry. Logout clears the browser cookie, but there is no server-side token/version revocation check. app/api/auth/reset-password/route.ts:46–69 reads a reset token and updates the password in a separate write, then clears the reset token; it does not invalidate sessions. The token lookup/write is not a compare-and-set transaction.

**Scenario and impact:** A stolen session remains valid until its seven-day expiry after logout or password reset. Two reset requests that race after the same token lookup can both change the password.

**Remediation:** Use short-lived sessions with refresh rotation or server-side session version/revocation; invalidate sessions on password reset/suspension. Consume reset tokens atomically and store a hash of each token.

**Regression test required:** Old token rejected after logout/reset/suspension; concurrent use of one reset token succeeds at most once.

**Dependencies:** Session storage or token-version field; likely schema migration and client/session rollout.

### F-17 — Forgot-password rate limiting is reset on every lookup

**Severity:** Medium
**Confidence:** Confirmed.

**Evidence:** app/api/auth/forgot-password/route.ts:20–35 calls checkRateLimit and then immediately resetRateLimit for that email after the database lookup. lib/auth/rate-limit.ts:6–43 stores counters in a process-local Map with no cleanup for unique keys. Registration also clears its limiter on invalid/duplicate submissions.

**Scenario and impact:** Repeated unauthenticated reset requests to a known address bypass throttling and send repeated reset emails, invalidating earlier tokens and enabling mailbox harassment. Unique email keys can also grow the map without bound; serverless instances/restarts do not share limits.

**Remediation:** Do not clear failed/forgot-password counters; apply distributed limits by IP and account key, normalize keys, cap storage, and add resend cooldowns.

**Regression test required:** Repeated requests receive 429 across both known and unknown emails; IP/account limits persist across process instances.

**Dependencies:** Shared rate-limit service or gateway policy; no schema migration if external rate limiting is selected.

### F-18 — Reusing another trader’s idempotency key returns their order

**Severity:** Medium
**Confidence:** Confirmed behavior; exploit requires a known/reused key.

**Evidence:** app/api/orders/route.ts:48–62 performs a global lookup by idempotencyKey and returns the existing order without checking existing.traderId against the authenticated trader. Input validation at lines 276–288 checks only that the key is a string.

**Scenario and impact:** If a caller uses or learns another customer’s key (for example a predictable client-generated key), they can query that key and receive the other order’s ID, trader ID, amount, notes, and status.

**Remediation:** Scope idempotency keys to the authenticated trader (composite unique key) and verify ownership before returning a duplicate. Bound key length and require a high-entropy client token.

**Regression test required:** A different trader reusing a key gets no data and cannot affect the original order; same trader retry remains idempotent.

**Dependencies:** Likely migration to composite uniqueness and backfill of existing keys.

### F-19 — Admin override can make an assigned account AVAILABLE without releasing it

**Severity:** Medium
**Confidence:** Confirmed.

**Evidence:** app/api/accounts/[id]/status/route.ts:104–135 permits adminOverride=true when an active assignment exists, writes an audit event, then updates MT5Account.status to AVAILABLE. It does not return/revoke the active AccountAssignment or unlink the evaluation.

**Scenario and impact:** Inventory reports the account as AVAILABLE while an active trader/evaluation still owns the assignment. Later allocation can select the contradictory row and fail or leave the current trader with an account marked available.

**Remediation:** Make override a lifecycle operation that atomically releases/reassigns the active assignment and updates evaluation/account state, or reject AVAILABLE until release is complete.

**Regression test required:** Forced status changes preserve the invariant that AVAILABLE has no active assignment and IN_USE has one matching assignment.

**Dependencies:** Admin override policy; transaction and possibly state-repair migration for inconsistent rows.

### F-20 — Repurchasing the same ruleset can reuse an old terminal evaluation

**Severity:** Medium
**Confidence:** Confirmed.

**Evidence:** lib/activation.ts:183–194 searches for an existing evaluation for the trader/version across IN_PROGRESS, PASSED, and FAILED. If the old row already has an accountId, lines 236–247 return it as already activated instead of creating a new evaluation for the newly paid order. Evaluation has no orderId relation in prisma/schema.prisma:168–188.

**Scenario and impact:** A customer who buys another attempt at the same challenge can be shown the previous pass/fail evaluation; if the old row has no account, subsequent allocation may fail because allocation looks for an IN_PROGRESS evaluation. New payment is not associated with a fresh attempt.

**Remediation:** Define retry/re-purchase policy and link each evaluation to its originating order/attempt. Reuse only an active evaluation when policy explicitly permits; never reuse terminal evaluations by default.

**Regression test required:** Repurchase after FAILED and PASSED creates or reuses exactly the policy-approved attempt; each paid order maps to an auditable evaluation.

**Dependencies:** Product retry policy and schema migration for order/evaluation association.

### F-21 — Legacy activate-evaluation route double-links the account

**Severity:** Medium
**Confidence:** Confirmed for this endpoint.

**Evidence:** app/api/orders/[id]/activate-evaluation/route.ts:143–149 calls allocateAccount. lib/allocation.ts:120–127 already writes evaluation.accountId and returns evaluationLinked=true. The route then calls linkEvaluation again (around lines 167–195). lib/evaluation-link.ts:68–70 rejects any already-linked evaluation, after which the route attempts to release the allocation and returns failure.

**Scenario and impact:** A request to this endpoint can successfully allocate and link, then treat that success as a failure and roll back/release the account. The dashboard currently calls the separate /activate route, but the broken route remains reachable and its direct callers cannot rely on it.

**Remediation:** Use one owner for linking. Either make allocation not link the evaluation and have the caller link transactionally, or honor allocationResult.evaluationLinked.

**Regression test required:** Route-level test proves one activation creates one assignment/link and repeated activation is idempotent without releasing the active account.

**Dependencies:** No schema migration expected; caller/transaction ownership decision.

### F-22 — Coupon usage caps can be exceeded and line-item amounts contradict the order total

**Severity:** Medium
**Confidence:** Confirmed.

**Evidence:** app/api/orders/route.ts:122–128 checks coupon.usedCount before the transaction; lines 163–174 later create usage and increment count without a conditional cap check. At lines 142–145 OrderItem.unitPrice is set to full subtotal while Order.totalAmount at lines 128–129 is discounted.

**Scenario and impact:** Concurrent checkouts at totalUsageLimit minus one can all pass the stale read and oversubscribe the cap. Receipts/reconciliation that use order items can show full price while the order/ledger uses a discounted total.

**Remediation:** Atomically claim coupon capacity in the order transaction using a conditional update/locked row; store discount allocation and net line total explicitly.

**Regression test required:** Concurrent requests at the final coupon slot produce no more than one successful use; order, item, coupon usage, and ledger totals reconcile.

**Dependencies:** May require coupon usage/discount fields or a migration for line-level totals.

### F-23 — List APIs and schema are not ready for growing datasets

**Severity:** Medium
**Confidence:** Confirmed for query shape; production latency not measured.

**Evidence:** app/api/orders/route.ts:232–235 returns all orders; accounts, assignments, evaluations, and notifications routes also use findMany without a page cursor or maximum. prisma/schema.prisma has indexes for selected models, but no useful compound indexes for Evaluation by trader/status/start, FundedAccount by evaluation/status, AccountAssignment by trader/status, or RuleEvent by account/time.

**Scenario and impact:** As records grow, each dashboard/admin request returns increasingly large payloads and scans/sorts more rows. This increases memory, DB load, and request duration; requests can become a denial-of-service amplifier.

**Remediation:** Add bounded cursor pagination and select only needed columns/relations; add indexes from measured query plans and production-shaped load tests.

**Regression test required:** API contract tests enforce maximum page size and stable pagination; query plan/load tests cover the largest dashboard/admin list paths.

**Dependencies:** API compatibility and database migration for indexes; query-plan evidence needed before final index selection.

### F-24 — Monitoring runner ignores normalization failure when snapshot is non-null

**Severity:** Medium
**Confidence:** Confirmed; one selected unit test also fails.

**Evidence:** lib/monitoring/normalize.ts:113–117 can return success=false with a non-null snapshot when accountInfo is missing. lib/monitoring/monitoring-runner.ts:223–245 checks only normalizationResult.snapshot, then completes the job and passes the snapshot to the pipeline without checking success or critical errors. The manual endpoint similarly branches on snapshot presence. tests/monitoring/normalize.test.ts:41–52 expects null accountInfo to be success=true; the current implementation returns false because the error is CRITICAL.

**Scenario and impact:** Missing critical broker account data can be evaluated as if it were a usable snapshot, while the test suite disagrees about whether it should be accepted. A null balance/equity can distort profit/drawdown rules.

**Remediation:** Define normalization result semantics, require success and freshness before pipeline evaluation, and never convert missing critical fields into pass/fail decisions.

**Regression test required:** Resolve the null-accountInfo contract; ensure runner and endpoint stop before rule evaluation on critical normalization errors.

**Dependencies:** Provider snapshot policy; no migration expected.

### F-25 — Core product features are documented but not implemented

**Severity:** Medium
**Confidence:** Confirmed within the repository; product scope requires owner confirmation.

**Evidence:** prisma/schema.prisma defines TRADER_PAYOUT ledger enum values and payout email templates exist, but there is no payout model or payout API route. RuleType has no MIN_TRADING_DAYS. docs/products-and-rulesets.md lists Direct Funded, but lib/activation.ts requires an order.rulesetVersionId and creates an Evaluation; no direct-funded branch is present.

**Scenario and impact:** The product can advertise payout/direct-funded/minimum-day behavior that has no operational workflow, settlement records, or rule enforcement. Admins would have to handle these outside the system with incomplete auditability.

**Remediation:** Decide launch scope and either remove/disable unavailable product claims or design payout request/approval/ledger/reconciliation, direct-funding, and minimum-day workflows end to end.

**Regression test required:** Product contract tests prove each advertised product has a supported purchase-to-account lifecycle and payout states reconcile to the ledger.

**Dependencies:** Product/finance/legal decisions; likely schema and API migrations plus payment/broker integrations.

### F-26 — Monitoring runner skips new accounts and ignores configured concurrency

**Severity:** Medium
**Confidence:** Confirmed code behavior; impact applies if the runner is deployed.

**Evidence:** prisma/schema.prisma:135 makes currentMonitoringStatus nullable with no default. lib/monitoring/monitoring-runner.ts:308–316 selects only HEALTHY, ERROR, or UNKNOWN, excluding newly created accounts with null status. Lines 322–326 process accounts in a sequential await loop even though schedulerMaxConcurrent is configured and passed to Scheduler.

**Scenario and impact:** A newly registered account is not selected for the first monitoring run, and throughput remains one account at a time as the population grows. Queue settings imply concurrency that does not occur.

**Remediation:** Include eligible null-status accounts, define stale/unknown recovery, and dispatch through the scheduler with bounded concurrency and cleanup on failure.

**Regression test required:** Null-status eligible account is scheduled; max concurrency is enforced under multiple accounts; failures do not leave runner.isRunning set.

**Dependencies:** Worker deployment and monitoring SLA.

### F-27 — Email delivery retries block business request paths

**Severity:** Medium
**Confidence:** Strongly suspected production impact; exact hosted timeout depends on deployment.

**Evidence:** lib/email/index.ts:39 onward performs delivery inline, retries up to three times with delays, and updates EmailDelivery synchronously. lib/email/provider.ts configures SMTP connection/socket timeouts. Order creation and payment routes await their email template calls after mutating the database.

**Scenario and impact:** Slow SMTP can hold an API request for many seconds after the order/payment has committed. A client timeout/retry can produce confusing duplicate attempts, and a serverless request may time out while email is still being sent.

**Remediation:** Persist an outbox/delivery event in the same transaction as the business mutation, send asynchronously with bounded retries, and make email delivery status independent from the purchase response.

**Regression test required:** Simulated SMTP timeout does not delay or reverse the committed order state; outbox retry is idempotent.

**Dependencies:** Background worker/queue or durable outbox; deployment limits.

### F-28 — Public ruleset reads expose draft versions and rules

**Severity:** Low
**Confidence:** Confirmed.

**Evidence:** app/api/rulesets/[id]/versions/route.ts GET returns version rows without calling its local authenticated-user helper or filtering status. app/api/rulesets/[id]/versions/[version]/rules/route.ts:33–55 returns rules for any version ID without authentication or a PUBLISHED check.

**Scenario and impact:** Anyone who knows a ruleset/version URL can inspect draft or archived challenge rules before publication. This may expose internal policy or planned commercial terms.

**Remediation:** Public reads should return only active published versions; require admin authorization for draft/archived versions.

**Regression test required:** Unauthenticated GET cannot retrieve draft/archived versions or rules; published public rules remain visible if intended.

**Dependencies:** Product disclosure policy; no migration expected.

### F-29 — Registration and suspended-account responses enable enumeration

**Severity:** Low
**Confidence:** Confirmed.

**Evidence:** app/api/auth/register/route.ts:45–50 returns 409 “Email already registered.” app/api/auth/login/route.ts:72–77 returns 403 for suspended/inactive accounts while unknown or invalid active accounts return 401.

**Scenario and impact:** Repeated public requests can distinguish registered addresses and identify suspended accounts, supporting targeted phishing or account discovery.

**Remediation:** Use consistent public response status/body for account-existence cases while retaining internal security/audit reasons.

**Regression test required:** Existing, unknown, suspended, and inactive account probes have indistinguishable public response shapes.

**Dependencies:** Product decision on registration UX and abuse reporting.

### F-30 — Catalog currency symbol is hard-coded

**Severity:** Low
**Confidence:** Confirmed.

**Evidence:** app/catalog/page.tsx:162–163 renders account size with a dollar sign; purchase success at lines 101–103 also prefixes a dollar sign regardless of product currency.

**Scenario and impact:** Products configured in another currency are shown with a misleading dollar amount, which can mislead customers at checkout.

**Remediation:** Format amounts using the product/order currency and locale; validate supported currency codes.

**Regression test required:** Catalog and order confirmation display correct currency for USD and at least one non-USD product.

**Dependencies:** Supported currency and locale policy.

### F-31 — Documentation is stale and internally contradictory

**Severity:** Low
**Confidence:** Confirmed.

**Evidence:** docs/known-limitations.md and docs/authentication.md say email verification/password reset or the monitoring directory are not implemented, while routes/templates/classes now exist. docs/ci-cd-baseline.md labels CI completed but says it has not run and the named workflow file is Markdown. README still reports Phase 21 and documents Docker Compose although no compose file exists. Architecture/product docs still describe payment and monitoring as future/simulation-only, which conflicts with commercial-launch wording.

**Scenario and impact:** Operators and developers can follow obsolete setup and security assumptions, run unsafe tests, or believe a feature is available when it is only partial.

**Remediation:** Make one current source of truth for supported user flows, deployment/test safety, payment/MT5 status, product rules, and release requirements; date and retire superseded phase reports.

**Regression test required:** Documentation review checklist tied to each release; setup instructions exercised in an isolated environment.

**Dependencies:** Product/engineering owners for authoritative launch scope.

### F-32 — No application security headers are configured

**Severity:** Low
**Confidence:** Confirmed for app config; hosting/CDN headers are unverified.

**Evidence:** next.config.ts contains no headers, CSP, frame, content-type, referrer, or permissions policy configuration. No repository deployment config was available to prove those headers are set elsewhere.

**Scenario and impact:** Browser defense-in-depth depends entirely on an external hosting layer that was not verified. This can increase impact of a future content injection or framing issue.

**Remediation:** Define and verify an appropriate security-header policy at the application or hosting layer, especially CSP and frame restrictions, without breaking required integrations.

**Regression test required:** Deployed response-header check in staging and policy validation for the application pages.

**Dependencies:** Hosting-layer configuration and CSP source allowlist decisions.

### F-33 — Lint fails and the root command scans generated worktree content

**Severity:** Low
**Confidence:** Confirmed.

**Evidence:** pnpm lint runs eslint with no paths. It scanned .kilo/worktrees/fortunate-crawdad/app in addition to the project. The root command reported 71 errors and 254 warnings. Explicit eslint app lib tests still reported 4 errors and 122 warnings, including setState-in-effect findings in recovery/verification pages and a prefer-const test error.

**Scenario and impact:** The configured local quality check fails, has noisy counts from nested worktrees, and does not provide a reliable release gate. The actual app/test errors remain visible even after excluding the nested tree.

**Remediation:** Scope lint to tracked application/test directories, ignore generated/nested worktrees, and resolve the genuine lint errors without suppressing rules.

**Regression test required:** CI lint runs on a clean checkout and returns zero errors; ignored worktree content does not change results.

**Dependencies:** Lint scope decision; no migration expected.

## 6. Security assessment

### Controls that are working

- Passwords are hashed with bcrypt; login uses dummy password work for unknown/suspended users.
- JWT verification pins HS256; JWT_SECRET is required and rejects the documented placeholder.
- Session cookies are HttpOnly, SameSite=Strict, and Secure in production.
- Most admin APIs reload the trader’s current role/status from the database rather than trusting only the JWT role.
- Canonical account APIs encrypt MT5 credentials when configured and omit credentials from returned account objects.
- ORM access is generally Prisma parameterized; allocation’s raw SQL uses tagged parameters.
- Audit/email logging usually avoids printing passwords and logs email domains rather than full recipients.

### Material security gaps

- F-01, F-10, F-15, F-16, F-17, and F-18 are the principal security/data-integrity risks.
- The process-local Map limiter does not survive restarts or coordinate serverless instances.
- No verified centralized CSRF/CORS/header policy was found; SameSite=Strict reduces browser CSRF exposure but is not a substitute for a documented policy.
- No dedicated secret-scanning executable was available. Environment files were not opened; no secret values are included here. A full enterprise secret scan of build outputs and every historical blob was not established.
- The checkout/payment and monitoring APIs are not authenticated to external providers because those providers are not integrated.

## 7. Authentication and user lifecycle

Registration hashes the password, stores an email verification token, sends verification email, and issues a session immediately. Login returns emailVerified but does not require it. Current route helpers reject suspended/inactive users but permit PENDING/unverified users. Email confirmation exists, but it is not enforced as a gate.

Logout clears the browser cookie. The seven-day stateless JWT remains valid if copied. Password reset is present and uses a short-lived random token, but token consumption and password update are separate, token storage is plaintext, and existing sessions remain valid.

The login path has improved timing behavior for unknown accounts, but the public status/body for suspended accounts differs. Register/reset rate limits are not consistently effective. Most API handlers have role/ownership checks, but draft ruleset GETs and order idempotency handling remain exceptions described above.

## 8. Business-logic and financial-integrity assessment

### Verified positive behavior

- Order creation recalculates product price on the server rather than trusting a client price.
- Activation checks order ownership and payment state.
- The ledger has a unique referenceId and the funded-account create path writes its audit entry in the same transaction.
- Allocation uses a transaction, a per-trader advisory lock, row locking with SKIP LOCKED, and an active-account partial unique index in migration history.
- Evaluation/funded-account/assignment concepts are separated in the schema.

### Launch blockers

- Payment success is simulated/self-attested and the normal UI never reaches it.
- Product-to-ruleset binding and account-pool filters are not consistently enforced.
- Daily loss, lifetime profit, historical drawdown, minimum-trade, and session rules can produce incorrect outcomes.
- Funded account uniqueness/linking and broker-side suspend/terminate behavior are incomplete.
- Ledger/order state can diverge; coupon limits and line-item totals can diverge.
- No payout workflow or direct-funded/minimum-trading-day lifecycle exists.

These errors can create free paid services, wrong account allocation, false evaluation failure/pass, duplicate funded rows, inconsistent ledger records, and unreconciled payouts. Do not rely on current evaluation results for financial or contract decisions.

## 9. Database and concurrency assessment

### Strengths

- PostgreSQL schema has explicit enums, foreign-key relations, monetary Decimal fields, several unique constraints, and a partial unique active assignment index in migration history.
- Allocation uses row/advisory locking rather than a simple find-then-update.
- Ledger references and order identifiers have unique constraints.

### Gaps

- FundedAccount.evaluationId is nullable and not unique; its service uses check-then-create.
- Account linking does not reserve/validate MT5 inventory in the same transaction.
- Payment/order state and ledger entry are separate commits.
- Coupon usage-limit validation is outside the write transaction.
- Core list/monitoring lookups lack several compound indexes; list endpoints lack pagination.
- RuleEvent has no account/time index; Evaluation and FundedAccount lack indexes for common trader/status/evaluation lookups.
- Migration history includes partial indexes Prisma schema cannot express directly; because no safe database was available, actual deployed migration state/drift was not checked.
- Audit writes are often separate from account-status or admin mutations, so an audit insert failure can leave a committed change without its record.

**No database was inspected or modified.** Prisma validation could not load its datasource because DATABASE_URL was absent from the process; no environment value was supplied.

## 10. API and frontend assessment

### API inventory

The repository contains 44 API route files grouped into auth, products/coupons/rulesets, orders/pay/activation/allocation, accounts/assignments/evaluations/funded accounts, notifications, monitoring, and admin lifecycle.

### API concerns

- Unbounded GETs and inconsistent pagination/filter support.
- Public draft rule reads.
- Global idempotency lookup without ownership validation.
- Rule creation does not enforce draft-only mutation.
- Order status/ledger transitions are not fully atomic.
- Several handlers accept broadly typed JSON and validate only selected fields; product/ruleset JSON remains flexible.
- Error/status contracts vary; some catches collapse distinct database or validation errors to generic 500s.

### Frontend observations

- Catalog reports order creation only; no checkout/payment step follows.
- Dashboard displays activation only for PAID orders, which the customer cannot reach through the UI.
- Product currency formatting is hard-coded.
- Admin UI is basic and incomplete: no full product/ruleset edit workflow, payout console, or operational MT5 monitoring controls were found.
- Some forms/pages have linted state-in-effect patterns. No browser or responsive/accessibility test was run, so visual/mobile/keyboard coverage remains unverified.
- Dashboard performs several parallel API requests, while shared/header components also perform session lookups; this is not yet measured as a bottleneck.

## 11. Performance and scalability

### Measurements

- The selected database-free monitoring unit tests took about 13.5 seconds and completed 118 assertions with one failure. This is test runtime only, not route performance.
- No cold/warm HTTP response time, query latency, query count, database pool, or bundle-size measurement was possible without a running app and a verified safe database/environment.
- Production network latency cannot be inferred from this local Windows environment.

### Expected bottlenecks from source

- Several APIs return unbounded result sets.
- MonitoringRunner processes accounts serially despite configured concurrency.
- Process-local rate-limit map can grow with unique keys.
- SMTP delivery/retries occur synchronously after business mutations.
- Dashboard fans out to multiple APIs and repeats session lookups.
- Missing compound indexes will increase list and monitoring-query cost as account/evaluation history grows.
- A single Next/Prisma deployment and separately required Windows MT5 worker need explicit connection pooling, worker queue, backpressure, health checks, and retry ownership before scale.

No speedup estimates are claimed.

## 12. Testing and code quality

### Safe checks run

- **TypeScript:** passed — pnpm exec tsc --noEmit, exit 0.
- **Database-free monitoring tests:** 118 passed, 1 failed, 119 total across the selected test files. Failure: tests/monitoring/normalize.test.ts expects null accountInfo to return success=true, while current normalizeSnapshot returns false because the error is CRITICAL.
- **Scoped lint:** failed — pnpm exec eslint app lib tests reported 4 errors and 122 warnings.
- **Package lint command:** failed — pnpm lint reported 71 errors and 254 warnings because ESLint also scanned a nested .kilo/worktrees/fortunate-crawdad/app tree.
- **Prisma validate:** blocked — Prisma reports missing DATABASE_URL while loading schema. No connection was attempted.
- **Database integration/route tests:** not run. Many suites instantiate PrismaClient and perform global deleteMany/TRUNCATE cleanup; test safety could not be established.
- **Build:** not run. The build script runs prisma generate and Next build, which writes generated/build artifacts; required safe environment was not verified.
- **Migrations:** not run.
- **Dependency audit:** not run; no local vulnerability scanner was available and no package installation/network audit was attempted.

### Test quality

- Unit coverage exists for monitoring normalization, eligibility, worker/scheduler classes, auth helpers, payment abstraction, and domain services.
- Several tests are direct Prisma/service tests rather than HTTP/browser end-to-end tests. The file named e2e-workflow directly invokes domain/database code and performs global cleanup; it is not a browser/customer flow test.
- No real payment webhook/provider, live broker connection, concurrent allocation/funded-account race, or full checkout browser test was executed.
- package.json test includes database-capable files directly; it does not consistently route all suites through the Phase 33 test database guard.

## 13. Deployment and operational readiness

- .github/workflows/ci.yml is Markdown, not a valid workflow. Its embedded example says master, whereas the checked-out branch is main.
- No Vercel project/config, Docker compose, database migration deployment job, rollback procedure, worker service manifest, or alerting/backup config was found.
- README setup directs developers to migrate dev and Docker Compose, but no compose file exists and there is no seed script in the repository.
- Email SMTP has a provider implementation, but this audit did not inspect environment values or send mail.
- MT5 bridge code expects a local terminal/Python environment; docs propose Windows worker hosting, but no runnable worker deployment exists.
- No health/readiness endpoint for the entire application or worker was found. Account-specific monitoring status routes are not equivalent to deployment health checks.
- GitHub branch protection, Vercel environment separation, backups, secret storage, production DB region, and rollback behavior are external settings and were not verified.

## 14. Documentation and product readiness

Documentation does not consistently describe the current code. Older known-limitations/authentication docs say verification/password reset or monitoring code is absent even though partial implementations now exist. Conversely, README and product/architecture docs describe commercial/global prop-firm goals while architecture sections still state real payments and production MT5 monitoring are out of scope. The CI baseline labels itself complete while also saying it has not run and the named workflow file is Markdown.

The Beginner/Pro/Expert catalog and rules are not guaranteed by seed data or code-level product contracts. Operations must define and create product pricing, account sizing, ruleset mapping, drawdown/timezone semantics, retry/re-purchase policy, payout rules, refund policy, and what “funded” means before these values can be trusted.

## 15. Prioritized remediation roadmap

| Stage | Work | Effort | Dependencies |
|---|---|---|---|
| P0 | Remove destructive test-to-production path; enforce a separate allowlisted test DB in every runner. Replace simulated payment success before any paid launch. Encrypt/rotate all MT5 credentials written by legacy routes. Correct rule math and immutable ruleset enforcement before relying on any pass/fail result. | XL | Test DB, payment provider, credential key/rotation plan, product rule definitions. |
| P1 | Fix product-to-ruleset binding, allocation purpose/size, evaluation reuse and activation route behavior; make funded-account creation/linking and payment ledger transitions atomic/idempotent; wire real monitoring and broker-side suspension/termination. Add regression coverage for all state transitions/concurrency. | XL | P0; DB migrations; broker hosting/API decision. |
| P2 | Add API pagination/limits, enforce ownership on idempotency keys, make coupon cap atomic, secure draft reads, add database indexes/unique constraints, and align response/error contracts. | L | API compatibility policy; query-plan data; migrations. |
| P3 | Deploy bounded worker concurrency, move SMTP to outbox/queue, centralize rate limiting/session revocation, add health/alerting/backup/restore drills, and measure route/query/bundle performance with safe staging data. | L–XL | Hosting, queue/rate-limit/session store, operations owner. |
| P4 | Complete checkout/admin/payout UX, correct currency formatting/accessibility, add current setup/product/runbook docs, and clean lint debt. | M–L | Product decisions and stable APIs from P1/P2. |

## 16. Decisions required from the product owner

1. Which payment provider, currencies, refunds, cancellations, and chargeback rules are in scope?
2. Are Beginner, Pro, Expert, Direct Funded, and payouts launch products? What exact rules, prices, account sizes, retries, and eligibility apply?
3. Define daily-loss timezone/rollover, whether floating PnL counts, commissions/swaps, static vs trailing drawdown, minimum completed trading days/trades, and treatment of stale broker data.
4. Which broker/MT5 accounts are supported, who owns the Windows terminal/worker, and what are monitoring frequency, outage, and suspension requirements?
5. Must email verification precede login, checkout, or account allocation?
6. What is the operational source of truth for account suspension, termination, payout approval, and broker-side access revocation?
7. What are the test DB host allowlist, production deployment/rollback owner, backup/restore objectives, and required CI branch protections?

## 17. Areas not audited or blocked

- No production/test database target was verified; no database reads, writes, migrations, or DB-backed tests were run.
- No payment provider, email service, broker, or MT5 terminal was contacted. No trades, payments, or emails were sent.
- No browser visual/accessibility walkthrough was performed; frontend findings are static source review plus lint.
- No production Vercel/GitHub settings, branch protections, deployed headers, DNS, secrets configuration, database backups, or monitoring alerts were inspected.
- No cold/warm route benchmark or production-shaped load test could be performed.
- No dedicated dependency/secret scanner was installed or used. Environment files were not opened, and no secret values are reproduced.
- Git-history secret scanning was not established as exhaustive; only source-level review and available tooling inspection were performed.

## 18. Validation commands and results

| Check | Result |
|---|---|
| Git baseline | main, commit 1b55fab28c22e0ce3abc2d108d404874e5a6bd05, clean at start, one commit ahead of origin/main. |
| pnpm exec tsc --noEmit | Passed, exit 0. |
| pnpm exec eslint app lib tests | Failed, 4 errors and 122 warnings. |
| pnpm lint | Failed, 71 errors and 254 warnings; command also scanned a nested worktree. |
| Safe selected monitoring unit tests | 118 passed, 1 failed, 119 total. |
| pnpm exec prisma validate | Blocked by missing DATABASE_URL; no database connection made. |
| Database-backed tests / full pnpm test | Not run because suites can write/truncate and safe target was not verified. |
| Build / migrations / provider tests | Not run to preserve generated files and avoid external side effects. |
| Dependency vulnerability scan | Not run; no local scanner was available. |

## 19. Go/no-go

**NO-GO for public launch, paid orders, or real trading accounts.** F-01 alone makes the documented test process unsafe for a shared/production database. Payment is simulated and client-declared; the UI checkout is incomplete; rule calculations and lifecycle transitions can misallocate accounts or produce false decisions; MT5 credential storage is inconsistent; and there is no deployed monitoring/CI/rollback boundary.

**Conditional internal demo only:** use mock data and an isolated disposable database, do not treat order/evaluation/payout states as financial truth, and do not use real MT5 credentials or production records.