# Funded Experts — Master Project Audit

**Audit date:** 2026-10-13
**Repository:** `C:\FundedExperts\app`
**Audit mode:** Static/read-only review with database-free validation
**Change boundary:** This report is the only file created for this audit. No application source, tests, dependencies, schema, migrations, environment settings, or Git history were changed. No files were deleted.

## 1. Executive summary

Funded Experts is a Next.js application for presenting simulated prop-trading challenges, registering traders, creating orders, allocating MT5 account inventory, evaluating trading activity against versioned rules, and transitioning successful evaluations into simulated funded accounts. The repository contains real application routes and domain services for much of that workflow, plus recent work on the dashboard and test database isolation. Code presence is not evidence that these end-to-end journeys are reliable.

**Launch recommendation: NO-GO for paid public operation or real trading-account operations.** The payment endpoint can mark an order paid using a client-requested simulated success; the public catalog stops at creating a pending order; one evaluation rule path can mark a still-incomplete minimum-trade requirement as a failure; a legacy admin MT5 API stores credentials without the encryption used by the newer account API; and no runnable deployed monitoring worker or valid CI workflow was verified. These gaps affect payment integrity, customer entitlements, evaluation outcomes, and credential safety.

The prior `docs/full-project-audit-report.md` exists as untracked work and was preserved. This report rechecks the current workspace instead of treating that prior snapshot as authoritative. In particular, the current `scripts/run-all-tests.js` no longer calls the destructive reset script and initializes the guarded test environment; however, `test-reset.cjs` still directly reads `.env.local` and truncates tables, while `scripts/clean-db.js` remains an unguarded destructive utility. Likewise, the current `/api/accounts` handlers encrypt credentials, but `/api/admin/mt5-accounts` still writes credentials directly.

No database connection, migration, database-backed test, browser session, external payment/email/broker call, deployment, push, merge, or commit was performed for this audit. The test database could not be independently verified as disposable. The targeted database-free guard test passed, but one monitoring normalization test failed. See §8 for exact results.

## 2. Product goal and customer journey

The intended product evidenced by `README.md`, public pages, and domain/API modules is a **simulated evaluation and funded-account platform**, not proof of a live-money brokerage or a live MT5 service. The intended customer journey is:

1. Discover the product and available challenges.
2. Compare challenge prices, account sizes, and published trading rules.
3. Register, verify an email, log in, and recover a password.
4. View account, evaluation, order, and notification status in a trader dashboard.
5. Create an order and apply a coupon.
6. Pay through a verified payment process.
7. Allocate an eligible account from inventory.
8. Start an evaluation with an immutable ruleset snapshot.
9. Ingest trustworthy trading data and calculate rule outcomes.
10. Pass, fail, or suspend an evaluation/account based on defined rules.
11. Promote a passing evaluation through funded-account lifecycle states.
12. Review account history, notifications, and audit events.
13. Use payout functionality only if the product owner confirms that payouts are in launch scope.

### Journey completion matrix

| Journey stage | Current classification | Evidence and limitation |
|---|---|---|
| Public discovery | **Implemented but not verified** | `app/page.tsx`, `app/catalog/page.tsx`, `app/pricing/page.tsx`; active products are read through `/api/products`. No browser, content review, or live product data verification was performed. |
| Plans, pricing, rules, FAQs | **Partially implemented** | `app/pricing/page.tsx`, `app/rules/page.tsx`, `app/faq/page.tsx`, `components/product-showcase.tsx`. Product and ruleset data are administrative/runtime data; no code-level seed guarantees the advertised catalog. Public rule lookup can return an unpublished version, and rules can be added after publication. |
| Registration and account access | **Partially implemented** | Registration, verification, login, forgot-password, and reset-password routes/pages exist. Login issues a session even if `emailVerified` is false; the dashboard middleware redirects unverified users, but individual API routes do not consistently enforce verification. Email delivery was not tested. |
| Trader dashboard | **Partially implemented** | `app/dashboard/page.tsx` presents account/evaluation/order/activity states and explicitly labels unavailable metrics. The trader funded-account API includes a monitoring-result field, but the dashboard does not consume or verify balance/equity from it; it also does not derive a progress percentage from the available rule/actual values. The page and APIs were not exercised in a browser against safe data. |
| Order creation and coupons | **Partially implemented** | `app/api/orders/route.ts` creates pending orders and applies coupon usage. The catalog creates an order but does not initiate a real checkout. Caller-supplied ruleset version is not checked against the product’s ruleset; idempotency reuse is not scoped to the requesting trader. Coupon limits are read before the transaction and are vulnerable to concurrent overuse. |
| Payment and confirmation | **Broken for a commercial checkout** | `app/api/orders/[id]/pay/route.ts` accepts simulated payment methods and defaults `simulateSuccess` to true; no signed provider webhook or verified external payment was found. Order status and ledger creation are separate commits. |
| Account inventory and allocation | **Partially implemented** | Admin inventory APIs and transactional allocation exist. The primary `/api/orders/[id]/activate` → `lib/activation.ts` path calls `allocateAccount` with only `traderId`, so required purpose and product size are omitted; a separate `activate-evaluation` route does supply them. No concurrency test was run. |
| Evaluation lifecycle and rules | **Partially implemented / not safe to rely on for entitlement** | Evaluation models, rule records, snapshots, and transitions exist. Current calculation code has a premature minimum-trade failure path, a trading-session rule that returns `PASS` for any configured rule, time-window checks based on snapshot time rather than individual trade times, and drawdown based on the current snapshot rather than a historical equity peak. `MIN_TRADING_DAYS` is not a defined rule type. |
| Trading-data monitoring | **Prototype; live operation unverified** | Mock adapter, a Python/MT5 subprocess adapter, normalization, job/worker classes, and an admin processing route exist. The admin route accepts mock or caller-supplied snapshots. `worker/` contains only a worker environment example; no runnable worker entry point/deployment was found. No broker/MT5 connection was attempted. |
| Passing and funded-account lifecycle | **Partially implemented** | Service methods support eligibility, approval, activation, suspension, completion, termination, linking, and audit logging. `createFundedAccount` checks for an existing row before a separate create transaction and `FundedAccount.evaluationId` is not unique, so concurrent requests may create duplicates. Linking is not verified to reserve eligible broker inventory. |
| History, notifications, auditability | **Partially implemented** | Notification routes/UI, audit logs, email templates, and delivery records exist. Actual email delivery and complete event coverage were not tested. No user-facing payout route/model was found. |
| Admin operations | **Partially implemented** | Admin pages/API routes cover customers, account inventory, notifications, products, rulesets, and lifecycle operations. This is not a complete operations console for payments, real monitoring, support, payouts, backups, or incident response. |
| Payouts | **Not established as in scope; implementation not found** | Payout-related templates/enums exist, but no payout model or customer/admin payout API was found. Product owner decision required before counting this as a product gap or launch requirement. |

