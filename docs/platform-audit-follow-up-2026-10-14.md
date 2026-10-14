# Funded Experts Platform Audit Follow-up — 2026-10-14

This follow-up supplements [the full audit dated 2026-10-12](full-project-audit-report.md). It records the authentication/email/UI work completed after that baseline and clarifies which original launch risks remain. The original audit is preserved unchanged.

## Scope and evidence limits

Static source review covered the current App Router page and API-handler inventory, the OTP authentication and email-delivery paths, shared design tokens and affected screens, the existing audit, and setup documentation. The repository currently contains **33 page.tsx files** and **54 API route.ts handlers**. Route lists below are generated from those source paths.

No database URL was loaded, no database client was used for this follow-up, and no database query, write, migration, seed, cleanup, payment, trade, or email send was performed. No live API or browser run was performed. The product/rules API-backed values were not queried; active commercial configuration therefore remains unverified. Environment values were not opened or reproduced.

## Architecture and route inventory

The application remains a single Next.js App Router monolith using React/TypeScript, Prisma/PostgreSQL, JWT sessions, Nodemailer SMTP, and a separate MT5 monitoring/worker direction documented in the baseline audit. This inventory shows implemented route files, not proof that every workflow is production-complete.

### Page routes

- **Public:** /, /catalog, /pricing, /rules, /faq, /how-it-works, /policies, /support.
- **Authentication:** /register, /login, /verify-email, /verify-email-pending, /forgot-password, /reset-password.
- **Trader:** /dashboard, /accounts, /accounts/[id], /evaluations, /evaluations/[id], /orders, /orders/[id], /settings, /notifications, /payouts.
- **Administration:** /admin, /admin/accounts, /admin/accounts/[id], /admin/customers/[id], /admin/notifications, /admin/products, /admin/products/new, /admin/rulesets, /admin/rulesets/new.

The complete current page.tsx inventory follows:
- **/**
- **/accounts**
- **/accounts/[id]**
- **/admin**
- **/admin/accounts**
- **/admin/accounts/[id]**
- **/admin/customers/[id]**
- **/admin/notifications**
- **/admin/products**
- **/admin/products/new**
- **/admin/rulesets**
- **/admin/rulesets/new**
- **/catalog**
- **/dashboard**
- **/evaluations**
- **/evaluations/[id]**
- **/faq**
- **/forgot-password**
- **/how-it-works**
- **/login**
- **/notifications**
- **/orders**
- **/orders/[id]**
- **/payouts**
- **/policies**
- **/pricing**
- **/register**
- **/reset-password**
- **/rules**
- **/settings**
- **/support**
- **/verify-email**
- **/verify-email-pending**
### API route-handler inventory

The route handlers cover these workflows: public catalog/products and rulesets; authentication and account settings; orders and activation/payment simulation; accounts, assignments, evaluations, and funded accounts; notifications; monitoring; and admin product/ruleset/account lifecycle.

The complete current route.ts inventory follows:
- **/api/accounts**
- **/api/accounts/[id]**
- **/api/accounts/[id]/health**
- **/api/accounts/[id]/status**
- **/api/admin/lifecycle**
- **/api/admin/mt5-accounts**
- **/api/admin/mt5-accounts/[id]**
- **/api/admin/products**
- **/api/admin/rulesets**
- **/api/assignments**
- **/api/auth/forgot-password**
- **/api/auth/login**
- **/api/auth/logout**
- **/api/auth/register**
- **/api/auth/reset-password**
- **/api/auth/reset-password/verify**
- **/api/auth/session**
- **/api/auth/settings**
- **/api/auth/verify-email**
- **/api/auth/verify-email/confirm**
- **/api/coupons**
- **/api/evaluations**
- **/api/evaluations/[id]**
- **/api/evaluations/[id]/start**
- **/api/funded-accounts**
- **/api/funded-accounts/[id]**
- **/api/funded-accounts/[id]/approve**
- **/api/funded-accounts/[id]/link-account**
- **/api/funded-accounts/[id]/transition**
- **/api/monitoring/[accountId]/process**
- **/api/monitoring/[accountId]/status**
- **/api/notifications**
- **/api/notifications/[id]**
- **/api/orders**
- **/api/orders/[id]**
- **/api/orders/[id]/activate**
- **/api/orders/[id]/activate-evaluation**
- **/api/orders/[id]/allocate**
- **/api/orders/[id]/pay**
- **/api/products**
- **/api/products/[id]**
- **/api/products/[id]/publish**
- **/api/products/[id]/stages**
- **/api/products/[id]/stages/[stageId]**
- **/api/products/[id]/status**
- **/api/rulesets**
- **/api/rulesets/[id]**
- **/api/rulesets/[id]/versions**
- **/api/rulesets/[id]/versions/[version]**
- **/api/rulesets/[id]/versions/[version]/publish**
- **/api/rulesets/[id]/versions/[version]/rules**
- **/api/rulesets/[id]/versions/[version]/rules/[ruleId]**
- **/api/trader/evaluations**
- **/api/trader/funded-accounts**
### Page readiness snapshot

