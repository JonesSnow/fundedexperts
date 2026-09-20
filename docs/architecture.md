# Architecture Document

**Status:** Phase 1 — Foundation  
**Last Updated:** 2026-09-20

## 1. Architecture Decisions

### 1.1 Single Next.js Application

The entire platform runs as a single Next.js application using the App Router.
- Server Components for data-fetching and server-side logic
- Client Components only where interactivity requires it
- API routes under `app/api/` for any external-facing endpoints

**Rationale:** Reduces operational complexity in early stages; monolith is sufficient for the feature set.

### 1.2 Manual MT5 Account Entry

MT5 accounts are created and managed through the admin panel, not via automated MT5 API provisioning.
- Admin UI provides forms for account creation, listing, and status management
- Accounts are stored in PostgreSQL via Prisma ORM

**Rationale:** Reduces dependency on MT5 API availability during development; easier to audit and debug.

### 1.3 Account Inventory and Allocation

- **Inventory:** A registry of all MT5 accounts (active, inactive, allocated, available)
- **Allocation:** The process of assigning an available MT5 account to a trader upon successful evaluation
- These are separate domain concepts — see AGENTS.md domain separation rules

### 1.4 Configurable and Versioned Rulesets

- Rulesets define evaluation criteria (e.g., profit targets, drawdown limits, trading hours)
- Each ruleset has a version number; changes create a new version rather than mutating
- Active evaluation runs reference a specific ruleset version at the time of evaluation

### 1.5 Monitoring Service as Separately Testable Component

- MT5 monitoring (connection status, account health, market data) lives in `lib/monitoring/`
- It is designed to be testable independently of the web framework
- Can be run as a background service or invoked on-demand via API routes

### 1.6 Evidence and Audit Logging

- All evaluation decisions, rule changes, and admin actions are logged
- Audit logs are append-only records stored in PostgreSQL
- Evidence (screenshots, trade records) is associated with evaluation events

### 1.7 Evaluation and Funded Account Separation

- **Evaluation phase:** Trader takes a funded challenge test under a specific ruleset
- **Funded account:** After passing evaluation, trader receives a live funded account
- These are distinct lifecycle states with different rules, data models, and API surfaces

## 2. Domain Model

The following entities and relationships are approved for the Prisma schema:

### 2.1 Trader

The core user entity — a registered trader who undergoes evaluation.

- **Evaluations** → MT5 Account Assignment → Ruleset Version
- **Funded Accounts**

### 2.2 MT5 Account

A MetaTrader 5 account instance (manual entry or allocated).

- **Inventory** — registry of all accounts (active, inactive, allocated, available)
- **Credentials** — encrypted connection credentials
- **Health** — connection status and health metrics
- **Assignment History** — record of assignments to traders

### 2.3 Ruleset

Configurable evaluation rules with versioning.

- **Ruleset Version** — immutable snapshot of rules at a point in time
  - **Individual Rules** — single criteria (profit target, drawdown limit, trading hours, etc.)

### 2.4 AuditLog

Immutable system events — evaluation decisions, rule changes, admin actions.

## 3. Technology Stack

| Component | Technology |
|---|---|
| Web Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| ORM | Prisma |
| Database | PostgreSQL |
| Package Manager | pnpm |
| Linting | ESLint |

## 4. Unresolved Technical Questions

### 4.1 XM MT5 Connectivity

> **Status:** BLOCKER  
> **Owner:** Architecture lead / DevOps  
> **Description:** XM (the broker) may require specific API connectivity methods. The current assumption is manual MT5 account entry through the admin panel. If XM provides an API for account provisioning, this decision needs revisiting.
>
> **Action required:** Confirm with product/backend team whether XM exposes any API endpoints for MT5 account management before designing automated provisioning. Do not assume capabilities that have not been documented or approved.

### 4.2 Real-Time Monitoring Frequency

> **Status:** OPEN  
> **Description:** The monitoring service interval (e.g., every 30s vs 60s) and method (polling vs WebSocket) have not been finalized. This depends on MT5 API capabilities and broker restrictions.

### 4.3 Database Deployment Strategy

> **Status:** OPEN  
> **Description:** PostgreSQL will be used for development and likely production, but the deployment method (managed service, Docker, self-hosted) has not been decided. Prisma Migrate will handle schema evolution regardless.

## 5. Folder Conventions

```
app/              Routes, layouts, API routes (Next.js App Router)
components/       React components (UI-only, minimal business logic)
lib/              Utilities, services, domain logic, monitoring
prisma/           schema.prisma, migrations, seed scripts
docs/             Architecture decisions, ADRs, product docs
tests/            Unit, integration, and e2e tests
public/           Static assets (images, icons, fonts)
```

## 6. Non-Goals (Phase 1)

- No real payment processing (crypto payment workflow is planned but not yet implemented)
- No real email/SMS delivery (SMTP config is a placeholder)
- No production MT5 monitoring (simulation only)
- No multi-tenant architecture
- No microservices
