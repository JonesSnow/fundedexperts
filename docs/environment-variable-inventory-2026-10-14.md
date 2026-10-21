# Environment Variable Inventory — 2026-10-14

This inventory was produced by static source, manifest, workflow, and documentation searches. Actual `.env.local`, `.env.test.local`, deployment values, and secret stores were not opened. No values are recorded here. Presence and correctness of deployment configuration were not verified.

## Database and test isolation

| Name | Purpose and consumer | Required status | Example-template status / behavior |
|---|---|---|---|
| `DATABASE_URL` | Prisma schema datasource. Used by production and guarded test runtime; in local development it is only a comparison reference and is never the selected Prisma target. | Required for production and guarded database-backed tests. Local development requires `DEVELOPMENT_DATABASE_URL` instead. | Placeholder is in `.env.example`; never use it as a test or local-development target. |
| `DIRECT_URL` | Prisma direct datasource/comparison reference. The development guard compares it with the explicit development URL; test bootstrap redirects it only after test-target validation. | Optional comparison reference in development; test helper uses the verified test target. | Not in `.env.example`. |
| `DEVELOPMENT_DATABASE_URL` | Explicit PostgreSQL target passed to Prisma in `NODE_ENV=development` after `lib/development-database-guard.ts` validates it. | Required for local database-backed development. No fallback to `DATABASE_URL`; must differ from every configured production reference by canonical host, port, and database name. | Not in `.env.example`. Configure only after independently verifying the branch and its data lineage. |
| `DEVELOPMENT_DATABASE_CONFIRMATION` | Operator attestation required before local development can construct Prisma. The exact required text is defined in `lib/development-database-guard.ts`. | Required in `NODE_ENV=development`; attestation is not proof that a target is disposable or isolated. | Not in `.env.example`; set only after independently verifying the development target. |
| `PRODUCTION_DATABASE_URL` | Optional production identity reference used only by the local development guard; it is not selected as the local development Prisma target. | Optional if `DATABASE_URL` or `DIRECT_URL` already provides a comparable production reference; at least one valid reference is required. | Not in `.env.example`; do not copy or expose its value. |
| `TEST_DATABASE_URL` | Canonical URL for database-backed test infrastructure. | Required for DB-backed tests; no fallback to `DATABASE_URL`; target must be local loopback and differ from configured application targets. | Documented in `.env.test.example`; configure only after independent isolation/disposability verification. |
| `PHASE33_DATABASE_URL` | Legacy override for the test target. | Optional; if set with `TEST_DATABASE_URL`, both must resolve to the same local database. Still requires operator confirmation and database-identity comparison. | Not in `.env.test.example`. |
| `TEST_DATABASE_DISPOSABLE` | Operator attestation that the configured local test database is isolated and may be recreated. | Must equal `true` for database-backed tests; this flag is not itself proof of isolation. | Set only after the documented manual verification. |
| `TEST_DATABASE_DISPOSABLE_CONFIRMATION` | Second explicit operator confirmation consumed by the shared test guard. | Must exactly match the confirmation phrase in `docs/test-environment.md`; not a credential. | Set only after the documented manual verification. |
| `TEST_DATABASE_CLEANUP_CONFIRMATION` | Additional one-invocation confirmation for destructive test-data cleanup. | Required only by `pnpm db:test:cleanup`; exact cleanup confirmation and process-only setup are documented in `docs/test-environment.md`. | Never store in an environment file or CI. |
| `PHASE33_MT5_PASSWORD` | Phase 33 external MT5 test support. | Only needed for the corresponding separately authorized integration test. | Not in `.env.example`; no integration test was run. |

The test bootstrap reads `.env.test.local` as the only file allowed to supply a test database URL or disposability confirmation. `.env.local` can supply non-database test settings and database identity comparison references, but its database URL and cleanup confirmation are never selected as the test target. The test guard requires an operator attestation and loopback target; markers and host allowlists do not establish safety. `.env.test.example` is tracked with empty configuration fields. No database connection was made during this local infrastructure milestone.

### Local development database guard — 2026-10-20

`lib/db.ts` creates Prisma lazily. When `NODE_ENV=development`, the client factory requires `DEVELOPMENT_DATABASE_URL` and `DEVELOPMENT_DATABASE_CONFIRMATION`, compares the target's canonical host, port and database identity against every configured production reference (`PRODUCTION_DATABASE_URL`, `DATABASE_URL`, and `DIRECT_URL`), and passes the validated development URL as a Prisma datasource override without mutating `process.env`. Missing, invalid, uncomparable, or matching identities fail before client creation. Production and test Prisma configuration are unchanged by this development-only guard.

This guard does not prove a Neon branch contains no copied production data or is disposable. The latest available read-only branch listing showed only the production branch; no database connection or migration was performed. Keep database-backed development and tests blocked until a separate target and its data lineage/reset policy are verified.

## Authentication and sessions

