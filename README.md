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

# Set up database
cd prisma && npx prisma migrate dev --name init

# Start development server
pnpm dev
```

### Docker Compose (optional)

```bash
docker-compose up -d
```

## Available Scripts

| Script | Command |
|---|---|
| Development | `pnpm dev` |
| Build | `pnpm build` |
| Start production | `pnpm start` |
| Lint | `pnpm lint` |
| Type check | `pnpm tsc --noEmit` |
| Prisma migrate | `cd prisma && npx prisma migrate dev` |
| Prisma generate | `cd prisma && npx prisma generate` |
| Prisma studio | `cd prisma && npx prisma studio` |

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

**Phase 1: Foundation** — Project scaffolding, tooling configuration, and environment setup. No business features implemented yet.