| Area | Current implementation evidence | Readiness / remaining limitation |
|---|---|---|
| Public catalog, pricing, rules, FAQ | Product display and rules are sourced from application APIs/configuration; shared pages now use the dark theme tokens. | No database-backed active product configuration was checked. Do not treat proposed product sizes/prices/rules as authoritative unless populated and verified by the product owner. |
| Registration and login | Registration creates a pending verification state; new login attempts for unverified accounts receive a verification-required response before a session is issued. | Previously issued stateless JWTs are not revoked or revalidated against email status. Existing tokens may remain usable until expiry. |
| Email verification | Six-digit, short-lived OTP; purpose/subject-bound HMAC digest; atomic one-time consumption in the confirm handler; resend cooldown and generic resend response. | No DB-backed route tests or real mailbox delivery were run. Process-local throttling is not a multi-instance abuse control. |
| Password recovery | Enumeration-resistant request response; OTP verification exchanges the OTP for a short-lived recovery proof; reset consumes the proof while changing the password. | Password changes do not revoke existing stateless JWTs. No DB-backed concurrency test was run. |
| Email change | Settings exposes profile/password behavior, but no end-to-end email-change OTP flow was established in this batch. | Treat verified email change as incomplete until the product decides and implements its confirmation/recovery policy. |
| Trader/admin pages | Existing route surfaces remain present and selected public, auth, dashboard, and admin surfaces use the updated dark tokens. | Static code/lint review only; no live API, responsive browser, accessibility tree, or role-by-role browser validation was performed. |
| Checkout, trading, monitoring, funded lifecycle, payouts | Existing baseline code paths remain as documented in the 2026-10-12 report. | Payment, rule-calculation, account-allocation, monitoring, and payout defects listed there remain launch blockers; this batch did not change those business domains. |

## Authentication and email changes

The OTP helper in lib/auth/otp.ts generates six-digit codes using a cryptographic random source and stores purpose/subject-bound HMAC digests, not raw OTP values. Registration stores the verification digest and expiry (app/api/auth/register/route.ts); login gates new sessions on emailVerified (app/api/auth/login/route.ts:95-103); confirmation conditionally consumes a matching unexpired digest and flips verification state (app/api/auth/verify-email/confirm/route.ts:34-61). Reset verification consumes an OTP into a random proof, and reset consumes that proof with the password update (app/api/auth/reset-password/verify/route.ts:25-47, app/api/auth/reset-password/route.ts:37-58).

The public OTP UIs keep the entered address in session storage rather than putting it in a URL. The reset UI keeps its recovery proof in component memory. Email templates now contain codes rather than account-changing links. Console email mode is explicitly a preview with no delivery; registration reports that state honestly.

SMTP configuration is server-side. lib/email/config.ts:27-68 validates mode and requires SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM in SMTP mode, and only accepts port 465 (implicit TLS) or 587 (STARTTLS). getEmailConfigDiagnostics() reports mode, missing variable names, and sanitized validation issues; it does **not** test DNS, credentials, SMTP connectivity, sender acceptance, inbox delivery, or spam placement. There is no user-facing diagnostics endpoint established by this review.

The send path still writes delivery status through Prisma and performs bounded SMTP retries in the request path (lib/email/index.ts). This is a reliability/performance concern: request completion can be delayed by provider latency, and delivery persistence itself depends on the database. Use the separate setup guide for manual configuration; do not put real values in source control.

## UI and product presentation

The shared palette now uses a dark charcoal surface with cyan accents and semantic status colors. Public, auth, trader dashboard, and selected admin surfaces were updated to the shared tokens. The existing landing-page perspective/3D visual was retained rather than adding a new runtime dependency. Motion-reduction styles remain in the design.

Pricing and rules continue to rely on configured product/ruleset data and explanatory copy. Because the safe audit did not query the configured data, this follow-up cannot verify that a currently published Beginner/Pro/Expert matrix exists, that amounts are current, or that public copy matches active rules. No successful purchase, evaluation, funded account, or payout is represented as newly verified.

