# MASTER AUDIT AND PROJECT STATUS ó Funded Experts

## A. Executive summary
- Next.js 16.3.5 / React 19.2.8 / TypeScript 5 / Prisma 6.19.3 / PostgreSQL (Neon).
- Unit suite: 77/77 passed. Production build: passed. TypeScript: no errors. Lint: 0 errors (64 warnings, mostly unused vars in tests).
- Prisma schema valid. DATABASE_URL present in .env.local.
- Build succeeded after stopping a locked node process.
- External blockers: real crypto payment provider unselected; MT5 connectivity unverified; email SMTP not configured (console mode).
- Dev DB reconciliation incomplete per docs.

## B. Feature matrix (summary)
- Public website routes present (homepage, catalog, programs, pricing, rules, faq, etc.) ó IMPLEMENTED_UNVERIFIED.
- Auth (register/login/logout/JWT) ó IMPLEMENTED_UNVERIFIED (unit tests exist).
- Catalog API ó VERIFIED (catalog-api.test.ts).
- Orders/payment state machine ó VERIFIED (unit tests).
- Account assignment/evaluation/funded accounts ó IMPLEMENTED_UNVERIFIED (extensive tests).
- Admin ó IMPLEMENTED_UNVERIFIED.

## C. Test matrix
- npm run test:unit ? 77/77 passed.
- npm run lint ? 0 errors.
- npx tsc --noEmit ? pass.
- npm run build ? pass.

## D. Compatibility
- Node v24.19.0 (project targets ^20 types; runtime newer). Prisma 6.19.3.
- Browser/E2E not run (no Playwright configured).

## E. Performance
- Not measured in this pass.

## F. Security
- Lint clean. Security headers present. Deeper audit not executed.

## G. Database
- Schema valid. Migration replay not run (no disposable DB). Dev DB not touched.

## H. UI
- Build passes. Visual audit not performed.

## I. External dependencies
- Neon dev branch, Gmail SMTP, crypto provider, MT5.

## J. Prioritized backlog
- P0: verify dev DB isolation before migrations; select crypto provider; MT5 connectivity.
- P1: run DB migration replay on disposable DB; E2E browser tests.
- P2: performance/load testing; a11y audit.

## K. Release readiness
- Local dev: ready. Internal QA: partial. Private beta: not ready. Public beta: not ready. Production: not ready.

## Update 2026-10-21
- DB-backed tests blocked by test-db-guard requiring local PostgreSQL (remote Neon test branch refused).
- No Playwright available; browser E2E not run.
- Build/typecheck/lint/unit verified.

## Update 2
- No local PostgreSQL service found; DB tests remain blocked.
- No Playwright available; browser E2E not run.
- Independent verification: payment-state-machine lint fixed; unit suite green.

## Verification update ‚Äî 2026-10-21 (test infrastructure and payment idempotency)

### Changes in this batch
- Added an isolated PostgreSQL 16 service job to GitHub Actions. It uses a fresh job-scoped database, applies migrations twice, checks migration status and schema drift, then runs the guarded database suites. The database service is discarded with the CI job.
- Added a second safety layer after URL/host allowlisting: a read-only connection preflight checks PostgreSQL's observed database name, role, server address, version, and port before any migration or database test starts. The local bootstrap runs this through a child process so the CommonJS test runner does not depend on unsupported top-level await.
- Routed the payment integration suite through the same guard. Added database integration scenarios for concurrent duplicate webhook delivery, unpaid-order activation rejection, no duplicate event/account allocation records, and transaction rollback when the audit write fails.
- Fixed a confirmed webhook replay defect: a previously recorded identical event is now recognized before checking the order's later state; conflicting reuse of an event ID is rejected. The unique event insert now uses PostgreSQL conflict-safe insertion, and the raced duplicate is verified against the stored event before returning success.
- Added pure tests for payment-event identity comparison and database identity validation.

