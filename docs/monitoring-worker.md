# Monitoring worker

The monitoring process is separate from the Next.js/Vercel application. It is intended to run continuously on a persistent Windows host that has the MetaTrader 5 terminal and Python bridge available.

## Start command

Run `pnpm monitoring:worker` from the application directory under a process supervisor configured to restart on unexpected exit and stop cleanly during maintenance. Do not run multiple unmanaged copies. The worker has not been started or connected to a database as part of this implementation batch.

## Required process environment

Supply these variables through the host's approved secret/configuration mechanism. The worker does not read `.env.local` or load an environment file itself.

| Variable | Requirement |
|---|---|
| `MONITORING_WORKER_ENABLED` | Must be exactly `true`; otherwise startup fails before Prisma is imported. |
| `DATABASE_URL` | Required. The worker reads and updates monitoring and evaluation account state in the configured database. Verify the intended target and operational approval before starting it. |
| `MT5_ENCRYPTION_KEY` | Required; at least 32 characters. Used to access encrypted MT5 credentials. Never put its value in logs or documentation. |
| `WORKER_ID` | Required; 1–64 letters, digits, dots, underscores, or hyphens. |

Optional settings are validated at startup:

| Variable | Default | Accepted range / behavior |
|---|---:|---|
| `MONITORING_POLL_INTERVAL_MS` | 60,000 | 1,000–3,600,000 milliseconds |
| `MT5_SCRIPT_TIMEOUT_MS` | 15,000 | 1,000–120,000 milliseconds |
| `WORKER_TIMEOUT_MS` | 20,000 | 2,000–122,000 milliseconds and must exceed the MT5 script timeout |
| `MT5_PYTHON_PATH` | `python` | Python executable path available to the service account |

## Current behavior and limits

- The worker repeatedly calls `MonitoringRunner.runAllEligible()` and waits between batches. It does not poll pending `MonitoringJob` rows.
- The runner currently selects active evaluation accounts. Funded-account monitoring is not implemented; do not treat this process as enforcing funded-account rules.
- The standalone entrypoint explicitly selects the real MT5 adapter and does not use mock data as a fallback.
- A database error causes a safe generic message and a later retry. Per-account results are summarized as counts; detailed failure diagnostics and a health endpoint are not yet available.
- The runner's evaluation processing can update account/evaluation monitoring state. Starting the worker is therefore an operational database action, not a harmless health check.
- Shutdown on SIGINT/SIGTERM aborts the polling loop and disconnects Prisma after the current batch returns. Set supervisor stop timeouts to allow an in-flight batch to finish.

## Readiness checklist

Before enabling a deployment, the operator must verify the database identity, confirm the intended write scope, provision and protect the encryption key, validate the Windows service account's terminal/Python access, and arrange monitoring/alerting for process health. These deployment checks have not been performed by the database-free tests.