| Name | Purpose and consumer | Required status | Example-template status / behavior |
|---|---|---|---|
| `JWT_SECRET` | Signs and verifies sessions and purpose-bound OTP digests. | Required server-side; code requires at least 32 bytes and rejects the known placeholder. | Placeholder is in `.env.example`; supply a unique server secret. |
| `NODE_ENV` | Framework/runtime mode; controls secure cookies and email defaults. | Framework-provided. | Not a user-supplied secret. Production behavior is fail-closed for email mode and email URL configuration. |

## Email and OTP

| Name | Purpose and consumer | Required status | Example-template status / behavior |
|---|---|---|---|
| `EMAIL_MODE` | Selects console preview or SMTP. | Optional in development/test; defaults to console outside production and SMTP in production. Production now rejects any mode other than `smtp`. | Placeholder is in `.env.example`; use `smtp` only with server credentials. Console mode is not delivery. |
| `SMTP_HOST` | SMTP host for the server-side provider. | Required when `EMAIL_MODE=smtp`. | Placeholder is in `.env.example`. |
| `SMTP_PORT` | SMTP transport port. | Required with SMTP; code accepts 465 (implicit TLS) or 587 (STARTTLS). | Placeholder is in `.env.example`. |
| `SMTP_USER` | SMTP account identity. | Required with SMTP. | Placeholder is in `.env.example`; server-only. |
| `SMTP_PASSWORD` | SMTP credential. | Required with SMTP. | Placeholder is in `.env.example`; server-only secret. Never enter a real credential in a `NEXT_PUBLIC_*` variable. |
| `SMTP_FROM` | Sender identity. | Required with SMTP. | Placeholder is in `.env.example`. Sender authorization was not verified. |
| `SMTP_REPLY_TO` | Optional reply address. | Optional. | Placeholder is in `.env.example`. |
| `NEXT_PUBLIC_SITE_URL` | Public application origin used for email links when set. | In production, either this or `SITE_URL` must be an absolute HTTPS URL without credentials, query, or fragment. | Placeholder is in `.env.example`; public URL only, never a secret. |
| `SITE_URL` | Server-side application-origin fallback for email links. | Same production validation as `NEXT_PUBLIC_SITE_URL`; optional outside production. | Not listed as a deployment secret in `.env.example`; development fallback is localhost. |
| `NEXT_PUBLIC_SMTP_HOST`, `NEXT_PUBLIC_SMTP_PORT`, `NEXT_PUBLIC_SMTP_USER`, `NEXT_PUBLIC_SMTP_PASSWORD`, `NEXT_PUBLIC_SMTP_FROM` | Invalid browser-prefixed SMTP configuration. | Must not be set. Configuration validation reports these names and `getEmailConfig()` now rejects their presence. | Not in `.env.example`. A `NEXT_PUBLIC_*` SMTP credential would be unsafe to publish. |

Production email validation cannot prove provider authentication, network reachability, sender authorization, provider acceptance, or inbox delivery. No live SMTP request was made.

## MT5 and monitoring

| Name | Purpose and consumer | Required status | Example-template status / behavior |
|---|---|---|---|
| `MT5_ENCRYPTION_KEY` | Encrypts MT5 credentials using the existing encryption helper. | Required when writing encrypted credentials; code requires at least 32 characters. Rotation/re-encryption is not implemented. | Placeholder is in `.env.example`; server-only secret. |
| `MT5_USE_REAL_ADAPTER` | Selects the real adapter when the adapter factory is explicitly in `auto` mode. | Optional; only the literal `true` selects real mode. Deployment and broker connectivity are unverified. | Not in `.env.example`. |
| `MT5_MASTER_PASSWORD` | No current runtime consumer. The monitoring runner requires the account's encrypted credential bundle. | Do not configure; missing per-account credentials fail the monitoring job before adapter invocation. | Not in `.env.example`; the fallback was removed in the 2026-10-20 follow-up below. |

### Follow-up — 2026-10-20

The runner no longer substitutes `MT5_MASTER_PASSWORD` or a placeholder password when `MT5Account.credentials` is missing. It records the job as `CREDENTIALS_UNAVAILABLE`, marks the account's monitoring result as failed, and does not invoke the adapter. This is source-level behavior verified with a mocked Prisma client and adapter; no database or broker connection was made. Live monitoring remains unverified and requires the supported real-adapter/worker runtime plus authorized per-account encrypted credentials.

## Listed as inactive placeholders in `.env.example`, with no runtime consumer found

Static search found no source reads for these names. Their example-template entries are now commented as reserved and should not be treated as active configuration until an owner maps them to implemented consumers:

- `NEXT_PUBLIC_API_URL`
- `JWT_EXPIRES_IN`
- `MT5_API_URL`
- `MT5_API_KEY`
- `MT5_API_SECRET`
- `REDIS_URL`

In particular, the presence of `REDIS_URL` in the template does not mean distributed rate limiting is implemented. The current auth limiter is process-local.

## Configuration decisions still required

- Supply server-side email credentials and an approved HTTPS site origin in each production environment, then perform a controlled non-production delivery test.
- Select a shared rate-limiting service and implement/test it before relying on throttling across multiple application instances.
- Confirm a disposable test database's ownership and reset policy before enabling database-backed test suites.
- Decide and deploy the supported MT5 adapter/worker architecture, then validate it with authorized demo credentials before claiming live monitoring.
