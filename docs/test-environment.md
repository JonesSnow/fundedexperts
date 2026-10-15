# Local PostgreSQL and Test Environment

Database-backed work is blocked until PostgreSQL has been installed under an
authorized operator's control and a separate disposable test database has
been independently verified. This repository does not provision PostgreSQL,
create roles, or prove database ownership. No database operation was performed
as part of this setup work.

## 1. Install prerequisites on Windows

Use a currently supported 64-bit PostgreSQL release. PostgreSQL 16 is a
conservative supported choice for this project; Prisma 6.19.3 supports the
PostgreSQL datasource. Obtain the installer only through the
[official PostgreSQL Windows download page](https://www.postgresql.org/download/windows/),
which links to the EDB interactive installer. Select the server and command
line tools (`psql`, `pg_isready`, `pg_dump`, `pg_restore`, `createdb`, and
`dropdb`). Do not install or change services without the machine owner's
approval. Keep the local superuser credential in an approved password
manager, not in the repository.

This environment check found no PostgreSQL server, service, command-line
utilities, Docker/Podman runtime, or installed WSL distribution. The current
PowerShell process has administrator privileges, but that does not constitute
approval to install software or modify the machine.

After an approved installation, open a new PowerShell window and verify the
service and client tools without connecting to any non-local target:

```powershell
Get-Service *postgres*
psql --version
pg_isready -h 127.0.0.1 -p 5432
```

The service should be running and the server should report ready. If the
installer selected another port, use that port consistently below.

## 2. Provision separate local databases

Connect interactively to the local PostgreSQL maintenance database as the
installer-created administrator. Do not place passwords in commands or commit
them. Create distinct databases and least-privilege login roles (one role per
database is preferred):

```sql
CREATE ROLE fundedexperts_dev_user LOGIN;
\password fundedexperts_dev_user
CREATE DATABASE fundedexperts_dev_local OWNER fundedexperts_dev_user;

CREATE ROLE fundedexperts_test_user LOGIN;
\password fundedexperts_test_user
CREATE DATABASE fundedexperts_test OWNER fundedexperts_test_user;
```

The `\password` commands prompt interactively. Confirm independently that
each database is owned by the expected role and that both resolve to the
intended local server and port. Connect to each target separately and capture
only its database name, role, server address, and port:

```sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
```

Record that `fundedexperts_test` is disposable, contains no information that
must be retained, and may be migrated and cleaned by this project. Do not
infer this from the database name, local hostname, or an environment flag.

## 3. Configure development and test targets

Keep the Next.js development application's `DATABASE_URL` (and `DIRECT_URL`
if present) in the ignored `.env.local` pointed only at
`fundedexperts_dev_local`. The Prisma CLI reads `DATABASE_URL` from the
process environment or `.env`; it does not automatically use `.env.local`.
When applying a development migration, set `DATABASE_URL` in the current
PowerShell process from the independently verified local development
configuration without printing or recording its value.

To apply already checked-in migrations to that verified development database,
run `pnpm exec prisma migrate deploy` only after setting the process
`DATABASE_URL` to that local development target. The project does not provide
a guarded development-migration wrapper; do not run the command with an
unknown or shared target. Use `prisma migrate dev --name ...` only when
intentionally authoring a new migration and after reviewing its reset/drift
prompts against the local development database.

Copy `.env.test.example` to the ignored `.env.test.local`. Set only these
test-specific variable names there:

- `TEST_DATABASE_URL` — local `fundedexperts_test` connection.
- `TEST_DATABASE_DISPOSABLE=true` — required acknowledgement after independent
  verification, with
  `TEST_DATABASE_DISPOSABLE_CONFIRMATION=I_HAVE_VERIFIED_THIS_IS_A_DISPOSABLE_TEST_DATABASE`.

Do not put `DATABASE_URL` or `DIRECT_URL` into `.env.test.local`; the bootstrap
ignores those fields from test configuration and redirects Prisma to the
verified test target. Do not put test-target settings in `.env.local`. The
guard also rejects a test target that matches the configured development
database identity. Never use shared, staging, or production targets for these
commands.

Both environment files are ignored by Git. `.env.test.example` is a tracked
template with empty values; copying it does not enable a database operation.

## 4. Run database-free tests

These commands never load a database target:

```powershell
pnpm test
pnpm test:unit
pnpm test:safety
```

`test:unit` runs the explicitly listed pure/mock suites and constructs child
process environments without database URL variables. Its manifest rejects
database-bootstrap imports and direct Prisma client construction before
launching each suite. It includes the database-guard subprocess tests and
static migration checks, but no database integration suite.