## Findings still relevant from the baseline

The auth changes partially address baseline findings F-15 and F-17, but do not close all related risks:

- New unverified login attempts are denied before session creation. Previously issued tokens remain valid until expiry unless the protected request path independently revokes/checks them; no global token revocation mechanism was added.
- Password reset still does not revoke earlier stateless JWT sessions.
- Rate limits are process-local, so they do not provide reliable shared throttling across multiple server instances.
- SMTP delivery and database tracking remain coupled to business request paths.
- Registration/account-state enumeration and suspended-account response behavior must be re-reviewed separately; generic resend/recovery messages alone do not resolve them.

The following baseline findings remain outside this batch and continue to block paid/public launch: F-02/F-03 (client-declared simulated payment and incomplete checkout), F-04/F-05 (product/ruleset binding and allocation eligibility), F-06 through F-09 (rule calculation and ruleset integrity), F-10 through F-14 (credential handling, live monitoring, lifecycle atomicity, CI/deployment controls), F-18 through F-26 (idempotency, lifecycle, coupon, pagination/index, monitoring, and missing product capabilities), and F-28 through F-33 (draft disclosure, enumeration, currency, stale docs, security headers, and lint debt). See the original report for evidence and remediation detail.

## Implementation file inventory for this batch

The following files were edited or added as part of the authentication/email and dark-theme work recorded here. Git status/diff could not be reconciled in this environment, so this list is the known batch edit list and does not claim to enumerate unrelated pre-existing user changes.

- Environment template: .env.example.
- Authentication APIs: app/api/auth/register/route.ts; app/api/auth/login/route.ts; app/api/auth/verify-email/route.ts; app/api/auth/verify-email/confirm/route.ts; app/api/auth/forgot-password/route.ts; app/api/auth/reset-password/route.ts; app/api/auth/reset-password/verify/route.ts; app/api/auth/settings/route.ts.
- Authentication pages and loading states: app/register/page.tsx; app/login/page.tsx; app/verify-email/page.tsx; app/verify-email/loading.tsx; app/verify-email-pending/page.tsx; app/verify-email-pending/loading.tsx; app/forgot-password/page.tsx; app/reset-password/page.tsx; app/reset-password/loading.tsx.
- Public, dashboard, and theme: app/page.tsx; app/pricing/page.tsx; app/rules/page.tsx; app/faq/page.tsx; app/how-it-works/page.tsx; app/dashboard/page.tsx; app/globals.css; middleware.ts.
- Admin theme and access feedback: app/admin/page.tsx; app/admin/accounts/page.tsx; app/admin/accounts/[id]/page.tsx; app/admin/customers/[id]/page.tsx; app/admin/notifications/page.tsx; app/admin/products/page.tsx; app/admin/products/new/page.tsx; app/admin/rulesets/page.tsx.
- Shared components: components/email-otp-verification.tsx; components/auth-shell.tsx; components/brand.tsx; components/product-showcase.tsx; components/ui/modal.tsx.
- Auth and email services: lib/auth/otp.ts; lib/auth/rate-limit.ts; lib/auth/session.ts; lib/email/config.ts; lib/email/console-provider.ts; lib/email/index.ts; lib/email/provider.ts; lib/email/renderer.ts; lib/email/templates/index.ts; lib/email/templates/password-reset.ts; lib/email/templates/verification.ts; lib/email/templates/welcome.ts.
- Tests and documentation: tests/auth-otp.unit.test.ts; docs/authentication.md; docs/email-otp-setup.md; docs/platform-audit-follow-up-2026-10-14.md.
## Validation performed for this follow-up

- Database-free OTP helper suite: pnpm exec tsx tests/auth-otp.unit.test.ts passed, 11 tests passed and 0 failed.
- TypeScript: pnpm exec tsc --noEmit --incremental false passed. Targeted ESLint on changed TypeScript/TSX files passed with 0 errors and 0 warnings.
- No database-backed suites, build, migrations, live SMTP check, or external integration call were performed. The production build was not rerun because the prior environment attempt failed while fetching a Google font and hit a Windows permission error writing .next; no database safety was established for a build that runs Prisma generation.
- Git status/diff and git diff --check were not rerun because the known worktree/ownership failure remains unresolved; no Git metadata bypass was attempted. No Git metadata or user files were reset, cleaned, stashed, or discarded. The original audit document was not overwritten.

## Readiness decision

