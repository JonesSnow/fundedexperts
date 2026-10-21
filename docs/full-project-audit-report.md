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

---

## 20. Local database and test infrastructure addendum — 2026-10-14

This addendum updates only the database test-safety and CI portions of the
historical audit. The original audit baseline and its unrelated findings are
preserved.

| Finding | Updated status | Evidence and remaining limit |
|---|---|---|
| F-01 — unsafe test reset path | **Source-level remediation implemented; runtime integration remains blocked.** The default test command runs database-free suites; legacy global resets exit before Prisma; every discovered database test/script Prisma client or CLI entry point is checked for the test bootstrap; cleanup requires a separate process-only confirmation before loading the test environment or Prisma. Guard and subprocess tests pass. | No PostgreSQL server or utilities are installed. No database target was connected, migrated, reset, or independently verified. |
| F-14 — CI/deployment controls | **Partially addressed.** `.github/workflows/ci.yml` is now a validation-only workflow that installs the frozen lockfile, generates Prisma Client, validates the Prisma schema, runs TypeScript/lint/database-free tests, and has no database credentials, migration, cleanup, or deployment. | Workflow structure received a dependency-free subset check because no YAML parser/actionlint was available; this is not full GitHub Actions schema validation. Deployment, rollback, branch-protection, and database-backed CI controls remain unverified or absent. |

The local PostgreSQL prerequisite remains unmet. An authorized operator must
install a supported local PostgreSQL release, provision distinct development
and disposable test databases, and independently verify their ownership,
server, port, and data-retention policy before running `pnpm db:test:migrate`
or `pnpm test:db`. No environment-file values were read for this addendum, and
no database, external service, or production deployment was contacted.

## 21. Production-first browser and catalog follow-up — 2026-10-14

The unauthenticated production site was inspected read-only at
`https://fundedexperts.vercel.app/`. Public pages returned HTTP 200 for `/`,
`/catalog`, `/pricing`, `/how-it-works`, `/faq`, `/rules`, `/policies`,
`/register`, `/login`, `/verify-email`, `/verify-email-pending`,
`/forgot-password`, and `/reset-password`. Requests to trader and admin pages
redirected to sign-in where access was required. No authenticated test
credentials were available, so those workflows and all admin actions remain
unverified. The mobile navigation and FAQ disclosure opened successfully;
no horizontal overflow was found at 390, 768, or 1440 CSS pixels on the
homepage, catalog, pricing, FAQ, and login pages.

| Observation | Evidence | Status |
|---|---|---|
| Public catalog API fails | `GET /api/products` returned HTTP 500 with an empty response body (`Content-Length: 0`) at `2026-10-14T21:44:37Z`. Its Vercel response identifier was `bom1::iad1::ctqw2-1792014276880-3ac183a9d7d7`. The matching function log reports Prisma `P2021`, `modelName: Product`, and missing object `public.ProductStage`. | Confirmed production defect and runtime missing-table failure. |
| Homepage plans are unavailable | The homepage displayed the retryable catalog-load error after its API request failed; pricing redirects to the same catalog journey. | Confirmed customer impact; product/pricing data could not be inspected. |
| Prohibited legacy label is served | Production rendered the legacy “DEMO VIEW” badge. The current worktree changes this copy to “Illustrative”; committed `HEAD` still contains the old text. This proves a difference from current worktree state, not the deployment SHA. | Confirmed production copy issue; local correction is not deployed. |
| Deployed code version | Vercel shows the Production deployment as Ready on `main`, linked to commit `6b94ad59fc714c4b32213710e8513f7452924ad9`. That matches local `HEAD` and `origin/main`; uncommitted worktree changes are not part of that deployment. | Confirmed deployment SHA and status. |
| Additional browser errors | Unauthenticated API requests returned 401 as expected. Repeated navigation during the inspection also triggered 429 rate limits; these were not treated as independent defects. | Expected/inspection-induced responses, not evidence of a persistent site-wide outage. |

The subsequent authorized, read-only provider inspection retrieved the
correlated Vercel function log and inspected Neon metadata using `SELECT`
queries only. No environment-variable values, credentials, database URLs,
customer records, or provider data beyond the identifiers and schema/migration
metadata below were retrieved.

During a local built-app UI smoke, the first navigation occurred before the
browser API fixture interception was installed. The local `/api/products`
handler emitted a sanitized Prisma `P2021` diagnostic with
`meta.table = public.ProductStage` at `2026-10-14T21:54:39Z`. Next.js reported
that `.env.local` was loaded, but its value and destination were not inspected
and the target had not been independently verified. This result is evidence
only about that unverified local runtime target; it is not evidence about the
Vercel deployment or Neon. No further local API/database requests were made.

The Vercel log confirms that the database connection used by the failing
function did not expose `public.ProductStage` to Prisma when that request ran;
this is the immediate cause of its `P2021` response. Independently, the
read-only Neon inspection showed project `fundedexperts`, branch `production`,
database `neondb`, schema `public`, with no `ProductStage` table. Its
`_prisma_migrations` history contained 12 completed rows and no row for
`20261013000000_product_domain_foundation`; the listed history ended at
`20260927000000_evaluation_starting_balance`.

The Vercel environment-variable list confirms that the secret named
`DATABASE_URL` is scoped to **Production**. The Vercel project Integrations
page reports no integrations installed. The value is write-only in the
dashboard; it was not revealed, copied, or otherwise inspected. Thus the
scope is confirmed, but no available metadata maps its target to the inspected
Neon project, branch, and database. The function log proves the function's
actual database connection lacked `public.ProductStage`; the inspected Neon
target independently has the same missing table and migration row. Whether
these are the same target remains unproven. Do not apply a migration to Neon
until an authorized operator verifies this mapping without disclosing the
connection string. If it maps elsewhere, inspect that target read-only
instead.

The repository migration
`prisma/migrations/20261013000000_product_domain_foundation/migration.sql`
creates `ProductStage` and adds product/evaluation relationships that follow
on from the existing `Product`, `RulesetVersion`, `Rule`, `OrderItem`,
`Evaluation`, and `Order` objects. It is present locally; its absence from the
inspected Neon migration history does not by itself prove it was never
partially applied or that the inspected Neon target serves Vercel.

The repository has 14 ordered migrations. The inspected Neon history had 12
completed entries through `20260927000000_evaluation_starting_balance`; the
next checked-in migrations are:

1. `20261013000000_product_domain_foundation` — builds on the existing
   `Product`, `RulesetVersion`, `Rule`, `OrderItem`, `Evaluation`, and `Order`
   objects. It adds product metadata and ruleset links, creates
   `ProductStage` with its product/ruleset foreign keys and unique/index
   constraints, adds evaluation links to stages/orders, adds an order-item
   product snapshot, and adds rule disposition/calculation fields.
2. `20261014000000_evaluation_integrity` — follows the product foundation
   chronologically and adds evaluation outcome/idempotency fields and a
   funded-account uniqueness constraint. It does not create `ProductStage`.

The catalog's immediate missing-table symptom maps specifically to the first
migration. If the inspected Neon branch is confirmed as Vercel's target, its
history indicates the foundation migration is not recorded as completed;
the live metadata query found no partial foundation objects among the
expected enums, columns, indexes, or constraints. This confirmation applies
only to the inspected Neon branch, not yet to Vercel's exact target. The
second migration is also later in the checked-in chain and must be included
in any `migrate deploy` plan.

### Migration SQL and data-impact review

The full SQL of
`prisma/migrations/20261013000000_product_domain_foundation/migration.sql`
was reviewed. It contains no `DROP`, `DELETE`, or `TRUNCATE`. It does perform
the following schema and data operations:

| SQL operations | Impact / preconditions |
|---|---|
| Creates `ProductCategory` (`BEGINNER`, `PRO`, `EXPERT`, `DIRECT_FUNDED`), `EvaluationStructure` (`THREE_STEP`, `FOUR_STEP`, `TWO_STEP`, `ONE_STEP`, `DIRECT_FUNDED`), `ProductStatus` (`DRAFT`, `ACTIVE`, `UNAVAILABLE`, `RETIRED`), and `RuleDisposition` (`REQUIRED`, `OPTIONAL`, `UNRESOLVED`). | Type names must not already exist as a partial application. Read-only metadata on the inspected Neon branch found none of these four enums. |
| Adds nullable `Product.code`, `category`, `evaluationStructure`, `denominationCurrency`, and `operatingRulesetVersionId`; adds non-null `status` with default `DRAFT`. Adds unique index `Product_code_key` and index `Product_status_isActive_displayOrder_idx`. | Existing Product rows logically receive `status = DRAFT`; other new fields begin NULL. The unique code index accepts multiple NULL values on PostgreSQL. The FK below relies on `RulesetVersion(id)`. No Product rows were inspected. |
| Adds `Product_operatingRulesetVersionId_fkey` from `Product.operatingRulesetVersionId` to `RulesetVersion.id`, `ON DELETE RESTRICT ON UPDATE CASCADE`. | Newly added references are NULL for preexisting rows, so those rows do not violate the FK. |
| Creates `ProductStage` with required `id`, `productId`, `stageKey`, `displayName`, `stageOrder`, and `rulesetVersionId`, plus timestamps; primary key `ProductStage_pkey`; unique indexes `ProductStage_productId_stageKey_key` and `ProductStage_productId_stageOrder_key`; index `ProductStage_rulesetVersionId_idx`. | New table starts empty; it does not create stages for any existing product. Requires existing `Product(id)` and `RulesetVersion(id)`. |
| Adds `ProductStage_productId_fkey` to `Product(id)` and `ProductStage_rulesetVersionId_fkey` to `RulesetVersion(id)`, both `ON DELETE RESTRICT ON UPDATE CASCADE`. | No preexisting stage rows are present in the new table to violate these FKs. |
| Adds non-null `Rule.disposition` with default `UNRESOLVED` and nullable JSONB `Rule.calculation`, then updates every existing `Rule.disposition` to `REQUIRED` when `isRequired` is true and `OPTIONAL` otherwise. | Existing Rule rows are updated in place; no Rule values or calculation contracts are backfilled. This is a real write across the Rule table and its lock/runtime cost depends on row count, which was not queried. |
| Adds nullable JSONB `OrderItem.productSnapshot`. | Existing order items remain without snapshots; this migration does not backfill authoritative product terms. |
| Adds nullable `Evaluation.productStageId` and `Evaluation.orderId`, unique index `Evaluation_orderId_key`, and FKs to `ProductStage(id)` and `Order(id)`, both `ON DELETE RESTRICT ON UPDATE CASCADE`. | Existing evaluations receive NULL references; multiple NULLs are permitted by the default PostgreSQL unique-index semantics. Requires existing `Evaluation`, `Order`, and newly created `ProductStage`. |

The inspected Neon branch has all referenced base tables:
`Product`, `RulesetVersion`, `Rule`, `OrderItem`, `Evaluation`, and `Order`.
Read-only column metadata confirms the relevant existing key/configuration
columns `Product.id`, `Product.isActive`, `Product.displayOrder`,
`RulesetVersion.id`, `Rule.id`, and `Rule.isRequired`. It does not have
`ProductStage` or the foundation's listed new columns; no foundation enum,
index, or constraint names were found. The migration history has no row for
the foundation. This is consistent with the migration being unapplied on
that inspected branch, not proof that it is Vercel's target.

The file has no explicit `BEGIN`/`COMMIT`; the recovery procedure must not
assume that a failed apply is fully rolled back. After any failure, inspect
both `_prisma_migrations` and the actual schema before deciding on recovery.
DDL locks, the full-table Rule update, row counts, and production traffic
impact have not been measured. A rehearsal and a reviewed operational window
are prerequisites, not optional assumptions.

### Subsequent migration dependency and chain risk

There is one later checked-in migration:
`20261014000000_evaluation_integrity/migration.sql`. It does not reference
`ProductStage`, the new Product columns, or any other object created by the
foundation, so there is no direct object dependency on the foundation. It
does depend on the preexisting `RuleEvaluation`, `RuleEvent`, and
`FundedAccount` tables and `FundedAccount.evaluationId`. Those objects are
created/added earlier in the checked-in chain (`20260920164647_init` and
`20260922130000_funded_account_lifecycle`).