### Checks actually executed
- TypeScript: passed (`pnpm exec tsc --noEmit --incremental false`).
- Database safety: passed, 9 guard tests plus 8 runner/cleanup safety tests (`pnpm test:safety`).
- Database identity unit tests: 4/4 passed.
- Payment verification/idempotency unit tests: 9/9 passed with test mode enabled.
- Database-free test suite: 78/78 passed (`pnpm test:unit`).
- Full ESLint: 0 errors, 64 warnings. Targeted ESLint on changed TypeScript/JavaScript files: passed with no errors.
- `git status` and `git diff --check` could not inspect this checkout: Git blocks the repository due its dubious-ownership safeguard. No ownership or trust setting was changed.
- Production build not run because it writes into the existing `.next` directory, which contains user/recovery artifacts.
- No database connection, migration, seed, cleanup, payment provider call, email, or broker action occurred in this local session.

### Remaining verification blockers
- The new GitHub Actions database job is configured but has not run here. Migration replay, schema parity, the payment integration scenarios, database concurrency behavior, and transaction rollback therefore remain unverified against PostgreSQL until that CI job completes.
- No Playwright, Puppeteer, Cypress, or browser runtime is installed in the project. Browser E2E tests were not added or run; add a project-local browser test dependency and obtain an approved browser runtime before preparing and executing those journeys.
- Git inspection still requires the repository owner/administrator to restore safe ownership or provide an approved checkout. Do not bypass the safeguard.
- The existing development Neon database remains untouched and is not used by the new CI workflow.


## Integration and database verification update ‚Äî 2026-10-21

### Neon development target
- `.env.local` contains a dedicated development database URL and the repository's explicit isolation confirmation. A secret-safe canonical comparison of host, port, and database name found it distinct from all configured application/production references. Sanitized target identity: Neon endpoint masked as `ep-***.c-6.us-east-2.aws.neon.tech`, database `neondb`.
- Added `pnpm db:dev:verify`, which validates the existing development URL guard before importing/constructing Prisma and runs only a read-only identity query. It suppresses connection details on failure.
- The identity query could not reach the guarded development database. No connected database identity, Neon control-plane branch metadata, or branch lineage was therefore confirmed. No migrations, seeds, application queries, or writes were run. Neon CLI/MCP access was unavailable; the existing Edge console inspection was blocked by the computer-use runtime's access/URL-safety checks.
- The previous update's phrase ‚Äúchecks migration status and schema drift‚Äù was inaccurate: the current CI workflow performs migration replay and status checks; the Prisma schema-diff step is intentionally omitted because the repository has a manually maintained partial index not represented in Prisma. No schema-drift result is claimed.

### Payment integration work
- Added a NOWPayments adapter behind the existing provider interface. It creates hosted invoices using the documented `POST /v1/invoice` endpoint, returns the validated HTTPS invoice URL, verifies recursively key-sorted HMAC-SHA512 IPN signatures, maps provider statuses conservatively, and translates signed order callbacks to the existing order state machine.
- Payment IPNs use provider payment ID plus status as a stable event key, so retries deduplicate while later status transitions remain distinct. The order-pay route now reserves the order-scoped unique event key transactionally before the external invoice request, preventing concurrent requests on separate application instances from initiating another invoice for the same order. The order stays pending until a signed `finished` callback with the stored order, quoted amount, and currency is reconciled; browser redirects and provider ‚Äúconfirmed‚Äù statuses do not mark it paid.
- Live provider selection remains disabled unless merchant approval, India/business eligibility, underpayment-policy confirmation, credentials, and HTTPS callback/return URLs are explicitly configured. `.env.example` contains placeholder names only; no live credentials are configured or printed. NOWPayments has not confirmed eligibility for an India-based simulated prop-trading merchant. Refund status requires manual review because the current order state machine has no safe refund transition. Invoice status polling is not wired: the hosted invoice ID is not the payment ID accepted by the documented payment-status endpoint. Uncertain invoice outcomes are reserved for manual/provider reconciliation rather than retried.
- No real provider request, payment, payout, or webhook delivery was performed. Adapter behavior was verified with mocked HTTP responses and locally generated test signatures.

