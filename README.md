# Funded Experts

A simulated prop-firm platform for evaluating traders and managing funded accounts.

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Package Manager | pnpm |
| ORM | Prisma |
| Database | PostgreSQL |
| Linting | ESLint |
| Code Quality | Prettier |

## Local Setup

### Prerequisites

- Node.js 24 (CI-pinned)
- pnpm 12.5.1 (CI-pinned)
- PostgreSQL 16+ for database-backed local development and testing

### Installation

```bash
# Install the locked dependencies
pnpm install

# Configure ignored .env.local for a verified local development database.
# See docs/test-environment.md for PostgreSQL provisioning and safe test setup.
pnpm dev
```

Do not point local development or test commands at a shared or production
database. Prisma CLI does not automatically load `.env.local`; supply the
independently verified local development target explicitly before running a
development migration. Database-backed tests require the separate disposable
test target and guarded commands documented in
[docs/test-environment.md](./docs/test-environment.md). This repository does
not include a Docker Compose configuration.

## Available Scripts

| Script | Command |
|---|---|
| Development | `pnpm dev` |
| Build | `pnpm build` |
| Start production | `pnpm start` |
| Lint | `pnpm lint` |
| Type check | `pnpm exec tsc --noEmit --incremental false` |
| Database-free unit tests | `pnpm test:unit` |
| Database safety tests | `pnpm test:safety` |
| Guarded disposable-test migration | `pnpm db:test:migrate` |
| Guarded database integration tests | `pnpm test:db` |
| Guarded test schema comparison | `pnpm db:test:diff` |
| Destructive test-only cleanup | `pnpm db:test:cleanup` |
| Prisma Client generation | `pnpm prisma:generate` |

`pnpm test` and `pnpm test:unit` run database-free suites only. The guard does
not prove that a database is disposable; an authorized operator must verify
ownership and reset policy before setting the explicit test confirmations.
The legacy reset scripts are disabled. Cleanup is separately gated and is
never invoked by unit tests or CI.

## Project Structure

```
app/              Next.js App Router pages and API routes
components/       Shared and page-specific React components
lib/              Utilities, helpers, and shared logic
prisma/           Prisma schema and migrations
docs/             Architecture and decision documents
tests/            Test files and utilities
public/           Static assets
```

## Development Rules

- Use TypeScript strict mode — no `any` types
- Follow the existing folder conventions
- Run lint and type check before committing
- Do not commit `.env` files or credentials
- Do not add hardcoded secrets to source code
- Use Prisma for all database access
- Place domain logic in `lib/`, not in components

## Current Implementation Phase

**Pre-launch engineering build** — Core account, evaluation, product, order, and admin interfaces exist, but real checkout, reliable evaluation/rule enforcement, account allocation, live monitoring, payouts, and customer support are not established as production workflows. Do not treat simulated account records as customer money, live broker activity, or payout entitlement. See `docs/full-project-audit-report.md` and the current master-scope completion matrix for evidence and blockers.