However, Prisma `migrate deploy` processes all pending migrations in order,
so a normal deploy will apply both pending October migrations. The later SQL
adds `RuleEvaluation.state` (default `UNAVAILABLE`) and nullable
`sourceDataTimestamp`, nullable `RuleEvent.idempotencyKey` and unique index
`RuleEvent_idempotencyKey_key`, then unique index
`FundedAccount_evaluationId_key`. The nullable additions/default are
non-destructive, but the last unique index can fail if existing non-NULL
`FundedAccount.evaluationId` values are duplicated. The earlier
`20260923010524_phase20_business_readiness` migration explicitly dropped
`FundedAccount_evaluationId_idx`, and the later migration relies on the
uniqueness constraint without any data cleanup or duplicate resolution.
No production row-level duplicate check was run. Before applying the full
pending chain, an authorized operator must run a read-only preflight that
returns only whether/count of duplicates (not IDs or customer data), and
stop for review if any duplicate exists. Also verify the later migration's
new enum/column/index objects are absent or consistently applied before
retrying after any partial failure.

### Applicability and safety decision

The foundation SQL appears structurally compatible with the inspected
branch's required tables and columns, and the new foundation objects were not
partially present there. It does make intended writes (`Product.status`
defaults and the Rule disposition backfill), and it creates locks/indexes.
The full pending chain has an additional unresolved data-dependent unique
index risk. Therefore this is **not yet authorized or unconditionally
certified safe to apply in production**: first prove that Neon is the Vercel
target, rehearse on an isolated copy, measure/review the planned write and
lock impact, and check the later unique-index precondition. No customer
records were queried as part of this review.

**Controlled production recovery (not executed):**

1. An authorized operator must privately verify that the Production
   `DATABASE_URL` endpoint/database identifies the Neon `fundedexperts`
   project, `production` branch, and `neondb` database. The dashboard only
   shows the variable as a Production-scoped secret; it does not disclose
   target metadata. Use an approved private verification method and record
   only a yes/no match and resource identifiers, never the URL or credentials.
   Check whether any separately named direct-connection variable is used by
   the migration workflow and verify its target the same way.
2. Rehearse the complete pending chain on an isolated disposable target with
   synthetic or policy-approved sanitized data. Before scheduling production,
   run a read-only duplicate preflight for the later unique index; it should
   return only aggregate counts, never evaluation/account IDs:
   `SELECT count(*) AS duplicate_evaluation_keys, COALESCE(sum(n), 0) AS affected_rows FROM (SELECT count(*) AS n FROM "FundedAccount" WHERE "evaluationId" IS NOT NULL GROUP BY "evaluationId" HAVING count(*) > 1) AS d;`
   Stop for business review if either count is nonzero. Rehearsal must also
   measure migration duration/locks and confirm the result's catalog readiness.
   The migration does not create or publish products.
3. Before production execution, verify a provider-supported recoverable
   snapshot/restore point exists, its retention and restore permissions, and
   the exact restore/recovery steps. Record only the snapshot/branch identifier.
   Coordinate a write/change freeze appropriate to the restore point, since
   restoring it could discard writes made afterward.
4. If target mapping, rehearsal, duplicate preflight, and backup checks all
   pass, obtain explicit production-change approval. Apply only the
   repository's pinned `prisma migrate deploy` chain to that confirmed target.
   Do not use `db push`, reset, manual table creation, or `migrate resolve` as
   substitutes.
5. Verify migration history and every new object using read-only metadata
   queries. Confirm product publication/stage configuration through a
   separately approved read-only readiness check; do not invent or mutate
   prices, rules, or products. Then request/verify `GET /api/products` and the
   rendered catalog against the deployed code. A 200 response with an empty
   list is not proof that customers can discover a purchasable plan.
6. If the migration fails or leaves a partial schema, stop. Do not blindly
   retry or attempt destructive rollback. Capture the sanitized error, compare
   actual objects and migration history to the SQL, and prefer a reviewed
   forward repair. Use snapshot restore only under the approved recovery plan
   after accounting for writes since the restore point. If Vercel targets
   another database, do not migrate this Neon branch; repeat the read-only
   checks against the actual target first.

No migration, production configuration change, deployment, or production data
write was made. The local route's correlated 503 and structured sanitized
diagnostics improve failure handling and observability only; they do not
create the missing relation or restore catalog availability. The live catalog
therefore remains unrestored pending the target mapping and an approved
production migration or other target-specific remediation.

The local `/api/products` handler now returns a generic correlated 503 on
catalog query failures and records only a classified Prisma error and a
validated table identifier in structured logs. Database-free regression
tests cover P2021, verify the table identifier and classified code remain in
server diagnostics, and verify neither the identifier nor raw error details
are returned to public clients. These local changes, including the homepage
copy correction, are not production-verified and do not resolve the live
outage until safely reviewed and deployed. No production data, database,
email, or authenticated account was accessed or changed during this
follow-up.

### 22. Production recovery and migration review — 2026-10-14

The Vercel project Environment Variables list showed `DATABASE_URL` as a
secret scoped to **Production**. The project Integrations page reported no
installed integrations. The dashboard value is write-only; it was not
revealed, copied, or inspected. The Production scope is confirmed, but the
variable's endpoint/database cannot be mapped from the available dashboard
metadata to Neon project `fundedexperts`, branch `production`, database
`neondb`. The exact target question therefore remains open; no production
settings were changed.

On the inspected Neon `production` branch/database `neondb`, read-only
metadata queries reconfirmed the six base tables required by the foundation
migration (`Product`, `RulesetVersion`, `Rule`, `OrderItem`, `Evaluation`,
`Order`) and their key/configuration columns. `ProductStage`, the migration's
new columns, its four enum types, and its named indexes/constraints were
absent. Its `_prisma_migrations` table still showed 12 completed migrations
through `20260927000000_evaluation_starting_balance`, with neither
`20261013000000_product_domain_foundation` nor
`20261014000000_evaluation_integrity` recorded. These are facts about the
inspected Neon branch only until target mapping is proven.

The foundation migration has no destructive drops/deletes/truncates, but it
does default every existing Product to `DRAFT`, update every Rule's
disposition from `isRequired`, and add the listed schema objects. It creates
no ProductStage rows and does not publish or seed products. Even when the
missing-table error is removed, the public catalog may return an empty list
until legitimate offers are separately configured and published. The later
integrity migration has no direct dependency on ProductStage, but runs next
under normal `prisma migrate deploy`; its unique
`FundedAccount.evaluationId` index requires a read-only duplicate preflight.
The prior migration `20260923010524_phase20_business_readiness` dropped the
earlier non-unique index on that column, so uniqueness is not established by
the checked-in migration history. No row-level data or aggregate duplicate
query was run.