The separate `pnpm test:mt5-adapter` suite is not part of this default command:
some cases launch a local Python process. Do not run that suite as part of
routine database-free validation unless its local process behavior has been
reviewed and separately authorized.

## 5. Initialize and verify the disposable test database

Only after the separate test database has been provisioned and independently
verified:

1. Complete `TEST_DATABASE_URL`, `TEST_DATABASE_DISPOSABLE`, and
   `TEST_DATABASE_DISPOSABLE_CONFIRMATION` in `.env.test.local`.
2. Run `pnpm db:test:migrate`. This applies only already checked-in migrations
   with `prisma migrate deploy`; it does not generate a migration or reset the
   database.
3. Run `pnpm exec tsx scripts/prisma-status.ts` to check migration status.
   This helper validates the test target before launching Prisma CLI. Do not
   run raw Prisma CLI commands while an unknown `DATABASE_URL` is active.
4. Run `pnpm db:test:diff` to compare the test database schema with
   `prisma/schema.prisma`. This operation introspects the verified local test
   database and does not apply the emitted SQL.
5. Only after the migrations and diff are clean, run `pnpm test:db`.

Database-backed files and scripts must import
`tests/support/test-env.ts` before constructing Prisma or launching a database
operation. `pnpm test:db` discovers only test files declaring the guarded
bootstrap, plus the explicitly guarded phase 33 and monitoring persistence
suites. The bootstrap loads test settings from `.env.test.local`, excludes
database settings from `.env.local`, requires a local loopback PostgreSQL
target and operator confirmation, compares it with configured application
database identities, and rejects production mode. It never falls back to
`DATABASE_URL` or `DIRECT_URL`.

The confirmation is an operator attestation, not technical proof of
ownership. Host allowlists and names such as `test` are not proof either.
Tests are sequential; parallel execution and cross-process isolation have not
been established.

## 6. Destructive cleanup

The legacy `test-reset.cjs` and `scripts/clean-db.js` are disabled. The
purpose-built cleanup script deletes test rows and truncates `AuditLog` with
cascade, so it is destructive and is not run by unit tests, CI, migration
setup, or the database test runner.

Before explicitly choosing to erase all data in the disposable test database:

1. Re-verify its server, port, database name, owner, and disposable status.
2. Confirm the target is distinct from development, shared, staging, and
   production.
3. Set `TEST_DATABASE_CLEANUP_CONFIRMATION` to
   `I_UNDERSTAND_THIS_DELETES_ALL_DATA_IN_THE_TEST_DATABASE` temporarily.
4. Run `pnpm db:test:cleanup` once, then remove the cleanup-only confirmation.

The cleanup-only confirmation must be set in the invoking PowerShell process,
not saved in either environment file:

```powershell
$env:TEST_DATABASE_CLEANUP_CONFIRMATION = "I_UNDERSTAND_THIS_DELETES_ALL_DATA_IN_THE_TEST_DATABASE"
pnpm db:test:cleanup
Remove-Item Env:TEST_DATABASE_CLEANUP_CONFIRMATION
```

The cleanup script checks this separate confirmation before loading the test
environment or Prisma. It then applies the common test-database guard. Do not
automate the cleanup confirmation or add it to CI.

## 7. Diagnose common failures

- **Missing dedicated target:** set `TEST_DATABASE_URL`; do not copy or fall
  back to `DATABASE_URL`.
- **Conflicting test targets:** if both `PHASE33_DATABASE_URL` and
  `TEST_DATABASE_URL` are set, they must resolve to the same local database.
  Prefer the canonical `TEST_DATABASE_URL` and remove the legacy override.
- **Target rejected as remote or equal to development:** stop and correct the
  configuration; never bypass the guard with a database name or hostname
  trick.
- **Connection refused:** check that the local PostgreSQL service is running,
  and verify the host and port locally. Do not substitute a remote URL.
- **Prisma P2021 / missing table:** compare the deployed migration history and
  reported table identifier with the checked-in migration chain. On an empty,
  independently verified disposable database, apply checked-in migrations
  with `pnpm db:test:migrate`, then run `pnpm db:test:diff`. Do not guess a
  missing migration or apply changes to a shared database.
- **Migration status says pending:** inspect the migration SQL and current
  target identity before applying anything. `migrate deploy` is allowed only
  for the independently verified local disposable test target in this
  procedure.

## 8. Current limits

The local machine had no PostgreSQL installation or server, no PostgreSQL
utilities, no Docker/Podman runtime, and no WSL distribution at the time of
the readiness check. No migration, database-backed test, database connection,
service change, or configuration change was performed. Fresh-database runtime
validation remains blocked until PostgreSQL is installed with approval and
the separate local development and disposable test databases are verified.