## 3. Repository and architecture overview

### Repository state

- Git root: `C:\FundedExperts\app`; branch `main`; audited `HEAD` `1b55fab28c22e0ce3abc2d108d404874e5a6bd05`.
- Local `origin/main` tracking reference reported the branch **one commit ahead and zero behind**. No fetch was performed, so this is a comparison to the locally cached remote-tracking ref, not a claim about the live remote.
- At the start of this audit, `git status` showed 51 modified tracked files and 7 untracked paths (58 status entries); there were no staged changes. The changes include dashboard/UI work, test database guard updates, and the prior untracked audit report. They are pre-existing user work and were not edited or cleaned up.
- `git worktree list` shows the main worktree and a registered detached worktree at `app/.kilo/worktrees/fortunate-crawdad` (HEAD `280c2ad625b6d9dff2685688fa304138ed717344`). It is an active registered worktree, not an accidental directory that can safely be removed without authorization.
- The parent `C:\FundedExperts` also contains `backups`, `logs`, `tools`, and `pre-sync-backup-20260929`. Their contents were not opened; they are outside the Git root and were left untouched.
- `.env.local` and `.env.test.local` are present. Their values were not read or printed. The build earlier in this session reported loading `.env.local`; Prisma CLI validation in this audit had no `DATABASE_URL` in its process environment and did not connect.

### Application structure and versions

- Next.js App Router, React, TypeScript strict mode, Tailwind CSS v4, Prisma/PostgreSQL.
- `app/app` contains public pages, trader/admin pages, and 46 API route handlers; shared UI is under `components/`; business and monitoring logic is under `lib/`; the Prisma schema and 12 migration directories are under `prisma/`.
- `lib/db.ts` currently provides a lazy, globally cached Prisma client. Domain services such as `lib/activation.ts`, `lib/allocation.ts`, `lib/funded-account.ts`, `lib/ledger.ts`, and `lib/monitoring-pipeline.ts` keep some business logic outside route handlers.
- `package.json` pins Next `16.3.5`, React `19.2.8`, and Prisma `6.19.3`; strict TypeScript is configured. `pnpm-lock.yaml` is present, but `package.json` has no `packageManager` field.
- Environment observed: Node `v24.19.0`, pnpm `12.5.1`. README specifies Node 20+ and pnpm 8+, while the checked-in CI example specifies Node 20 and pnpm 9. The production build succeeded earlier in this session under the observed environment, but this mismatch makes reproducibility worth formalizing.
- The repository is a single web application. The top-level `worker/` directory contains only `config/.env.worker.example`; monitoring classes inside `lib/monitoring/` do not by themselves establish a separately runnable or deployed worker.

## 4. Frontend and UI/UX assessment

### Strengths

- The existing dashboard is a real authenticated screen and now has responsive Tailwind layouts, explicit unavailable-data labels, loading/error/empty states, evaluation rule summaries, funded account details, activity, orders, and notifications.
- Shared UI components and design tokens exist in `components/ui/` and `app/globals.css`.
- Header navigation includes responsive desktop/mobile navigation, account menu, and logout controls.
- Login, registration, verification, recovery, catalog, pricing, rules, FAQ, and core admin routes are present.

### Gaps and risks

- There was no browser-based visual, mobile viewport, keyboard-only, or automated accessibility run. Responsive classes in source are not proof of responsive behavior.
- The catalog still uses page-local `gray-*` styling and a bespoke layout rather than consistently applying shared tokens/components.
- The dashboard correctly avoids inventing values, but its live balance/equity are unavailable and its evaluation progress cannot provide target percentages from current feed data. This is honest UX but incomplete product functionality.
- Product/error handling is uneven between pages: some forms expose retry/error states, while data-fetch fallbacks and feedback differ across screens. No e2e UI test runner is configured in `package.json`.
- The header fetches session data separately from the dashboard; requests and runtime behavior were not profiled.
- The admin UI is operationally thin relative to the backend surface; no comprehensive support, payment, payout, monitoring worker, or incident workflow was verified.

## 5. Backend, domain, and integration assessment

### Architecture and API boundaries

The application uses Next route handlers with Prisma and a shared client. There are services for order validation, activation, allocation, ledger entries, funded-account lifecycle, email, monitoring, and recovery/reconciliation. This is a workable monolith foundation, but authorization/validation conventions are repeated across many route handlers, and alternative endpoints implement overlapping activation/account workflows with different constraints.

### Payment and order integrity

- `app/api/orders/[id]/pay/route.ts` treats simulated payment as a success path with no environment gate or independent provider verification. This can produce paid entitlements without verified funds if exposed in a commercial deployment.
- `app/catalog/page.tsx` creates an order and reports success but does not route the customer into a real provider checkout. No provider callback/webhook path was found.
- The payment handler commits `Order.status = PAID` before separately creating the ledger entry. A failure between these writes leaves financial records inconsistent; the route logs ledger failure but does not reverse or reconcile the paid state.
- `app/api/orders/route.ts` returns a matching idempotency-key order without verifying that the order belongs to the authenticated trader. A key collision or known key can return another trader’s order metadata.
- A caller-supplied `rulesetVersionId` is checked for existence and `PUBLISHED` status but not for ownership by the purchased product’s `rulesetId`.
- Coupon maximum-use validation and the usage counter update are not an atomic conditional claim; concurrent orders can exceed the configured cap.

### Evaluation and trading rules

The code is present but not authoritative enough for customer pass/fail decisions:

- `lib/rule-engine.ts` reports `FAIL` for `MIN_TRADES` whenever the current count is below the minimum. `lib/monitoring-pipeline.ts` treats a required `FAIL` as an evaluation failure, so the normal pre-completion state can fail the evaluation.
- A configured `TRADING_SESSION` rule returns `PASS` without checking actual session/symbol constraints.
- `TRADING_HOURS` uses the current snapshot timestamp, not each order/deal time, so it does not establish whether trades occurred inside allowed hours.
- The MT5 adapter requests only a rolling seven days of history. Normalization sums deal `profit` only; daily grouping and commission/swap accounting are not reflected in the rule totals.
- `MAX_DAILY_LOSS` compares the absolute/positive realized-PnL amount to its cap, so gains can be treated as loss and the value is not necessarily a daily loss.
- Drawdown is computed using current balance/equity and starting balance, not a persisted historical equity peak; trailing drawdown cannot be safely inferred.
- Minimum trading days is absent from `RuleType`.
- The admin rule-creation route does not reject writes to already-published ruleset versions. Its public GET path resolves a version without requiring a published status.