**Current decision:** Do not apply either migration yet. The schema prerequisites
and absence of partial foundation objects are verified for the inspected
Neon branch, but Vercel target mapping, the later uniqueness precondition,
rehearsal, backup/restore readiness, and actual product publication readiness
remain pending. Follow the controlled recovery checklist above only after
these prerequisites and explicit production-change approval.

Continuation verification used only database-free local checks:
`pnpm test:unit` passed (27/27 suites), `pnpm exec tsc --noEmit --incremental
false` passed, targeted ESLint passed for the catalog handler/helper/tests,
and `git diff --check` passed. No migration, database-backed test, local
database connection, deployment, commit, or push was performed. The existing
uncommitted worktree changes were preserved.

### 23. Autonomous engineering continuation — 2026-10-14

**Baseline:** The repository remains on `main` at
`6b94ad59fc714c4b32213710e8513f7452924ad9`, tracking `origin/main`. The
working tree contains many pre-existing uncommitted changes; none were
discarded. This continuation added only the order-notification isolation
fix/test and this report update. The earlier accidental local request through
ambient `.env.local` remains documented above and was not repeated.

**Production incident recheck:** A single unauthenticated GET of the live
`/api/products` endpoint again returned HTTP 500 (browser recorded a 500
resource failure at approximately `2026-10-14T22:25:25Z`). The production
outage remains unresolved. The Vercel secret `DATABASE_URL` was already
confirmed Production-scoped, but no available provider metadata exposes the
write-only target. The Neon console is labeled project `fundedexperts`,
branch `production`, database `neondb`; this target has not been proven to
match the Vercel runtime.

**Read-only Neon preflight:** The migration-chain key tables/columns and
absence of the foundation objects remain as stated in §22. A new aggregate-
only read-only query for duplicate non-NULL `FundedAccount.evaluationId`
values on the inspected Neon branch returned `duplicate_evaluation_keys = 0`
and `affected_rows = 0`. This does not establish the state of the Vercel
function's actual database unless target mapping is confirmed. No individual
rows or customer data were selected. No backup/restore changes or migration
rehearsal were performed; no verified existing disposable Neon branch was
available, and creating a provider branch/database was outside the approved
scope.

The Neon branch list showed only one project branch, `production`; there was
no existing isolated rehearsal branch. The production Backup & Restore page
showed a six-hour history window, with “No snapshots, no schedule set.”
Therefore no separately retained snapshot or scheduled backup was visible in
that view. The UI offered restore-to-point-in-time on the existing branch;
using it could rewind production writes made after the chosen point and is
not a rollback plan for this schema change. Backup retention beyond that
history window, point-in-time recovery guarantees, and restore permissions
were not independently established. Do not use the Restore or Configure
controls without separate approval.

**Migration/workflow target mapping:** `prisma/schema.prisma` configures only
`DATABASE_URL` for its datasource; it does not declare a separate `directUrl`.
The guarded local migration script maps `TEST_DATABASE_URL` to the Prisma
CLI's `DATABASE_URL` and also sets `DIRECT_URL` for compatibility. No
repository production migration workflow is configured. The exact Production
target remains blocked on a private, non-disclosing operator verification
method for the secret's resource identity. Do not apply either pending
migration until that is resolved.

**Additional local reliability fix:** Order creation commits its database
transaction before attempting the confirmation email. Previously, an email
provider failure could escape to the route's outer catch and return HTTP 500
after the order already existed, making a successful persistence operation
look failed to the customer. `app/api/orders/route.ts` now isolates this
ancillary notification through `lib/order-notification.ts`; delivery failure
or a thrown provider error is logged as a warning with the existing
correlation ID and order entity, while the successful order-creation response
remains tied to the committed order. No provider detail or message content is
logged. `tests/order-notification.test.ts` covers returned delivery failure,
thrown failure, and successful delivery; the explicit database-free unit test
manifest now includes it.

**Monitoring trust-boundary fix:** The admin monitoring route accepts
caller-supplied snapshots and has no authenticated provider-ingestion
signature or deployed trusted worker boundary. It could therefore persist
invented monitoring results in production. The route now rejects that manual
and mock ingestion with HTTP 503 in Production, while allowing it only in
known `development` or `test` environments; unknown environments fail closed.
`tests/monitoring/ingestion-policy.test.ts` covers production, development,
test, and unknown environment values. This disables an unsupported production
path; it does not add live broker ingestion.

**Additional source review:** The simulated payment confirmation endpoint
remains disabled with HTTP 503 and cannot accept client-declared payment
success. MT5 account create/update uses the credential-encryption boundary,
and the account response selectors inspected do not select the credential
field. Evaluation activation has an order-scoped transaction lock, trader
activation lock, `FOR UPDATE SKIP LOCKED` inventory reservation, purpose and
exact-size checks, purchased-snapshot/ruleset identity validation, and audit
records. Rule-engine logic reviewed in this continuation fails closed when
required input, freshness, or an explicit supported calculation is missing.
These are source-level observations and database-free tests, not live
operational verification. Authenticated user/admin browser workflows,
live broker ingestion, actual payment integration, and production migration
behavior remain unverified or intentionally disabled.

**Current verification:**

| Check | Result |
|---|---|
| `pnpm test:unit` | PASS — 29/29 database-free suites, including order notification and monitoring-ingestion policy regression tests. |
| `pnpm test:safety` | PASS — 7 database guard tests and 5 destructive-entry-point/subprocess safety tests. |
| `pnpm exec tsc --noEmit --incremental false` | PASS. |
| `pnpm lint` | PASS — zero errors, 94 existing unused-variable warnings. |
| Targeted ESLint for changed order route/helper/test/runner | PASS — no diagnostics. |
| `pnpm exec prisma validate` | PASS with a non-routable placeholder `DATABASE_URL`; schema validation only, no connection. |
| `pnpm exec prisma generate` | PASS — Prisma 6.19.3 client generation; no connection. |
| `pnpm build` | PASS — production build and static generation completed (56 pages), with `DATABASE_URL` overridden to a loopback port that cannot reach a database. Next.js reported the existing middleware-to-proxy deprecation warning. |
| `git diff --check` | PASS. |
| Production catalog GET | FAIL — still HTTP 500. |
| Database-backed tests, migration rehearsal, production schema repair | BLOCKED — no verified disposable rehearsal target; production target mapping and explicit operation approval still required. |

