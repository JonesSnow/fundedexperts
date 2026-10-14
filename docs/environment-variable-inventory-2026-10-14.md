# Environment Variable Inventory — 2026-10-14

This inventory was produced by static source, manifest, workflow, and documentation searches. Actual `.env.local`, `.env.test.local`, deployment values, and secret stores were not opened. No values are recorded here. Presence and correctness of deployment configuration were not verified.

## Database and test isolation

| Name | Purpose and consumer | Required status | Example-template status / behavior |
|---|---|---|---|
| `DATABASE_URL` | Prisma application database connection; test bootstrap replaces it only after the dedicated test URL passes the safety guard. | Required for database-backed application runtime. | Placeholder is in `.env.example`; never use that shared value as a test target. |
| `DIRECT_URL` | Comparison reference in the test safety guard; test bootstrap redirects Prisma's direct URL to the verified test URL. No application-side direct connection configuration was found in the schema search. | Test helper only; not an application secret to copy into test config. | Not in `.env.example`. |
| `TEST_DATABASE_URL` | Canonical URL for database-backed test infrastructure and CI. | Required for DB-backed tests unless the explicit Phase 33 override is used. No `DATABASE_URL` fallback. | Not in `.env.example`; configure only after a separate disposable target is approved. |
| `PHASE33_DATABASE_URL` | Local override for the Phase 33 test target. | Optional override; must pass the same safety guard and identity checks. | Not in `.env.example`. |
| `PHASE33_TEST_DB_HOST_ALLOWLIST` | Exact-host allowlist consumed by test URL validation. Host approval alone does not demonstrate that the target is disposable. | Optional guard input; the guard still checks target identity and production URL comparison. | Not in `.env.example`. |
| `PHASE33_MT5_PASSWORD` | Phase 33 external MT5 test support. | Only needed for the corresponding separately authorized integration test. | Not in `.env.example`; no integration test was run. |

The test bootstrap reads `.env.test.local` as the only file allowed to supply a test database URL. `.env.local` can supply non-database test secrets and database identity comparison references, but its database URL is not selected as the test target. The guard's code was inspected; no database connection was made.

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
| `MT5_MASTER_PASSWORD` | Fallback credential in the monitoring runner when no per-account credential is available. | Code treats it as optional and falls back to a mock password; this is not a safe production readiness signal and remains a blocker. | Not in `.env.example`; do not set or test against a live broker as part of this batch. |

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
- Decide the supported MT5 adapter/worker architecture and remove the mock-password fallback before claiming live monitoring.