### Account allocation and funded lifecycle

- `lib/allocation.ts` uses a transaction, row locks, and `SKIP LOCKED`, which is a useful concurrency foundation. Constraints are optional inputs.
- The main `/api/orders/[id]/activate` path calls `lib/activation.ts`, which calls allocation with only the trader ID. The separate `activate-evaluation` route supplies evaluation purpose and product size. This mismatch can allocate an ineligible inventory account on the main path.
- Funded-account creation is idempotent only by a read-before-create check; there is no unique constraint on `FundedAccount.evaluationId`, and the check is outside its create transaction.
- Funded-account linking changes the funded record and audit log transactionally, but the code path does not reserve/change the linked MT5 inventory assignment as a single invariant. Broker-side suspend/terminate behavior was not found.

### Authentication, authorization, and security

- Password hashing, signed HttpOnly/SameSite cookies, email verification, reset tokens, rate-limit helpers, and status checks exist.
- `login` returns a session for a correct password even when `emailVerified` is false. Middleware blocks unverified users from `/dashboard`; API authorization helpers generally check identity/role/status but not verification, so verification is not a consistent API gate.
- Sessions are stateless seven-day JWTs. Logout clears the browser cookie; no server-side session revocation/version check was found. A copied token can remain usable until expiry unless a route’s trader status check independently denies it.
- `lib/auth/rate-limit.ts` uses an in-process `Map`; limits reset on restart and are not shared across multiple instances.
- New `/api/accounts` routes call `encryptIfEnabled` for MT5 credentials. In contrast, `app/api/admin/mt5-accounts/route.ts` writes `credentials` directly and `app/api/admin/mt5-accounts/[id]/route.ts` updates it directly. The API responses omit credentials, but database-at-rest protection is bypassed through these legacy admin routes.
- `next.config.ts` does not define security headers. Whether hosting supplies equivalent headers is unverified.
- The `GET` rules route exposes version rules without checking version publication status. This can reveal draft rules; POST can mutate a published version, undermining ruleset immutability.

### Monitoring and MT5

- There are mock and real adapter implementations, normalization, eligibility checks, worker/scheduler classes, persistence, and retry/health helpers.
- `RealMT5Adapter` describes a Windows terminal + Python MetaTrader5 subprocess and decrypts credentials in the adapter boundary. This is implementation code, not proof that it is installed, configured, running, or deployed.
- The monitoring API includes mock/caller-supplied snapshot paths and is admin-gated. Those paths are useful for development/operations testing but do not constitute trusted live broker ingestion.
- The separate `worker/` directory has no executable source or deployment manifest. No live monitoring cadence, queue, worker health check, outage policy, or broker-side control was verified.

## 6. Security and data-integrity findings

| ID | Priority | Confidence | Verified issue and impact |
|---|---|---:|---|
| S-01 | P0 | High | `test-reset.cjs` reads `app/.env.local` and issues table-wide `TRUNCATE ... CASCADE`. If that file points to shared/production data, running the script causes irreversible data loss. `scripts/clean-db.js` is another raw-truncate utility without the dedicated test bootstrap. Current `run-all-tests.js` no longer invokes the reset and uses the guard, so the older report’s description of that runner is stale; the standalone scripts remain hazardous. |
| S-02 | P0 | High | `app/api/orders/[id]/pay/route.ts` accepts a client-specified simulated success and does not require a provider signature/transaction. In a paid deployment this permits a paid order without independent evidence of payment. |
| S-03 | P0 | High | `app/api/admin/mt5-accounts/route.ts` and `[id]/route.ts` persist submitted credentials without using the encryption boundary that `/api/accounts` uses. This creates plaintext-at-rest exposure through the legacy API. |
| S-04 | P0 | High | Required evaluation rules can produce invalid outcomes: minimum-trade shortfall returns `FAIL` before the evaluation period is complete; configured trading-session checks return `PASS` without enforcement; and daily-loss/drawdown inputs do not model the declared periods/peaks. Customers may be incorrectly failed or passed. |
| S-05 | P1 | High | Order idempotency lookup in `app/api/orders/route.ts` is not scoped to the authenticated trader. Reuse of a key can return another trader’s order record. |
| S-06 | P1 | High | Main activation path omits the product’s account purpose/size constraints. This can consume the wrong account inventory for an evaluation. |
| S-07 | P1 | High | Published ruleset versions can be mutated; unauthenticated version-rule GET does not require `PUBLISHED`. This weakens the customer’s expectation that the rules they bought remain fixed and exposes draft configuration. |
| S-08 | P1 | Medium-high | Funded-account creation uses read-before-create without a unique `evaluationId` constraint. Concurrent calls can create duplicate funded records for one passing evaluation. No concurrent DB test was run. |
| S-09 | P1 | High | Order ruleset-version selection is not bound to the product’s ruleset. A caller can create an order for one product with another published ruleset version. |
| S-10 | P2 | High | Login issues sessions to unverified users; middleware blocks dashboard pages, but API route helpers do not consistently enforce verification. Access policy is inconsistent across UI and APIs. |
| S-11 | P2 | Medium | Rate limiting is process-local and stateless JWTs are not revocable server-side; horizontal scaling or credential/session compromise reduces effective control. |
| S-12 | P2 | High | Coupon cap checking is not atomic. Concurrent requests can pass the same last-use check and oversubscribe a coupon. |

No exploit attempt was made. Findings are from source inspection only; severity reflects impact if the relevant route/configuration is exposed in the intended environment.

## 7. Database and test-safety assessment

- Prisma models cover traders, notifications, products, rulesets/versions/rules, MT5 accounts, monitoring jobs/snapshots, evaluations, funded accounts, assignments, rule results/events, orders/items, ledger entries, coupons/usages, audit logs, and email deliveries. No `Payout` model was found.
- The schema includes useful uniqueness/index constraints (for example trader email, product/account identifiers, rule version number, order number/idempotency key, ledger reference, and monitoring job indexes). It does not uniquely constrain `FundedAccount.evaluationId`.
- There are 12 migration directories, including two separately timestamped monitoring-persistence migrations. No migration was applied, no database was connected, and current database migration state/schema equivalence is **not verified**.
- The current `tests/support/test-env.ts` requires a dedicated test URL, keeps `.env.local` database URLs as comparison references, and repoints Prisma only after `withVerifiedTestDatabase` succeeds. All inspected DB suites import that setup. `tests/phase33-db-guard.test.ts` verifies rejection paths before mocked database work.
- Passing guard tests do not establish that a configured remote target is disposable. The guard uses markers/explicit host allowlisting plus identity checks; no external provider/database metadata was inspected to prove safe disposal.
- Database-backed tests and all destructive utilities were not run. Many integration/domain tests clean rows or tables and must remain blocked until an operator independently verifies a disposable database.
- `scripts/cleanup-db.ts` bootstraps the test guard before cleanup, but cleanup is still destructive. `test-reset.cjs` and `scripts/clean-db.js` should not be run in this environment.