**Next checkpoint:** An authorized operator must privately verify whether
Vercel Production `DATABASE_URL` targets Neon `fundedexperts` /
`production` / `neondb` without sharing its value; establish an adequate
recoverable backup beyond the currently visible six-hour window; and approve
provisioning or identify an existing disposable rehearsal target. After the
ordered chain rehearsal and data/lock preflights, the production migration
still requires explicit approval. Only then can live endpoint and populated
catalog verification establish restoration. No production schema/data,
provider setting, deployment, commit, or push was changed in this continuation.

### Follow-up: enforce verified-email status in signed sessions

The audit's F-15 session concern was addressed locally at the shared session
boundary. `createSession` now refuses unverified identities and signs an
`emailVerified: true` claim only after the login route's database-backed
verification check. `getSession` validates the signed payload shape and
rejects tokens without that claim, including previously issued legacy tokens.
This makes all consumers of the shared session helper fail closed without
repeating checks across every protected route. Database-free regression tests
cover verified issuance, unverified issuance rejection, and legacy-token
rejection. The database-backed verification-flow test was updated to reflect
the fail-closed behavior but was not run.

This is a local source change only; it has not been deployed. Existing
production sessions will be rejected once this change is deployed, requiring
users to sign in again; login already checks `emailVerified` before issuing a
new token. No production authentication behavior was changed during this
continuation.

**Follow-up verification:** `pnpm test:unit` passed all 30 database-free
suites; `pnpm exec tsc --noEmit --incremental false` passed; targeted ESLint
for the changed session, login, test, and runner files exited successfully
with zero errors (four warnings in database-backed test files). `git diff
--check` passed. No database-backed tests or live service checks were run.

### Local catalog and ruleset API failure observed on 2026-10-15

The developer's local Webpack server started successfully with
`pnpm exec next dev --webpack`, and the homepage returned HTTP 200. The
server then logged HTTP 503 responses from `GET /api/products` and
`GET /api/rulesets`; the sanitized product log identified `public.ProductStage`
and `SCHEMA_TABLE_MISSING` (correlation IDs were visible in the local terminal
but are intentionally not repeated here). The UI routes themselves returned
200, which is not evidence that their catalog/rules data loaded.

Repository evidence confirms `ProductStage` is declared in
`prisma/schema.prisma` and created by
`20261013000000_product_domain_foundation/migration.sql`. Earlier checked-in
migrations create the prerequisite `Product`, `RulesetVersion`, and `Order`
tables. Both public API routes select nested product stages through
`PUBLIC_PRODUCT_SELECT`, so a missing `ProductStage` relation causes both to
fail. The API's `P2021` classifier maps that Prisma error to the sanitized
`SCHEMA_TABLE_MISSING` diagnostic; it does not suppress the failure as an
empty catalog.

**Root-cause status: ROOT CAUSE IDENTIFIED, REPAIR BLOCKED.** The runtime
evidence establishes that the database target used by this local server
cannot resolve `public.ProductStage`. It does not establish whether the
product-domain migration is unapplied, the configured target is not the
intended local database, the migration stopped partially, or the application
is pointed at another schema. No database connection, query, migration,
cleanup, provider action, or environment value inspection was performed in
this continuation. The existing migration file is not evidence that it was
applied to the local target.

**Safe recovery prerequisite:** an authorized operator must privately verify
that the configured target is the intended dedicated local database and
inspect its migration history/schema without sharing its connection value.
Only if that exact target is verified and approved for modification should
the operator use the repository's guarded migration procedure; do not create
an ad-hoc table or mark a migration applied to silence the error. Then verify
the migration history and `ProductStage` schema, and exercise both
`GET /api/products` and `GET /api/rulesets` against that same authorized
target. A successful empty response is valid only if the database contains
no published products; it is not proof that catalog data is configured.

**Additional auth hardening and validation (2026-10-15):** Registration
attempts previously cleared their in-process rate-limit counter on malformed
input and when the address was already registered. Those failure paths no
longer reset the counter; a successful account creation still clears it. A
database-free source-contract test covers the reset boundaries. The
rate-limiter remains process-local, so it is not a distributed production
control; shared rate-limit infrastructure is still required before treating
it as effective across serverless instances.

Validation after this follow-up: `pnpm test:unit` passed **31/31**
database-free suites; `pnpm test:safety` passed **7/7 guard tests and 5/5
destructive-entry-point/subprocess tests**; `pnpm exec tsc --noEmit
--incremental false` passed; `pnpm lint` exited successfully with **0 errors
and 94 warnings**; `git diff --check` passed. Database-backed tests, Prisma
queries, migrations, cleanup, and provider operations were not run.

The login handler now returns the same generic 401 response for missing
accounts, incorrect passwords, and suspended/inactive accounts after
comparable password work, avoiding disclosure of account existence/status
through its credential failure response. A database-free unit test covers the
shared response policy. `pnpm test:unit` now passes **32/32** suites;
TypeScript, targeted ESLint, and `git diff --check` pass after this change.

**Public ruleset visibility:** the public `/api/rulesets/[id]` and
`/api/rulesets/[id]/versions` reads now require both the ruleset and referenced
version to remain active as well as published. This aligns those legacy routes
with the catalog's publication filters. Pure database-free policy tests
verify the public Prisma filters; they do not establish live endpoint output.

**Order cancellation concurrency:** cancellation now uses a conditional
`updateMany` inside a transaction, requiring the order to remain in a
cancellable state and (for traders) to remain owned by the caller at the
moment of transition. A concurrent state change results in HTTP 409 instead
of being overwritten. Database-free tests verify ownership and state
predicates; no database-backed concurrency test was run.

**Account availability invariant:** the admin account-status route no longer
accepts an `adminOverride` escape hatch to mark an account `AVAILABLE` while
an active assignment exists. The route returns HTTP 409 for that conflict.
A database-free contract test protects the invariant. The override is removed
from this route; a similarly named field in the separate release flow is
unrelated and remains unchanged.

