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

- Node.js 20+
- pnpm 8+
- PostgreSQL 15+ (or use Docker)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment
cp .env.example .env.local

# Only after DATABASE_URL is verified as a local development database:
pnpm exec prisma migrate dev --name init

# Start development server
pnpm dev
```

Do not point local development or test commands at a shared or production database. Before running a migration, verify the target independently and use a local disposable development database. Database-backed tests require a separately identified disposable test database; the test URL must not be copied from `.env.local`.

This repository does not include a Docker Compose configuration. Use a separately verified local development database if you need database-backed features.

## Available Scripts

| Script | Command |
|---|---|
| Development | `pnpm dev` |
| Build | `pnpm build` |
| Start production | `pnpm start` |
| Lint | `pnpm lint` |
| Type check | `pnpm exec tsc --noEmit --incremental false` |
| Safe database-guard tests | `pnpm test:safety` |
| Database-free OTP/email helper tests | `pnpm exec tsx tests/auth-otp.unit.test.ts` |
| Prisma migrate (verified local development target only) | `pnpm exec prisma migrate dev` |
| Prisma generate | `cd prisma && npx prisma generate` |
| Prisma studio | `cd prisma && npx prisma studio` |

**Note:** Full `tsc --noEmit` and `next build` may exceed memory limits in constrained environments. Run type checks on individual files via IDE or use `npx tsc --noEmit` on specific directories.

**Database safety:** Database-backed tests require a dedicated `TEST_DATABASE_URL` or `PHASE33_DATABASE_URL` that passes the safety guard. The guard does not prove that a database is disposable; a product owner/operator must verify ownership and reset policy first. The test bootstrap does not select `.env.local` as a test target and does not fall back to `DATABASE_URL`. Some legacy database suites and utilities still perform broad table cleanup; do not run them until the target is explicitly verified as disposable. Never use `pnpm test` as a database-safety check.

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