## 8. Build, testing, and operations results

| Check | Result | Evidence / limitation |
|---|---|---|
| Git status, branch, worktrees, history | **Passed (read-only inspection)** | Root, current commit, cached remote tracking relationship, dirty-worktree counts, and nested detached worktree were inspected. No fetch or Git mutation. |
| TypeScript | **Passed** | `pnpm exec tsc --noEmit --incremental false` completed with exit code 0. |
| Scoped ESLint | **Failed** | `pnpm exec eslint app components lib tests`: 5 errors and 124 warnings. Errors include three `react-hooks/set-state-in-effect` findings (`app/reset-password/page.tsx`, `app/verify-email-pending/page.tsx`, `app/verify-email/page.tsx`), one `react-hooks/immutability` finding in `components/ui/modal.tsx`, and one `prefer-const` finding in `tests/email-provider.test.ts`. |
| Database guard unit test | **Passed** | `pnpm exec tsx tests/phase33-db-guard.test.ts`: 30/30 passed. This is a pure guard test and did not create a Prisma client or connect to a database. |
| Monitoring normalization unit test | **Failed** | `pnpm exec tsx tests/monitoring/normalize.test.ts`: 10 passed, 1 failed. `handles null accountInfo` expects `success === true`; implementation returns false because null account info is treated as critical. |
| Prisma schema validation | **Blocked by environment** | `pnpm exec prisma validate` failed with P1012 because `DATABASE_URL` was absent from the CLI environment. It did not connect. Environment values were not printed. |
| Production build | **Passed earlier in this session; not rerun for this audit** | The previous dashboard task ran `npm run build` successfully (Prisma client generation + Next production build). Not repeated because it generates build/client output and this audit is limited to the report deliverable. Next displayed the existing deprecated `middleware` convention warning. |
| Database-backed/API tests | **Not run — not safe to execute** | No test DB was independently verified disposable. |
| Full `pnpm test` | **Not run — not safe to execute** | It includes database-capable suites; guard presence does not independently establish a disposable database target. |
| Browser/responsive/accessibility tests | **Not run** | No browser/e2e/axe test was run. |
| CI workflow execution | **Not run / unavailable** | `.github/workflows/ci.yml` contains Markdown documentation rather than a runnable GitHub Actions YAML workflow. |
| Dependency vulnerability audit | **Not run** | No audit command or network call was made. |
| Migrations, cleanup, production integrations | **Not run — prohibited/unsafe** | No DB connection, migration, reset, destructive cleanup, payment, SMTP send, MT5 call, or deployment occurred. |

### Test and build readiness

There are 40 `*.test.ts` files. `package.json`’s `test` script runs a subset of them directly, while `test:safety`, `test:monitoring`, and `test:mt5-adapter` expose separate test entry points. Test-file count is not test coverage: no HTTP/browser journey or concurrency test was run, and the only executed functional unit suite had a failure.

The CI document currently describes a static and DB test pipeline, but because the `.yml` file is Markdown GitHub Actions will not execute it. `docs/ci-cd-baseline.md` and `README.md` therefore need to be checked against the actual runnable workflow before being treated as operational instructions.

## 9. Cleanup and repository-organization candidates

No cleanup was performed. The categories below are evidence-based review targets, not authorization to delete.

| Path | Classification | Evidence | Dependency / preservation risk | Recommendation | Confidence |
|---|---|---|---|---|---|
| `app/docs/full-project-audit-report.md` | **Keep** | Existing, untracked prior audit report; contains historical evidence and findings. | Deleting/overwriting would destroy existing user work and audit history. | Preserve unchanged. Link from the new master report and correct stale findings only in a future owner-approved update. | High |
| `app/.kilo/worktrees/fortunate-crawdad/` | **Keep** | `git worktree list` confirms it is a registered detached worktree with a distinct HEAD. | Git worktree metadata and possible unfinished work; it is not a disposable duplicate folder. | Retain. Owner can review and explicitly remove it later if no longer needed. | High |
| `app/test-reset.cjs` | **Keep, then harden or retire** | Explicitly reads `.env.local` and truncates tables with `CASCADE`. No safe direct target check. | Could be an operator workflow; removing it may break local tooling, but executing it can destroy shared data. | Remove `.env.local` fallback and require a separately verified disposable target plus fail-closed confirmation before any cleanup; otherwise retire after owner approval. | High |
| `app/scripts/clean-db.js` | **Keep, then harden or retire** | Executes table-wide `TRUNCATE` without importing the dedicated test bootstrap. | May be used manually or outside package scripts; no deletion without dependency/provenance check. | Apply the same fail-closed test-target gate or archive only after confirming no caller. | High |
| `app/scripts/cleanup-db.ts` | **Keep** | Uses `tests/support/test-env` before row/table deletion. | Still destructive after guard passes; guard does not independently prove remoteness/disposability. | Retain as test-only utility; require operator verification and keep it out of normal development/production paths. | High |
| `app/docs/known-limitations.md` | **Keep and reconcile** | It says email verification and password recovery are absent, while current routes/pages/templates exist; several other statements may be historical. | Removing it would discard useful history; stale statements mislead onboarding and audit work. | Update in a separately approved documentation pass with dated implemented/remaining status; do not delete. | High |
| `app/.github/workflows/ci.yml` | **Replace contents only after approval** | File content is a Phase 26 Markdown report, not workflow YAML. | Its path may be referenced by documentation but GitHub does not execute Markdown as a workflow. | Create a real workflow after defining safe DB CI policy; preserve the old report elsewhere only with explicit approval. | High |
| `app/components/ui/table.tsx.broken` | **Candidate for archive, not deletion yet** | Suspicious backup-like suffix; no runtime import was established in this audit. | Could be intentional recovery material or local work. | Confirm history/owner intent and references, then archive or delete only with approval. | Medium |
| `app/order-test-output.txt`, `app/phase33-full-output.txt`, `C:\FundedExperts\logs\order-test-output.txt` | **Candidate for archive/redaction review** | Filenames indicate generated test output/logs; contents were deliberately not opened because logs can contain sensitive data. | Could contain reproduction evidence or secrets; deleting/printing them could lose or expose information. | Have owner inspect locally; redact if needed, then archive/remove explicitly. | Medium |
| `app/.next/`, `app/node_modules/`, `app/tsconfig.tsbuildinfo` | **Keep as generated working state** | Build/dependency/typecheck artifacts are present. | Needed for local iteration and reproducible validation; not source cleanup. | Leave untouched during audit; regenerate/clean only under an explicit environment-maintenance task. | High |
| `C:\FundedExperts\backups`, `C:\FundedExperts\pre-sync-backup-20260929`, `C:\FundedExperts\logs`, `C:\FundedExperts\tools` | **Keep pending owner review** | Outside the Git root; names imply backup, logs, tools, or safety copies. Contents not inspected. | Could be recovery data or user tooling. | Do not classify as redundant or delete without provenance/retention review. | High |
| Phase reports under `app/docs/phase*.md` | **Keep pending targeted reconciliation** | Numerous dated phase reports capture implementation/audit history; current docs include stale assertions. | Deleting can remove requirements, decisions, or evidence used by later work. | Prefer a single current index/report and update only demonstrably obsolete claims in an approved documentation task. | Medium |