**Coupon redemption integrity:** order creation now atomically reserves a
coupon use inside the same transaction as creating the order. The conditional
update rechecks active state, expiry, discount percentage, and the usage cap;
if a concurrent redemption consumes the last use, order creation returns
HTTP 409 and creates no order. Transaction rollback releases the reservation
if order or usage creation fails. Database-free tests cover the generated
predicates; a database-backed concurrent redemption test remains unrun.

**Latest verification:** `pnpm test:unit` passed **36/36** database-free
suites; `pnpm test:safety` passed **7/7 guard checks and 5/5 destructive
entry-point/subprocess checks**; `pnpm exec tsc --noEmit --incremental false`
passed; full `pnpm lint` exited with **0 errors and 94 warnings**;
`git diff --check` passed. Database-backed tests and all database/provider
operations remain intentionally unrun. The catalog/ruleset target mismatch
remains blocked pending private target verification and authorization.

**Campaign checkpoint:** the guarded payment-confirmation route remains
disabled with HTTP 503 until a real provider callback is implemented and
verified; no simulated client-declared payment success was enabled. The local
catalog/ruleset APIs remain blocked on a privately verified database target
and its migration state. Password-reset proofs are hashed, expire, and are
consumed with a conditional single-use update, but existing JWT sessions are
not individually revoked by logout/password changes; durable revocation
requires a coordinated schema/session-store change and compatible deployment.
The process-local authentication rate limiter is not sufficient for a
multi-instance deployment. No real payment, payout, broker/MT5 ingestion, or
funded-account operation has been verified. These limits mean this work is
not a production-readiness sign-off.

**Auth notification failure visibility (2026-10-15):** thrown registration
verification, verification-resend, welcome, login-alert, password-reset, and
password-changed email dispatch failures are now recorded through the
structured logger with fixed error codes/messages and correlation IDs. Raw
exception details are not included, and successful account/password
operations are not converted into failures solely because notification
delivery could not complete. Database-free source-contract coverage protects
each dispatch boundary.

**Historical abuse-control findings rechecked (2026-10-15):** the current
forgot-password handler no longer clears its account rate-limit counter and
retains an independent resend cooldown. The order creation handler now
returns a conflict rather than an existing order when an idempotency key is
owned by another trader. Database-free contract coverage now protects both
behaviors. The limiter remains process-local; distributed throttling across
serverless instances remains a production blocker.

**Account status/allocation serialization (2026-10-15):** the admin account
status transition now locks the inventory row inside a transaction, checks
the active assignment while holding that lock, uses a conditional status
update, and writes its audit record in the same transaction. This serializes
the transition with the evaluation allocators, which also lock the inventory
row before assignment. The API now rejects non-object status bodies as
client errors. Database-free contract coverage verifies the lock/check/update
ordering; live concurrency behavior remains unverified without a verified
test database.

**Trader dashboard data and summary cards (2026-10-15):** the dashboard now
requires successful, correctly shaped orders, evaluations, and account
collections before treating them as loaded. It no longer presents permanently
unavailable balance/equity cards; the top summary instead shows recorded order
and active-evaluation counts, with explicit pending-payment qualification.
Database-free contract coverage protects the response checks and avoids
unsupported balance/equity claims.
## Account-inventory status integrity follow-up (2026-10-15)

A focused status-writer review found two unsafe API paths and one dormant repair path. The admin MT5 account PATCH previously changed status without serializing against account allocation or checking assignment consistency. The account inventory POST accepted `IN_USE` without an assignment and committed account creation separately from its audit row. The reconciliation helper repaired `AVAILABLE` accounts from a previously loaded snapshot without rechecking that state.

The account status endpoints now use a shared transition policy. Both admin status mutation routes lock the `MT5Account` row, inspect the active assignment while holding the lock, conditionally update the prior status, and record status audit data in the same transaction. Account creation rejects `IN_USE`; account creation and its audit entry now share one transaction, and a concurrent duplicate account number maps the existing Prisma unique constraint (`MT5Account.accountNumber @unique`) to HTTP 409. The reconciliation repair now locks and re-reads the account and active assignments before applying a conditional update and transactional audit. A source search found no in-repository route or script invoking `reconcile()`; external invocation is not verifiable here.

`tests/account-status-safety.unit.test.ts` now covers the shared state policy, status-route locking and transaction boundaries, the invalid account-creation state, and reconciliation revalidation. `tests/mt5-accounts.test.ts` now exercises the shared implementation instead of copied transition tables and corrects an assertion title that did not match its assertion.

**Validation (database-free):** `pnpm test:unit` passed all 39/39 registered suites; the focused status safety file passed 6/6 tests. `pnpm exec tsc --noEmit --incremental false` passed. Targeted ESLint passed with zero warnings on the changed TypeScript files. `pnpm lint` exited successfully with 88 repository warning entries and zero errors; the changed files have no targeted warnings. A direct whitespace scan found no trailing whitespace and confirmed final newlines. The regular Git status/diff checks remain blocked by Git's existing dubious-ownership safeguard, which was not bypassed.

No database connection, query, migration, seed, cleanup, application server, payment, email, or MT5 action was performed. No environment files were read. The target database and migration state remain unverified, so database-backed validation and launch readiness remain NO-GO. Existing payment, payout, live MT5 monitoring, and operational/session durability blockers documented above remain unresolved.

**Source anchors:** `app/api/accounts/[id]/status/route.ts:66-103`; `app/api/admin/mt5-accounts/[id]/route.ts:180-239`; `app/api/accounts/route.ts:123-214`; `lib/mt5-account-status-policy.ts:1-28`; `lib/reconciliation.ts:76-130`; regression contracts in `tests/account-status-safety.unit.test.ts:1-90` and policy-backed tests in `tests/mt5-accounts.test.ts:222-285`.

## Read-only Neon target verification (2026-10-15)

After the development server log showed `SCHEMA_TABLE_MISSING`, the local `.env.local` target was inspected without displaying credentials or query parameters. A read-only PostgreSQL transaction reported database `neondb`, schema `public`, `transaction_read_only=on`, and no `public.ProductStage`. The target's `_prisma_migrations` table has 12 completed migrations, ending with `20260927000000_evaluation_starting_balance`; neither `20261013000000_product_domain_foundation` nor `20261014000000_evaluation_integrity` is recorded. This confirms the schema gap on the target currently configured for local development.

The ignored `.env.test.local` also points to a remote Neon endpoint and database name `neondb`, with a different host from `.env.local`. This does not establish that it is disposable. `docs/test-environment.md` requires local, isolated development and disposable test databases; the current remote targets do not meet those documented prerequisites. No test database was contacted.

