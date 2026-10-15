# CI Baseline

The current `.github/workflows/ci.yml` is a validation-only GitHub Actions
workflow for the `main` branch. It installs the locked dependencies, generates
Prisma Client without connecting to a database, validates the Prisma datamodel
with a non-routable placeholder URL, runs TypeScript and the scoped `pnpm lint`
over application/tests and database scripts, and runs `pnpm test:unit`.

The workflow intentionally has no database secrets, cleanup, migrations,
database-backed tests, deployment, or external service calls. Database-backed
CI remains blocked until a dedicated disposable test database and safe
credential/ownership process are approved. No deployment behavior is defined
or changed by this workflow.

This replaces the earlier Markdown-embedded workflow example. Historical
references to its database-test jobs, cleanup steps, and required CI secrets
are not instructions for the current pipeline.