No dependency was proven redundant from the manifest. Lockfiles, migrations, tests, fixtures, environment templates, and operational utilities were intentionally preserved.

## 10. Completion and engineering-readiness estimates

These are planning estimates from static evidence, not measured KPIs or a formal product-owner-approved scope.

### Product completion: **35%** (planning range 30–40%)

Method: assess the customer-facing journey in §2; weight purchase, allocation, rule evaluation, and monitoring more heavily than informational pages; award full completion only when the behavior is both implemented and verified. The public shell, authentication flows, API surfaces, account lifecycle scaffolding, and dashboard raise the estimate. The missing real checkout, unreliable rule outcomes, incomplete allocation invariants, and absent deployable monitor keep the weighted estimate low. Payouts are excluded until confirmed in scope.

### Engineering readiness: **30%** (planning range 25–35%)

Method: weigh business/data correctness, security, test isolation, maintainability/type safety, and operational release readiness equally. Strict TypeScript, shared Prisma client, audit logging, encryption in the newer account API, and a tested DB guard are positives. Test/lint failures, hazardous legacy cleanup utilities, credential bypass in the admin API, absent executable CI, unreliable evaluation calculations, and unverified deployment/backup/monitoring keep readiness below a safe beta threshold.

### Significant professional-quality weaknesses

- **Data correctness:** payment, ledger, coupon, order/ruleset, account allocation, and funded-account creation do not share complete atomic/idempotent invariants.
- **Rules are product-critical:** current evaluator behavior does not yet prove that published restrictions are enforced correctly.
- **Authorization is inconsistent:** role/status checks exist, but email verification and idempotency ownership are not consistently enforced at API boundaries.
- **Operational completeness:** there is no executable CI workflow, worker deployment, health/alerting evidence, migration rollout/rollback runbook, or backup-restore proof in the repository.
- **Documentation drift:** `known-limitations.md`, CI documentation, and README setup/test claims do not all match the current route/test setup.
- **Validation debt:** 5 lint errors/124 warnings and one failing executed normalization test remain; no DB-backed or browser verification was safe/available.

## 11. Prioritized improvement roadmap

Every implementation task below requires explicit owner approval; this audit did not begin implementation.