The Neon Console could not be inspected in this session: the computer-use helper stopped because it could not confidently identify the active browser URL. The relationship between the configured development endpoint and the previously inspected Neon `production` branch therefore remains unverified. No migration was run. Do not apply the two pending migrations until the owner identifies the intended development branch and confirms it is approved for schema changes; the migration chain also backfills existing `Rule` rows and adds uniqueness constraints, so it must be rehearsed against an isolated copy first if the target may contain retained data.

**Database-free validation rerun:** `pnpm test:unit` passed 39/39 suites; `pnpm exec tsc --noEmit --incremental false` passed; `pnpm lint` exited 0 with 88 warning entries and no errors. The live catalog remains blocked on the unverified database target and unapplied product-domain migration.

## Authentication rate-limit memory bound (2026-10-15)

The process-local authentication limiter previously retained a map entry for each distinct key. Expiration cleanup also scanned the full maps whenever their size exceeded 1,000, so a high-cardinality request stream could cause unbounded memory growth and repeated linear scans. `lib/auth/rate-limit.ts` now prunes at most once per minute and caps both the attempts and cooldown maps at 20,000 entries per process. New keys are rejected when a map is full; existing keys continue to use their recorded state. The cap bounds process memory and sweep frequency but does not provide shared rate limits across serverless instances. A full map can temporarily reject legitimate new keys, so durable distributed throttling remains a production requirement.

`tests/auth-rate-limit-capacity.unit.test.ts` fills both maps, verifies overflow is denied without displacing existing entries, and verifies new keys can enter after capacity is freed. **Validation:** `pnpm test:unit` passed all 55/55 database-free suites; `pnpm exec tsc --noEmit --incremental false`, targeted ESLint, and full `pnpm lint` passed. Full lint reported 73 warnings and zero errors; a direct whitespace scan found no trailing whitespace. Git status and diff inspection remain blocked by the existing repository ownership safeguard, which was not bypassed. No database connection, migration, email, payment, broker, or production operation was performed.

## Rule-engine finding reconciliation (2026-10-15)

The source now differs from the original F-06 through F-09 findings in several important ways. The pure rule engine evaluates daily loss from explicitly supplied daily PnL components, counts distinct completed trades as an `INCOMPLETE` progress state below the minimum, evaluates trading hours and allowed symbols from provider activity events, and requires an explicit historical peak for trailing drawdown. The published-ruleset add, update, and delete handlers now require DRAFT status inside serializable transactions; add-rule also rechecks status inside its transaction. Database-free tests cover these behaviors. The original findings should therefore not be read as proof that the current pure rule calculations still perform the original fail/pass errors.

That code-level improvement does **not** establish a usable live evaluator. The current Python MT5 bridge requests only the last seven days of deal history and does not emit the explicit `dailyPnl`, `activityEvents`, `tradeHistoryComplete`, `activityEventsComplete`, `historicalPeakEquity`, or `equityHistoryComplete` inputs required by the rule engine. `normalizeSnapshot` defaults the completeness flags to false and those structured inputs to null. The current live adapter therefore cannot establish complete evaluation PnL, minimum-trade, trading-hours/session, or trailing-drawdown outcomes; those checks must remain unavailable rather than being treated as a pass. Provider history, timestamps, completeness, and peak-equity persistence remain launch blockers requiring a validated non-production MT5 data contract and database-backed verification.

## Prisma generation permission follow-up (2026-10-15)

The pinned Prisma CLI and `@prisma/client` are both 6.19.3, with the matching Windows engines already installed. The package-local generated client exists under pnpm's virtual store; its generated schema contains `ProductStage` and differs from the repository schema only in formatting alignment. The ordinary root `node_modules/.prisma/client` path is absent, consistent with pnpm's package-local layout. TypeScript passes against the existing client.

`pnpm prisma:generate` still fails on Windows. The first attempt failed with `EPERM` unlinking the existing client `index.js`. After a full 21-file, 89,454,648-byte SHA-256-verified backup was made at `C:\Users\Jacki687\Documents\Codex\FundedExperts-prisma-client-recovery-2026-10-15\client`, a reviewed write-escalation retry failed with `EPERM` renaming a temporary query-engine DLL into place. The original 21 client files remain byte-identical to the backup; the failed retry left one extra temporary engine file, which was preserved. The target file is not marked read-only, its inherited ACL grants Modify to Authenticated Users, no Node or pnpm process was running, and exclusive read-open succeeded. These checks rule out a simple read-only attribute or currently held file handle, but do not identify which Windows or sandbox layer denied the rename. Do not force-delete or replace these files. `pnpm exec tsc --noEmit --incremental false` passed after the retry, and the guarded `pnpm test:unit` passed 55/55 database-free suite files afterward. Prisma generation and the production build remain blocked by the unresolved Windows file operation. No database connection or migration was performed.

The CLI help confirms `prisma generate --no-engine` creates an Accelerate-only client, so it is not a valid workaround for this direct PostgreSQL application. A current schema search also found no durable session/refresh-token model or token-version field. The seven-day JWT remains stateless and logout only expires the browser cookie; a copied token remains valid until expiry. A durable revocation fix requires persisted session state and a compatible schema rollout. Do not substitute a process-local denylist, which would fail across serverless instances, or apply a migration before the database target is verified.

## Authentication rate-limit subject bound (2026-10-15)

Login and registration previously used the normalized, client-supplied email directly as an in-memory rate-limit map key before email validation rejected values longer than 255 characters. A client could submit many distinct oversized values and make the process-local limiter retain correspondingly large keys during its retention window. `createBoundedRateLimitKey()` now preserves valid-size subjects, maps oversized subjects to a short sentinel, and maps an empty subject to a bounded fallback. Both auth routes apply it before validation; login resets the exact same key only after successful password verification.

`tests/auth-abuse-protection.unit.test.ts` now verifies the maximum accepted subject boundary, oversized and empty inputs, and that login/registration use the helper before validation. **Validation:** the focused auth abuse test passed 4/4; `pnpm exec tsc --noEmit --incremental false` passed; targeted ESLint passed; and `pnpm test:unit` passed all 55/55 registered database-free suites. No database-backed tests or external actions were run. The current Edge browser could not be inspected because Windows automation returned `GetCursorPos failed: Access is denied (0x80070005)` on its initial read and the single permitted recovery attempt; the web browser tool also reported the production URL inaccessible. Git status remains blocked by the existing dubious-ownership safeguard and was not bypassed.