**NO-GO for public launch, real customer payments, or real trading accounts.** The auth UX and email setup are clearer and the new OTP paths have database-free helper coverage, but the high-risk payment, product/ruleset, financial-rule, allocation, monitoring, deployment, and operational gaps in the baseline audit remain. Internal design review can proceed; do not treat database-backed lifecycle states as validated by this UI/auth batch.

## Product and operations decisions still needed

1. Confirm the launch product matrix, prices/currencies, account sizes, rule definitions, retry policy, and payout/refund policy.
2. Select and configure a real payment provider and define signed event/reconciliation behavior.
3. Define verified-session revocation policy, email-change flow, and durable shared rate limiting.
4. Select the production MT5/broker monitoring architecture and failure/suspension policy.
5. Assign owners for deployment, migration, backups/restore, observability, and incident response.
6. Establish a verified disposable test database and keep every database-capable test runner behind the safety guard.

## Master-scope continuation — 2026-10-14

### Implemented in this continuation

- `lib/email/config.ts` now rejects explicit console mode in production, rejects configured `NEXT_PUBLIC_SMTP_*` values, and requires a valid HTTPS application origin in production. Validation errors name affected settings only and never include their values.
- `lib/email/urls.ts` no longer silently uses `http://localhost:3000` in production. Non-production local fallback remains available.
- `lib/email/renderer.ts` no longer labels `/support` as a contact channel and no longer claims a journey toward live funded trading. The UI currently exposes self-service information only.
- `app/faq/page.tsx`, `app/how-it-works/page.tsx`, and `app/settings/page.tsx` now describe the OTP/reset flows and unavailable email-change/purchase flows more accurately.
- `.env.example` now marks unused API/Redis/MT5 REST/token-lifetime variables as inactive placeholders and describes console email as non-delivery.
- `eslint.config.mjs` now excludes `.kilo/worktrees/**` from the root lint run because those are separate managed checkouts, not this app's source tree. No nested worktree files were changed.
- `tests/email-provider.test.ts` now uses a `const` collection and removes a private helper with no call sites. The DB-backed suite was not executed.
- `README.md` no longer advertises an absent Docker Compose setup, marks database safety requirements, updates safe validation commands, and states the current pre-launch limitations.
- `docs/authentication.md` and `docs/email-otp-setup.md` document the production email fail-closed conditions. `docs/environment-variable-inventory-2026-10-14.md` records variable names and purposes without values. `docs/master-scope-completion-matrix-2026-10-14.md` contains the route/page status inventory and current blockers.

### Regression checks

- `pnpm exec tsx tests/auth-otp.unit.test.ts`: passed, 16 tests, 0 failures. It covers OTP generation/hash/template behavior, production console rejection, production site URL validation, browser-prefixed SMTP rejection, sanitized diagnostics, and development-only localhost fallback.
- `pnpm test:safety`: passed, 30 tests, 0 failures. This is a mocked/static database guard suite; it created no database client or connection.
- `pnpm exec tsc --noEmit --incremental false`: passed.
- Targeted ESLint on changed TypeScript/TSX files: passed with no errors or warnings.
- Full `pnpm lint`: initially scanned the nested worktree and reported 50 errors/226 warnings. After excluding that separate checkout and removing one safe unused local helper, it reports 8 errors/96 warnings in the current repository. All 8 errors are `require()` style findings in direct check/reset/environment scripts; they were left alone because changing module order could affect database-guard execution. Targeted changed-file lint passed; no bulk auto-fix was run.
- Production build was not run: the `build` script starts with Prisma Client generation, and the prior environment had font-fetch and `.next` permission failures. Avoided generated-file changes and external network access.

### Source review and remaining limits

- The current public ruleset handlers filter to published data or return 404 for non-admin draft reads. This statically appears to mitigate baseline F-28; a route-level regression test was not run, so mark it implemented but not runtime-verified rather than fully closed.
- Database-backed test suites still contain broad table cleanup. The test safety guard is necessary but does not establish that the configured target is disposable; no suite was run.
- Session revocation, email-change verification, and distributed rate limiting remain unimplemented because they need durable/shared storage and database/schema validation that cannot be performed under current safety constraints.
- No database, migration, seed, cleanup utility, live API, SMTP provider, payment, broker, or trading operation was invoked. No environment-file values were read. No Git status/diff or Git metadata operation was attempted because the known worktree/ownership issue remains unresolved. No files were deleted, and no publication action occurred.

### Current launch decision

**NO-GO for public paid launch or live trading.** Safe public copy and email configuration are improved, but payment verification, product/rules compatibility, evaluation calculations, assignment and lifecycle invariants, live monitoring, payout/support operations, legal policy, and production test-target verification remain launch blockers.