| Priority | Work, impact, and relevant files | Dependencies / effort | Safe validation and acceptance criteria | Approval |
|---|---|---|---|---|
| **P0 — Test safety** | Remove `.env.local` fallback from `app/test-reset.cjs`; add the shared fail-closed guard to `app/scripts/clean-db.js`; review `app/scripts/cleanup-db.ts` and every destructive utility. Prevent accidental data loss. | Confirm owner-designated disposable DB and exact test entry points. **Medium.** | Pure tests with fake clients prove missing, production-equal, production-mode, and unmarked targets are rejected before client creation; inspect every script call path; do not execute against a real DB. Acceptance: no cleanup command can select `.env.local`/`DATABASE_URL` as target and rejects before Prisma work unless explicit test-only configuration passes. | **Required** |
| **P0 — Payment and ledger integrity** | Replace the client-driven simulated success in `app/api/orders/[id]/pay/route.ts` and `lib/mock-payment-provider.ts` with a selected provider’s signed, replay-safe callback; atomically and idempotently reconcile order and `lib/ledger.ts`. Disable simulation in production. | Product owner selects provider, currencies, settlement/refund policy. **Large.** | Provider adapter contract tests and mocked signature/replay/wrong-amount tests; production-mode requests cannot self-mark PAID; one valid event creates one paid transition and one ledger record. No real payment call during validation. | **Required** |
| **P0 — Trusted evaluation decisions** | Correct rule semantics in `lib/rule-engine.ts`, `lib/monitoring/normalize.ts`, `lib/monitoring-pipeline.ts`, and `lib/monitoring/real-mt5-adapter.ts`; freeze published rules in `app/api/rulesets/[id]/versions/[version]/rules/route.ts`. | Product owner defines timezone/rollover, realized vs floating P&L, costs, static/trailing drawdown, minimum days/trades, and missing-data policy. **Large.** | Database-free table-driven tests for boundaries, timezones, profitable/loss days, current vs peak equity, incomplete minimums, and configured session/symbol violations; published version mutations rejected; acceptance requires accurate fail/pass fixtures and explicit warning/unavailable result for missing inputs. | **Required** |
| **P0 — Credential storage** | Route `app/api/admin/mt5-accounts/route.ts` and `[id]/route.ts` through `lib/encryption.ts`, align validation and output policy with `app/api/accounts/`, and identify any already-plaintext records without displaying them. | Key provisioning/rotation and affected-data incident decision. **Medium.** | Mocked route tests assert ciphertext is persisted and responses/logs never include plaintext; no DB migration/query until authorized. Acceptance: all credential writes use encryption and key absence fails closed. | **Required** |
| **P1 — End-to-end checkout and order ownership** | Complete checkout UI in `app/catalog/page.tsx`/`app/dashboard/page.tsx`; scope idempotency in `app/api/orders/route.ts` to trader ownership; enforce product/ruleset relation and atomic coupon claim. | Payment decision from P0; product/pricing policy. **Large.** | Route unit/integration tests with mocked Prisma and provider; reject cross-trader idempotency keys and unrelated versions; exact coupon-cap race behavior. Acceptance: customer sees pending/paid/failed states and no order is reported paid without verified provider evidence. | **Required** |
| **P1 — Safe account allocation** | Use one activation path and pass server-resolved product size and `EVALUATION` purpose through `app/api/orders/[id]/activate/route.ts`, `lib/activation.ts`, and `lib/allocation.ts`. | Decide whether product account size means exact or minimum size; define reservation rules. **Medium.** | Mocked service tests cover mixed size/purpose inventory and concurrent allocation; DB concurrency verification only on a confirmed disposable DB. Acceptance: every activation selects only eligible inventory and rolls back atomically on failure. | **Required** |
| **P1 — Funded lifecycle uniqueness/reservation** | Make `createFundedAccount` idempotent under concurrency; add an appropriate unique constraint/migration for evaluation linkage; make funded-account linking and inventory assignment a single invariant. Review `lib/funded-account.ts`, Prisma schema, routes. | Requires schema/migration approval and lifecycle policy. **Large.** | Unit race simulation plus isolated PostgreSQL concurrency test after target verification. Acceptance: one funded record and one reserved account per approved evaluation, with transactional audit record and deterministic retry. | **Required** |
| **P1 — Operational monitoring** | Add a runnable, deployable worker entry point and bounded queue/lease/health lifecycle around `lib/monitoring/*`; keep mock snapshots clearly marked and prevent them from constituting verified live progress. | Select MT5 host/runtime, broker access, polling/freshness/SLA and outage behavior. **Large.** | Adapter contract tests and mock provider failure/retry tests; only later perform authorized demo-terminal integration. Acceptance: observable worker health, bounded retries, stale-data signaling, and explicit non-live mode until broker data is proven. | **Required** |
| **P1 — Consistent access policy** | Centralize user/session checks; decide verification gates for order, account, and notification APIs; scope every object lookup to owner; add server-side session revocation/versioning. Review `app/api/auth/*`, API helpers, `lib/auth/session.ts`, middleware. | Product policy for verification and session duration; possibly persistence service. **Medium/Large.** | Pure authorization tests and mocked API ownership cases. Acceptance: unverified/suspended/other-tenant cases are consistently denied; password reset/logout revoke existing session tokens according to policy. | **Required** |
| **P2 — Test reliability and coverage** | Retain guarded `tests/support/test-env.ts`; ensure all DB-capable runners/utilities use it; add missing customer-flow and concurrency tests. Fix the failing normalization test by reconciling the contract and implementation. | Independently verified disposable DB required for DB suite. **Medium.** | Pure tests run without DB; then DB-backed suite only on an operator-verified isolated DB. Acceptance: all registered tests are executed by an explicit matrix; no full-table cleanup can run against shared data; zero unexplained failures. | **Required** |
| **P2 — CI and static quality** | Replace Markdown at `.github/workflows/ci.yml` with a runnable workflow; make package manager/runtime versions explicit; resolve 5 lint errors and prioritize high-risk warnings. | Decide whether DB CI uses ephemeral DB or a dedicated safe service. **Medium.** | YAML syntax/action validation, frozen lockfile install in pinned Node/pnpm, TypeScript/lint/schema checks; DB job omitted until a safe isolated target exists. Acceptance: GitHub recognizes workflow and required checks pass on branch/PR. | **Required** |
| **P3 — UI/accessibility and documentation** | Verify public/customer/admin flows at desktop/mobile, keyboard and screen-reader states; unify catalog/page tokens; reconcile `README.md`, `docs/known-limitations.md`, `docs/ci-cd-baseline.md`, and phase docs. | Stable product language/data and approved scope. **Medium.** | Browser responsive checks, keyboard test, automated accessibility scan, links/content review. Acceptance: no fake live metrics or payment claims, documented unavailable states, current setup and launch scope agree with implementation. | **Required** |
| **P4 — Launch operations** | Add health/readiness, alerting, safe migration rollout/rollback, backup/restore runbook, secret rotation, incident response, and deployment controls. | Hosting/database/worker operators and release policy. **Large.** | Staging-only disaster-recovery and rollback drills; verify external configuration without production mutation. Acceptance: named owners, tested restore/rollback, operational dashboards and alert thresholds. | **Required** |

## 12. Launch blockers

Do not launch paid customer access or claim live funded-account monitoring until all of the following are addressed and verified:

1. No provider-verified payment settlement path; client-simulatable PAID state remains reachable.
2. Evaluation rule calculations can yield misleading customer outcomes; product semantics are not fully defined.
3. Main activation path does not enforce inventory purpose/size.
4. Legacy admin MT5 routes bypass credential encryption.
5. No executable CI workflow, safe DB verification process, deployed monitoring worker, or proven rollback/backup readiness.
6. Existing lint and test failures have no documented accepted waiver or resolution.
7. Public/admin ruleset behavior does not guarantee published-rule immutability or hide drafts.

The current product can be considered for a constrained internal/demo environment only with mock data clearly labeled, no real payment/account promises, and a separately verified disposable database.

## 13. Decisions requiring owner input

1. Which payment provider, currencies, fees/tax, refunds, chargebacks, and payment statuses are in launch scope?
2. What are the exact challenge plans, account sizes, pricing, retry/re-purchase policy, and product-to-ruleset version rules?
3. Define daily-loss timezone and rollover, whether floating P&L counts, treatment of commission/swap, static versus trailing drawdown, minimum completed days/trades, and stale-data policy.
4. What does “funded” mean in this simulated product? Which broker/account controls are required for activation, suspension, termination, and release?
5. Which MT5 runtime/host and monitoring frequency are supported, and who owns worker operation/outage response?
6. Must email verification be required for login, order creation, all APIs, or only dashboard access?
7. Are payouts part of the approved product scope?
8. Which database endpoint can be independently designated disposable for integration tests, and who owns CI secrets, backups, restore tests, and release approval?
9. Which local-only files/worktrees/logs/backups are active user work and which may be archived after this audit?

## 14. Audit limitations

- Source and configuration inspection plus limited database-free tests only; no database, migration, data cleanup, or database-backed route test.
- No `.env.local`, `.env.test.local`, worker environment, log contents, backup contents, or credentials were opened or printed.
- No external Git fetch, GitHub settings/branch protection review, hosting configuration review, production deployment inspection, or live service request.
- No browser rendering, mobile/keyboard/screen-reader, load/performance, or end-to-end customer journey test.
- Build result is from earlier in this session and was not repeated as part of this report-only audit; external deployment behavior remains unverified.
- Static evidence cannot prove that a service is deployed, that a remote database is disposable, or that a customer-visible product configuration matches code.
- Existing dirty changes and the detached worktree were preserved; the audit did not determine their ownership or intended final state.

