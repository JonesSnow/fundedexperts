# Gmail SMTP and OTP email setup

This guide documents the current server-side email configuration. It contains placeholders only. Never paste real credentials into this file, source code, support tickets, logs, or chat.

## Configuration modes

- **EMAIL_MODE=console** is a local preview mode. It does not deliver email; the UI should report that no message was sent.
- **EMAIL_MODE=smtp** enables the Gmail SMTP provider. Production defaults to SMTP when EMAIL_MODE is unset, and console mode is rejected in production.
- **getEmailConfigDiagnostics()** validates configuration shape and lists missing variable names. It does not establish an SMTP connection or verify delivery.

## Variables

Set these in the local environment manager or hosting secret store. Keep them server-only; never prefix SMTP variables with NEXT_PUBLIC_.

| Variable | Required | Example shape / purpose |
|---|---:|---|
| EMAIL_MODE | Yes for clarity | smtp in an environment intended to deliver; console only for local preview. |
| SMTP_HOST | Yes | smtp.gmail.com |
| SMTP_PORT | Yes | 587 for STARTTLS, or 465 for implicit TLS. The application rejects other ports. |
| SMTP_USER | Yes | The authorized Gmail or Google Workspace mailbox address. |
| SMTP_PASSWORD | Yes | A secret credential accepted by Google for SMTP. Do not use or disclose a normal account password. |
| SMTP_FROM | Yes | A sender identity authorized for the configured mailbox/domain. |
| SMTP_REPLY_TO | No | Optional reply address. |
| NEXT_PUBLIC_SITE_URL | App URL | The public application origin used by authentication UI links. It is not an SMTP credential. |

The app also requires its normal server configuration (including a database and JWT signing secret) for the full registration/reset flows. Those values must be supplied through approved secret management, but are intentionally not described or displayed here.

## Gmail credential preparation

Google documents App Passwords as a fallback for apps that cannot use “Sign in with Google”; they require 2-Step Verification and may be unavailable for some managed or protected accounts. Google also recommends not creating one unless the app cannot use a more secure sign-in method. If organizational policy permits and the mailbox supports it, create a dedicated app credential for this application, store it in the secret manager as SMTP_PASSWORD, and revoke it when it is no longer needed. See [Google Account Help: Sign in with app passwords](https://support.google.com/accounts/answer/185833?hl=en).

Use a dedicated mailbox or approved sender identity, enable 2-Step Verification, restrict access to the smallest number of operators, and rotate/revoke the app credential after suspected exposure or mailbox access changes. Verify that the chosen From address is permitted by the mailbox or Workspace policy.

## Transport configuration

- Port 587 uses STARTTLS (secure: false in the SMTP transport configuration).
- Port 465 uses implicit TLS (secure: true).
- Do not set NEXT_PUBLIC_SMTP_*; browser bundles must never receive mail credentials.
- Do not enable real SMTP in a shared environment until its target users and delivery recipient are intentionally controlled.

## Safe verification sequence

1. Set the variables in a local secret manager or isolated deployment environment; do not edit or replace an existing .env.local as part of this guide.
2. Confirm only the **variable names and presence** through the sanitized diagnostics helper. Never print values.
3. Run database-free unit tests for OTP generation, code hashing, template contents, and configuration validation.
4. Before a real delivery check, obtain an explicitly approved non-production target and a controlled mailbox. Confirm database safety separately because email delivery tracking uses the Prisma database.
5. Send one test message only after that approval, then verify provider acceptance, recipient inbox/spam placement, sender identity, and delivery logs. This repository review did not send a message or establish SMTP connectivity.

## Current OTP email behavior

- Verification and password reset use short numeric codes rather than account-changing links.
- Codes are short-lived and stored as purpose/subject-bound HMAC digests; raw codes are only passed to the mail provider at send time.
- Resend/recovery responses are intended to avoid revealing whether an address is registered.
- Console mode is not delivery. A successful registration response must not be interpreted as proof of email delivery in console mode.
- Email delivery persistence and SMTP retries currently run in the application request path. A durable asynchronous outbox/worker remains a reliability improvement, not part of this setup procedure.

## Production configuration checks

- Production email now requires `EMAIL_MODE=smtp`; explicit console mode is rejected.
- Production email configuration requires `NEXT_PUBLIC_SITE_URL` or `SITE_URL` to identify the application origin. It must be HTTPS and cannot include credentials, a query, or a fragment. This prevents email templates from silently linking to the development localhost fallback.
- `NEXT_PUBLIC_SMTP_*` settings are rejected by the server email configuration. Keep SMTP host, user, password, and sender identity in server-only `SMTP_*` variables.
- These checks validate configuration shape only. They do not verify provider credentials, mailbox ownership, network reachability, or inbox placement.

## Limitations

Configuration validation cannot prove that Google accepts the credential, that the sender is authorized, that the application host can reach Gmail, or that a message reaches the inbox. No live SMTP, DNS, mailbox, production environment, or database check was performed for this guide.