## Global rate-limit key normalization follow-up (2026-10-15)

The auth-specific key bound did not cover every limiter caller: authenticated routes build keys with dynamic resource IDs, which can be attacker-controlled route parameters. The shared limiter now normalizes every key before reading/writing either in-memory map, including cooldowns, resets, and diagnostic lookup. Keys up to 512 characters retain their existing identity; longer keys become a fixed-length SHA-256 identity, preserving per-key separation without retaining the original large string. The earlier login/registration subject bound remains in place so oversized email inputs share a short rejection bucket before validation.

`tests/auth-rate-limit-capacity.unit.test.ts` verifies oversized keys normalize to bounded, stable, distinct identities and that rate-limit/cooldown checks and resets use the same identity. **Validation:** focused auth safety tests passed 6/6; the full guarded database-free unit runner passed 55/55 suite files; TypeScript passed; targeted ESLint passed. Browser verification remains blocked because the Windows automation helper denied access to Edge state (`GetCursorPos failed: Access is denied (0x80070005)`) on its one recovery attempt, and the web tool could not access the production URL. Git status/diff remain blocked by the pre-existing dubious-ownership safeguard and were not bypassed. No database, production API, payment, email, or broker action was performed.

## Browser security-header baseline (2026-10-15)

`next.config.ts` previously had no application response headers. It now applies `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a strict-origin referrer policy, and a permissions policy that disables camera, microphone, and geolocation access. No CSP was added because the required script/style and integration source policy has not been verified; a restrictive CSP could break current Next.js rendering. `tests/security-headers.unit.test.ts` checks the configured values and is registered in the database-free suite. **Validation:** the focused test passed, TypeScript and targeted ESLint passed, and `pnpm test:unit` passed all 56/56 database-free suite files. The actual response headers have not been verified in a browser or on Vercel because browser access is unavailable. No hosting or database configuration was changed.

## Account-list credential minimization (2026-10-15)

The admin-facing legacy account-list route selected every MT5Account column, then removed the encrypted `credentials` value from the JSON response. Although the API did not return the ciphertext, it still loaded it into route memory unnecessarily. The route now shares an explicit Prisma select projection for both account listing and account creation responses; the projection contains the fields the response needs and excludes `credentials`. The administrative credential-storage tests now assert that both queries use this projection.

**Validation:** the focused credential-safety test passed; TypeScript and targeted ESLint passed; the full guarded database-free suite passed 56/56 files. No database, MT5 service, or production endpoint was used. The legacy query's live response compatibility was not verified against a database because the configured target remains unverified.

## Order-history pagination and dashboard summary (2026-10-15)

The authenticated order-list endpoint previously returned every order and all selected order items in one response. It now validates an optional page size (default 50, maximum 100) and an opaque, bounded cursor, applies stable descending `(createdAt, id)` keyset pagination, and fetches one extra row to determine whether another page exists. The list and aggregate summary (total count and counts by order status) are read in a repeatable-read transaction. The existing `orders` array remains in the response; `nextCursor` and `summary` are additive fields.

The order-history page requests 50 at a time, appends older records on request, exposes retry feedback, and tells users that status filters apply to the records loaded so far. The dashboard uses the aggregate summary for recorded and pending order counts while rendering only the recent order rows. Cursor validation and response-contract tests are in `tests/order-history-pagination.unit.test.ts`; the test is registered in the guarded database-free runner.

**Validation:** focused pagination/dashboard contract tests passed 5/5; TypeScript and targeted ESLint passed; `pnpm test:unit` passed all 57/57 database-free suite files. No database was queried. The Prisma schema currently has an index on `Order(traderId, status)` but not a composite `(traderId, createdAt, id)` index; pagination bounds response size, while index-level query optimization still needs a reviewed migration and a verified isolated database. The live order API and browser load-more interaction were not verified.

## Evaluation-history pagination and exact dashboard aggregates (2026-10-15)

Both trader and admin evaluation list endpoints previously loaded every matching evaluation together with nested rule results. They now use the shared bounded cursor parser (50 by default, 100 maximum), stable `(createdAt, id)` keyset ordering, and a `take + 1` query to determine whether more rows exist. Each endpoint returns the existing `evaluations` field plus `nextCursor` and a repeatable-read summary containing total count, counts by status, and the maximum recorded drawdown. The trader evaluation-history page supports append-only “Load older evaluations,” loading/error/retry feedback, and clarifies that the status filter covers loaded records. The dashboard requests the latest ten evaluations and uses aggregate counts and maximum drawdown rather than estimating them from the first page.

**Validation:** focused cursor/dashboard contract tests passed 6/6; `pnpm exec tsc --noEmit --incremental false` passed; full `pnpm lint` exited 0 with 73 existing warnings and zero errors; `pnpm test:unit` passed 57/57 database-free suites. The API/database behavior, database query plan, and browser interaction were not exercised. `Evaluation` currently lacks a composite `(traderId, createdAt, id)` index; creating one requires a reviewed schema migration after a disposable target is verified. Large rule-result collections per individual evaluation are still loaded as a unit and may require separate nested pagination if real data demonstrates growth.

## Admin account-inventory pagination (2026-10-15)

The admin account inventory list previously loaded every matching MT5 account. It now validates the shared cursor/page parameters, returns at most 50 records by default (maximum 100), and uses stable `(createdAt, id)` ordering with a repeatable-read count query. The existing `accounts` response field and filters remain; `totalCount` and `nextCursor` are additive. The admin inventory page shows how many records are loaded, preserves the applied search/status/purpose/broker filters while requesting older pages, and exposes loading and retry states. The shared projection still excludes the encrypted credential field.

`tests/account-inventory-pagination.unit.test.ts` covers the list contract; `tests/admin-mt5-credential-safety.test.ts` protects credential exclusion. **Validation:** focused tests passed; TypeScript passed; full lint exited 0 with 73 warnings and zero errors; `pnpm test:unit` passed 58/58 database-free suites. No database query or browser validation occurred. The account query still lacks a matching composite index for the pagination sort; adding and verifying one requires an approved migration against a verified isolated database.