## 15. Recommended next task

**After owner review and explicit approval:** implement a narrowly scoped P0 integrity-and-safety patch without changing product semantics beyond decisions the owner confirms.

Acceptance criteria:

1. Every cleanup/test entry point fails before creating a Prisma client unless a separately verified disposable test database is configured; no `.env.local` fallback or raw `DATABASE_URL` fallback.
2. Simulated payment cannot create a `PAID` order in a production configuration; no order is treated as provider-paid absent an authorized provider event.
3. Both legacy MT5 admin credential write routes use the same encryption/fail-closed boundary as `/api/accounts`.
4. Add database-free regression tests for those guards and routes; do not run database-backed tests until the operator independently verifies the target as disposable.
5. Run TypeScript, targeted lint, and production build where safe; report any remaining checks as blocked/not run rather than implied passing.
6. Preserve all other worktree changes; no commits, pushes, merges, migrations, cleanup, or deployment without separate authorization.

## 16. Website implementation and verification update — 2026-10-13

This dated addendum records the follow-up public-site and customer-journey work. It does not change the findings or historical evidence above.

### Implemented UI scope

- Reworked the public home page, pricing, rules, FAQ, and catalog pages around the existing simulated-evaluation product.
- Added a shared brand mark, responsive header/navigation, and footer; added a shared account-access shell for sign-in, registration, verification, and password-recovery pages.
- Restyled the dashboard to use the shared visual system while retaining its existing data and behavior.
- Product cards consume the active product catalog API. Rules content consumes active published ruleset data. Missing price, size, or rule terms remain explicitly pending; the screens do not invent tiers, prices, trading terms, payouts, reviews, or performance claims.
- The catalog action creates a pending order through the existing route and tells users that this is not payment confirmation or account allocation. No backend, payment, MT5, trading-rule, database, schema, or migration behavior changed in this UI work.
- No files were deleted.

### Browser and responsive verification

Rendered the home, pricing, rules, and FAQ pages in a desktop browser. The preview used a local proxy that supplied clearly labeled temporary product/rules data and a signed-out session; it blocked other API paths. No application database-capable API was called. Verified primary navigation and page links, reviewed product/rules pending states, and opened a native FAQ disclosure. The home hero and calls to action fit within the captured 1250×720 desktop viewport after adjusting the heading scale.

Responsive breakpoints and small-screen navigation were reviewed in the implementation, but this browser control did not expose viewport resizing; narrow-device rendering remains unverified. Screen-reader and automated accessibility scans were not run. The FAQ uses native disclosure elements and the mobile navigation supports keyboard dismissal.

### Validation update

- `pnpm exec tsc --noEmit --incremental false`: passed.
- Targeted ESLint on the changed UI TypeScript/TSX files: passed with no diagnostics.
- `pnpm exec next build`: passed and generated the application routes. Next.js emitted the existing middleware-convention deprecation warning.
- `pnpm build`: did not complete because its Prisma generation step hit a Windows EPERM rename while replacing a generated query-engine file. No existing generated file was deleted or overwritten by a cleanup command. The direct Next.js production build completed successfully.
- `git diff --check`: reports extra blank lines at EOF across many currently dirty files, including UI and unrelated test/utility files. This working tree contained user changes before this work; those lines were not normalized to avoid altering their work.
- No test suite, database connection, query, migration, seed, reset, cleanup, external payment, or deployment was run.

### Updated readiness

Planning estimate: product completion **40%** (range **35–45%**), updated from the 35% estimate above to credit the more complete public discovery, catalog, pricing, rules, FAQ, and account-access presentation. This remains a judgment estimate: an order can still be pending without verified payment or allocation, and rule/account operations remain unverified. Engineering readiness remains **30%** (range **25–35%**) because this UI batch did not resolve or validate the P0/P1 security, payment, rule-engine, account-allocation, test-database, monitoring, CI, or recovery blockers.

The launch recommendation remains **NO-GO for paid public access or live funded-account claims**. The UI now describes the simulated product more accurately, but product and operational launch blockers in §§11–13 remain open. The existing cleanup-candidate register is unchanged; every candidate remains preserved pending owner review.


## 17. Website transformation and product experience update — 2026-10-13

This addendum documents the wider public website and product-discovery work. It preserves prior findings and does not represent database-backed verification or a change to the underlying business rules.

### Implemented

- Reworked the home, catalog, pricing, rules, FAQ, account-access, and dashboard presentation; added How It Works and Policies pages, shared navigation/footer/brand/UI components, responsive product filters, and page metadata. Corrected duplicate site-name suffixes in route titles and fixed Rules page horizontal overflow at narrow widths.
- Added a catalog explorer that uses the existing active-product API and published-ruleset APIs. It presents returned prices and currencies, numeric configured account sizes, product descriptions, ruleset names, published rule values, version/status labels, and required/optional flags. It does not claim a size denomination where the API does not provide one. On the homepage, the hero offers and account-size selector share one in-memory product/rules snapshot; changing the selection displays that offer’s returned published values without a duplicate catalog request.
- Added category concepts for Beginner, Pro, Expert, and Direct Funded, but no backend product category exists. Categorization is a conservative exact-name match; unclassified products remain visible. Account structure text is explicitly presented as a concept inferred from product text and not proof of a purchasable stage plan.
- Catalog filtering supports category, size range, structure text, search, sort, and currency. Sorting and price comparison are restricted to a single selected currency; no currency conversion is invented. Order requests reuse the existing API and remain labeled pending, not paid or allocated.
- Reworked pricing and rules pages around current API fields and explicit missing-term notices. FAQ is searchable and grouped. How It Works separates existing application steps from unverified or unavailable payment, allocation, trading, evaluation, identity-review, and payout steps. Policies page discloses missing legal/support documents without inventing terms. Registration links directly to the unpublished Terms/Privacy and pending Risk publication statuses. Login now has a keyboard-accessible password visibility toggle.
- Added CSS layered-card/perspective treatments using HTML/CSS, with reduced-motion handling; no external image assets were introduced. Navigation uses semantic links, labeled controls, native FAQ disclosures, keyboard dismissal for mobile navigation, visible focus styles, and metadata.
- Added `docs/product-decision-register.md` to collect commercial/rule decisions and `docs/competitor-policy-research.md` for current competitor examples. The competitor policies are reference material only and are not copied into Funded Experts' rules or customer offer.

### Page coverage