### MT5/XM findings
- Existing admin inventory routes manually create MT5 accounts as `AVAILABLE`, protect credential storage, and require configured credentials before `IN_USE`; allocation is attached to paid-order/evaluation flow and monitoring selects eligible active assignments. The existing real adapter is a worker-side Python subprocess bridge to the MetaTrader 5 terminal, not an XM REST API.
- MetaQuotes' official Python integration supports terminal-mediated `account_info`, `positions_get`, `orders_get`, and historical order/deal reads. XM's official technical help requires the account ID, password, and exact server name for terminal login; no XM server-side account-data API was confirmed. An XM demo connection/server setup has not been verified here. Vercel/serverless is not the Windows terminal host this adapter requires.
- Manual MT5 adapter tests cover mocked subprocess responses, identity matching, credentials and error handling; no live account was accessed.

### Checks in this update
- TypeScript `pnpm exec tsc --noEmit --incremental false`: passed after the integration changes.
- Targeted ESLint for changed application, script, and test files: passed with no errors (one earlier run reported only unused-parameter warnings, then those were removed).
- NOWPayments adapter unit tests: 6/6 passed.
- Existing MT5 adapter tests: 53/53 passed.
- Database safety tests: 9/9 passed, including new coverage for the read-only development identity verifier's guard-before-client ordering.
- Full database-free unit suite: 79 configured suites; rerun exited successfully. No database-backed suite was run.
- Production build not run because existing `.next` directories contain preserved/recovery artifacts. Git status/diff remain unavailable due the existing dubious-ownership safeguard; no ownership or trust configuration was changed.

### Remaining blockers
1. Restore reachability to the already configured development Neon branch, then rerun `pnpm db:dev:verify`. Only after its actual identity matches the guarded target should migration status or any development-only database work proceed.
2. Obtain written NOWPayments confirmation that this merchant/jurisdiction/business is eligible, and verify merchant dashboard settings, especially underpayment handling. Do not enable live processing before that and an end-to-end provider verification.
3. Provision and verify a dedicated supported XM MT5 demo account/server and a continuously running Windows terminal/worker host. Until then, MT5 data remains unavailable and no monitoring result should be represented as live.
4. Resolve the repository-owner Git safety issue through the supported owner/admin workflow before relying on Git diff/status for review.

## Execution update ‚Äî 2026-10-21 (safe payment retry)

- Fixed a payment-start recovery defect: the order was reserved as `PENDING_PAYMENT` before the provider call, but a definite provider rejection left it stuck with no retry path.
- Payment attempts now have unique durable event IDs and claim the observed order state conditionally, so simultaneous retries cannot both start provider calls.
- A narrowly classified provider 4xx rejection (excluding request timeout and conflict) is recorded as `INITIATION_REJECTED` and moves a still-pending order to `FAILED`, where the existing state machine allows a new attempt. Timeouts, conflicts, 5xx responses, malformed success responses, and thrown network failures remain pending for reconciliation; they are never retried automatically.
- Added provider and route-contract regressions for safe versus uncertain outcomes.
- Checks: 80/80 database-free suites passed; NOWPayments adapter tests 7/7; payment retry regressions 3/3; TypeScript passed; targeted ESLint passed.
- `git status` remains blocked by Git's dubious-ownership safeguard. `git diff --check` could not run because Git did not treat this checkout as a usable repository under that safeguard. No trust or ownership setting was changed.
- No database connection, query, migration, seed, cleanup, provider request, payment, email, or broker operation occurred. Production build and browser verification were not run; existing `.next` recovery artifacts are preserved.
- Remaining payment work: no safe automated refund transition exists; under/overpayment and refunded events still need a reviewed reconciliation workflow. Live provider eligibility and credentials remain unverified/disabled.