| Page | Customer-facing sections |
|---|---|
| Home | Hero, four pathway concepts, dynamic active-offer cards, account-size explorer, four-step journey preview, comparison, rule transparency, product boundaries, FAQ preview, final CTA and simulated-product disclosure. |
| Catalog | Search/filter controls, each returned active product, configured price/currency/size, product text structure, associated published rules, pending-order controls, coupon validation and order-status disclosure. |
| Pricing | Dynamic active catalog, four-model concept comparison, price/payment/refund limitations and pricing FAQ. |
| Rules | Published ruleset/version values and required flags; 14 topic sections cover targets, losses, activity, risk, news, holding, strategy, identity, execution, appeals, glossary and applicability gaps. |
| How It Works | Twelve lifecycle steps, each with customer action, current platform state and blockers. |
| FAQ | 23 searchable answers across 14 requested categories using native disclosures. |
| Policies | Status register for terms, privacy, refunds, risk disclosure, support and appeals; unpublished documents are not fabricated. |
| Account access | Sign-in, registration, forgot/reset password, email verification and pending-verification screens. Password forms, feedback and verification states remain tied to existing APIs. |
| Dashboard | Existing order/evaluation/account status surfaces restyled; source reviewed for real data/unavailable states. Authenticated data was not browser-tested because the safe preview was signed out and all business API paths were blocked. |

### Product configuration coverage

- The schema, product/rules APIs and product documentation were inspected; no source-controlled product seed or exact supported-denomination matrix is present. Runtime active products and published rule values were not queried because database access was prohibited.
- The UI lists every active product returned at runtime and provides one selector option per returned numeric account size. Exact live account categories, denominations, prices, account currency, stages, and per-size terms remain unverified until an operator supplies a safe read-only product source. Proposed denomination ladders remain draft only in the decision register.

### Source-of-truth and product gaps

- No database was queried. Runtime active product names, exact configured prices/sizes/currencies, ruleset associations, and published rule values were not independently confirmed. The UI consumes those API responses at runtime and shows unavailable/error states if the APIs do not return data.
- Product API does not expose category, account-size denomination, stage mapping, or full product settings. Rules API exposes published rule values, but not necessarily the semantics needed to calculate them or every commercial term. Current UI labels these gaps and does not invent category/size availability, payment/refund, payout, or legal policies.
- Proposed size ladders and program structure in planning material remain product-owner decisions, not active offers. Competitor policies cited in the research note are not Funded Experts terms.

### Browser and responsive verification

- Browser verification used a localhost-only proxy with temporary mock products titled `QA sample`, rulesets titled `QA ... Rules`, and temporary descriptions. The proxy passes application HTML unchanged, intercepts only the public products/rules/session GET routes, and blocks all other API methods/paths. No order, payment, registration, verification, password, or other mutation was sent. The homepage selector was changed to the QA Expert offer and visibly updated its mock price/size, published ruleset/version, profit objective, and optional minimum-trades value.
- Checked home, catalog, pricing, rules, FAQ, How It Works, policies, login, registration, forgot-password, email-verification, and pending-verification screens. The signed-out dashboard route redirected to login; authenticated dashboard data was not exercised. Checked active-offer category/search filters, FAQ search/disclosure, published-rule rendering, mobile-menu open/focus/Escape-close, and login password toggle. No browser console errors appeared in the clean proxy preview.
- Measured document horizontal overflow at 320×740, 390×844 and 768×1024 across all seven public pages and five account-access pages. `documentElement.scrollWidth` matched its client width for every checked route after the Rules grid fix. Desktop home and lifecycle compositions were visually checked at 1280px. After the selector update, the homepage was remeasured at 320, 390, 768, 1250 and 1440px with no horizontal overflow; changing to the QA Expert mock updated the visible product and rule values. Screenshots were not retained as repository assets.
- Keyboard navigation was sampled for the mobile menu and FAQ disclosure. A screen-reader review and automated accessibility/contrast scan were not run; the responsive checks do not establish WCAG conformance.
- No browser check can prove that live API data is accurate, payment settlement is operational, evaluation calculations are correct, or account allocation succeeds.

### Validation

- `pnpm exec tsc --noEmit --incremental false`: passed after the homepage selector update.
- Targeted ESLint on changed UI TypeScript/TSX: passed with no diagnostics after the homepage selector update.
- `pnpm exec next build`: passed after the homepage selector update; generated all application routes. Existing middleware-convention deprecation warning remains.
- `pnpm build`: blocked during Prisma client generation by Windows `EPERM` while renaming the generated query-engine DLL. Direct Next.js build passed. No database connection was made.
- Repository-wide `git diff --check` reports extra blank lines at EOF across dirty files, including unrelated user changes. These were preserved.
- No test suite, database connection/query, migration, seed, reset, cleanup, real payment, email delivery, broker request, deployment, commit, push, merge, or release occurred. No repository files were deleted.
- Website files in this batch: `app/page.tsx`; `app/catalog/page.tsx` and route metadata; `app/pricing/page.tsx`; `app/rules/page.tsx` and route metadata; `app/faq/page.tsx` and route metadata; `app/how-it-works/page.tsx`; `app/policies/page.tsx`; `app/globals.css` and `app/layout.tsx`; account-access pages/layout metadata; dashboard page/layout metadata; `components/header.tsx`, `components/brand.tsx`, `components/site-footer.tsx`, `components/auth-shell.tsx`, `components/product-showcase.tsx`, `components/account-size-explorer.tsx`, `components/ui/*`; `lib/product-experience.ts`; `docs/product-decision-register.md`, `docs/competitor-policy-research.md`, `docs/master-project-audit.md`, and `docs/known-limitations.md`. Existing F-01 and unrelated dirty files remain preserved.

### Readiness

This work improves product discovery and customer-facing disclosure, but does not close the audit's payment, evaluation-integrity, account-allocation, credentials, test database, monitoring, CI, operational recovery, or product-policy blockers. Public paid launch remains **NO-GO**. Internal UI review with isolated mock responses is suitable; actual database-backed product verification remains blocked pending independently documented disposable-target evidence. Product and engineering percentage estimates from §16 remain unchanged because this batch does not verify commercial/runtime state or resolve core engineering blockers.

## Block 2 product-foundation addendum — 2026-10-13

The code now includes explicit product categories/structures/status, staged ruleset-version references, rule disposition/calculation metadata, draft/publish APIs, server-resolved order pricing, and product-term snapshots. No products or prices were seeded and no database operation occurred. The migration remains unapplied; existing products will default to DRAFT when applied. The production publication validator intentionally has an empty evaluator allowlist, so configured rule types cannot be activated until enforcement is verified. The standalone report in [docs/block-2-product-foundation.md](block-2-product-foundation.md) records the dependency map, evaluator findings, validation results, unresolved decisions, and launch blockers. Public launch remains NO-GO.
