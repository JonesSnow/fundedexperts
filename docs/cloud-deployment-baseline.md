# Phase 26 WP2 — Cloud and Deployment Baseline

**Date:** 2026-09-22
**Phase:** 26
**WP:** 2
**Status:** COMPLETED

---

## 1. Application Compatibility Assessment

### 1.1 Server-Side Code (Runs on Cloud/Edge)

| Component | Location | Vercel Compatible | Notes |
|-----------|----------|-------------------|-------|
| API routes | `app/api/**/route.ts` | YES | Standard Next.js API routes |
| Server components | All `app/**/page.tsx` without `'use client'` | YES | SSR on Vercel |
| Middleware | `middleware.ts` | YES | Runs at edge (deprecated convention) |
| Prisma ORM | All API routes, middleware | YES | Server-only, connects to Neon |
| Lib services (auth, encryption, allocation, monitoring) | `lib/**/*.ts` | YES | No browser-only APIs |
| Background job definitions | `lib/monitoring/job.ts` etc. | YES | Definitions only |

### 1.2 Browser-Side Code (Runs in User Browser)

| Component | Location | Notes |
|-----------|----------|-------|
| Admin pages | `app/admin/**/*.tsx` | All `'use client'` — client components |
| Dashboard | `app/dashboard/page.tsx` | Static placeholder, no client logic |
| Home page | `app/page.tsx` | Default Next.js starter (no custom logic) |
| Monitoring UI | No dedicated UI | Future feature |

### 1.3 Long-Running Processes (Cannot Run in Serverless)

| Process | Location | Duration | Cannot Be |
|---------|----------|----------|-----------|
| Monitoring Worker | `lib/monitoring/worker.ts` | Indefinite (job lifecycle) | Serverless request handler |
| Monitoring Scheduler | `lib/monitoring/scheduler.ts` | Indefinite (continuous loop) | Serverless request handler |
| Monitoring health checks | `lib/monitoring/health.ts` | Periodic (every 30-60s) | Serverless cron (15min max) |
| MT5 terminal connection | External process | Continuous | Serverless |

### 1.4 Vercel Compatibility Issues

| Issue | Severity | Resolution |
|-------|----------|------------|
| Middleware deprecation (Next.js 16 → proxy) | MEDIUM | Migrate to middleware proxy pattern before production |
| Monitoring worker/scheduler in-memory | CRITICAL | Must be separate deployment (not Vercel) |
| `PrismaClient` at module level in API routes | LOW | Vercel serverless handles this; connection pooling recommended |
| `app/page.tsx` is Next.js starter | LOW | Replace before production launch |
| Dashboard placeholder | LOW | Replace before production launch |

---

## 2. Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CDN / Edge                               │
│                   (Vercel Edge Network)                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                   Vercel (Web App + API)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Next.js 16 Application                                   │  │
│  │ ├── SSR Pages (admin, dashboard, login, register)        │  │
│  │ ├── API Routes (/api/**)                                 │  │
│  │ ├── Middleware (auth, redirects)                         │  │
│  │ └── Static Assets                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                      │
│              ┌───────────▼───────────┐                          │
│              │ Neon PostgreSQL       │                          │
│              │ (Serverless Pooler)   │                          │
│              │ DATABASE_URL          │                          │
│              └───────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ (Worker-to-API communication)
                          │
┌──────────────────────────▼──────────────────────────────────────┐
│               AWS EC2 Windows (or Windows VM)                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Monitoring Worker (separate process)                      │  │
│  │ ├── Worker loop (pulls jobs from DB)                      │  │
│  │ ├── MT5 Terminal Bridge (Python + MT5 terminal)           │  │
│  │ ├── Credential decryption (lib/encryption.ts)             │  │
│  │ └── Writes results to DB (MonitoringJob, RuleEvent)       │  │
│  │                                                           │  │
│  │ Scheduler (separate process OR worker module)             │  │
│  │ ├── Pulls MonitoringJob records with status=PENDING       │  │
│  │ ├── Dispatches to Worker                                  │  │
│  │ └── Updates job status                                    │  │
│  │                                                           │  │
│  │ MT5 Terminal                                              │  │
│  │ └── MetaTrader 5 terminal64.exe                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                      │
│              ┌───────────▼───────────┐                          │
│              │ Neon PostgreSQL       │                          │
│              │ (same database)       │                          │
│              │ (Worker writes here)  │                          │
│              └───────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### Architecture Boundaries

| Boundary | Description | Why |
|----------|-------------|-----|
| Web App ↔ API | Same deployment (Vercel) | Next.js App Router unifies them |
| API ↔ Database | Direct connection from Vercel serverless | Neon serverless pooler supports this |
| Worker ↔ Database | Direct connection from EC2 | Worker polls DB for jobs |
| Worker ↔ API | Optional (worker writes directly to DB) | Reduces API load; worker needs DB access for job management |
| Worker ↔ MT5 Terminal | Local socket/pipe | MT5 terminal bridge is local-only |
| Vercel ↔ EC2 | No direct connection | Worker exposes health endpoint for API to query |

---

## 3. Deployment Boundaries

### 3.1 Web Application (Vercel)

| Aspect | Detail |
|--------|--------|
| Platform | Vercel (free tier sufficient for initial launch) |
| Runtime | Next.js 16 serverless functions |
| Scale | Auto-scaling, global CDN |
| Cold start | ~250-500ms for serverless functions |
| Limits | 12s serverless timeout (Hobby), 60s (Pro) |
| Environment | `.env.local` values → Vercel Environment Variables |

### 3.2 Database (Neon)

| Aspect | Detail |
|--------|--------|
| Platform | Neon (serverless PostgreSQL) |
| Tier | Free tier (1 NCU, 1GB) for development; Business for production |
| Connection | Serverless pooler (connection pooling built-in) |
| Branching | Neon branching for staging/development |
| Backups | Automated (Neon-managed), retention per plan |

### 3.3 Monitoring Worker (AWS EC2 Windows)

| Aspect | Detail |
|--------|--------|
| Platform | AWS EC2 Windows (or alternative Windows VPS) |
| Runtime | Node.js + Python (MT5 bridge) |
| Process | Long-running daemon (PM2 or Windows Service) |
| MT5 Terminal | Installed on same Windows instance |
| Why Windows | MT5 terminal requires Windows |
| Scale | Single instance initially; horizontal scaling requires job partitioning |

### 3.4 What NOT on Vercel

| Component | Reason |
|-----------|--------|
| Monitoring Worker | Long-running; Vercel serverless 12s timeout |
| Scheduler | Long-running; needs persistent state |
| MT5 Terminal | Windows-only; not compatible with Vercel |
| Background cron (sub-15min) | Vercel cron has 15min minimum interval |

---

## 4. Environment Matrix

### 4.1 Environments

| Environment | Purpose | Database | Worker | URL | Auth Required |
|-------------|---------|----------|--------|-----|---------------|
| **Local Dev** | Development, testing | Local Neon or Docker | Not running | localhost:3000 | No (dev mode) |
| **Staging** | Pre-production validation | Neon staging branch | Staging EC2 (small) | staging.fundedexperts.com | Yes (admin) |
| **Production** | Live traffic | Neon production | Production EC2 | fundedexperts.com | Yes |

### 4.2 Environment Variable Matrix

| Variable | Local | Staging | Production | Sensitive |
|----------|-------|---------|------------|-----------|
| `DATABASE_URL` | ✅ | ✅ | ✅ | YES |
| `JWT_SECRET` | ✅ | ✅ | ✅ | YES |
| `MT5_ENCRYPTION_KEY` | ✅ | ✅ | ✅ | YES |
| `NODE_ENV` | ✅ | ✅ | ✅ | No |
| `NEXT_PUBLIC_SITE_URL` | ✅ | ✅ | ✅ | No |
| `NEXT_PUBLIC_API_URL` | ✅ | ✅ | ✅ | No |
| `MT5_API_URL` | ❌ | ❌ | ❌ | NO — not used |
| `MT5_API_KEY` | ❌ | ❌ | ❌ | NO — not used |
| `MT5_API_SECRET` | ❌ | ❌ | ❌ | NO — not used |
| `REDIS_URL` | ❌ | ❌ | ❌ | NO — not used |
| `SMTP_*` | ❌ | ❌ | ❌ | NO — not used |
| `MT5_TERMINAL_PATH` | ✅ | ✅ | ✅ | No |
| `WORKER_ID` | ✅ | ✅ | ✅ | No |
| `WORKER_API_TOKEN` | ✅ | ✅ | ✅ | YES |

**Note:** All SMTP, Redis, and MT5 API variables in `.env.example` are NOT used by the current implementation. They are documentation only.

### 4.3 Environment Separation Rules

1. Staging database is a Neon branch (separate compute, same storage layer)
2. Staging worker runs on separate EC2 instance (smaller size)
3. Production secrets never copied to staging manually — set via Vercel/CI
4. Development may use local PostgreSQL or Neon local dev
5. Test database is a separate Neon project or branch
6. No shared secrets across environments

---

## 5. Required Environment Variables

### 5.1 Web Application (Vercel)

| Variable | Required | Description | Type |
|----------|----------|-------------|------|
| `DATABASE_URL` | YES | Neon PostgreSQL connection string | Secret |
| `JWT_SECRET` | YES | JWT signing key (min 32 chars) | Secret |
| `MT5_ENCRYPTION_KEY` | YES | AES-256-GCM key for MT5 credentials (min 32 chars) | Secret |
| `NEXT_PUBLIC_SITE_URL` | NO | Public site URL | Public |
| `NEXT_PUBLIC_API_URL` | NO | Public API URL | Public |

### 5.2 Monitoring Worker (EC2 Windows)

| Variable | Required | Description | Type |
|----------|----------|-------------|------|
| `DATABASE_URL` | YES | Same Neon database | Secret |
| `MT5_ENCRYPTION_KEY` | YES | For credential decryption | Secret |
| `WORKER_ID` | YES | Unique worker identifier | Public |
| `WORKER_API_TOKEN` | YES | Auth token for worker-to-API communication | Secret |
| `MT5_TERMINAL_PATH` | YES | Path to terminal64.exe | Public |
| `WORKER_TIMEOUT_MS` | NO | Job timeout (default: 10000) | Public |

### 5.3 Secrets Management

| Method | Status | Notes |
|--------|--------|-------|
| Vercel Environment Variables | RECOMMENDED | Built-in secret management |
| AWS Secrets Manager | FUTURE | For EC2 worker secrets |
| `.env.local` (local only) | CURRENT | Gitignored, never committed |
| `.env.example` | CURRENT | Template with placeholder values only |

**Never:** Hardcode secrets in source code, commit `.env.local`, log secret values, or expose in API responses.

---

## 6. Worker Architecture

### 6.1 Current State

| Component | File | Status | Deployment |
|-----------|------|--------|------------|
| Monitoring Job model | `prisma/schema.prisma` | EXISTS (14 fields) | Database |
| Monitoring Job executor | `lib/monitoring/job.ts` | EXISTS | Worker process |
| Monitoring Worker class | `lib/monitoring/worker.ts` | EXISTS (274 lines) | Separate deployment |
| Monitoring Scheduler | `lib/monitoring/scheduler.ts` | EXISTS (196 lines, in-memory) | Separate deployment |
| Monitoring adapters | `lib/monitoring/adapter.ts`, `mock-adapter.ts` | EXISTS | Worker process |
| Monitoring health | `lib/monitoring/health.ts` | EXISTS | Worker process |
| Monitoring logger | `lib/monitoring/logger.ts` | EXISTS | Worker process |
| Monitoring credential boundary | `lib/monitoring/credential-boundary.ts` | EXISTS | Worker process |

### 6.2 Required Separation

The current architecture has monitoring code in the `lib/` directory (importable by Next.js), but it MUST run as a separate process, not inside Vercel serverless functions.

**Architecture:**
1. A separate Node.js process runs the Worker + Scheduler
2. This process runs on AWS EC2 Windows (same machine as MT5 terminal)
3. The worker polls `MonitoringJob` table for `PENDING` jobs
4. The worker executes jobs using `lib/monitoring/worker.ts`
5. The worker writes results back to `MonitoringJob`, `RuleEvent` tables
6. The worker can optionally expose a health endpoint for API polling

**What CANNOT run on Vercel:**
- Any long-running job (timeout: 12-60s max)
- Continuous polling loops
- MT5 terminal bridge (requires Windows + persistent process)

### 6.3 Worker Deployment Design

```
EC2 Windows Instance
├── Node.js Process (PM2 or Windows Service)
│   ├── Worker (lib/monitoring/worker.ts)
│   ├── Scheduler (lib/monitoring/scheduler.ts)
│   └── Health endpoint (lib/monitoring/health.ts)
├── MetaTrader 5 Terminal (terminal64.exe)
├── Python MT5 Bridge (optional)
└── Node.js Runtime (v20+)
```

### 6.4 Worker-to-API Communication

| Method | Status | Notes |
|--------|--------|-------|
| Direct DB writes | CURRENT | Worker writes to DB directly (no API layer) |
| HTTP API endpoint | FUTURE | `/api/monitoring/health` for health checks |
| Message queue | FUTURE | Redis/BullMQ for job distribution |
| WebSocket | FUTURE | Real-time status updates |

---

## 7. File System Assumptions

| Assumption | Finding | Impact |
|------------|---------|--------|
| Write access for logs | No log files written; all logs in DB | OK for Vercel |
| Write access for uploads | No upload functionality | OK for Vercel |
| Write access for cache | In-memory rate limiting only | NEEDS Redis for multi-instance |
| MT5 terminal path | `D:\programs\MetaTrader 5\terminal64.exe` (local dev) | Windows-only; EC2 Windows required |
| Worker process persistence | No persistence mechanism | In-memory scheduler loses data on restart |
| Static assets | `public/` directory | OK for Vercel CDN |
| Next.js `.next` build output | Standard Vercel build | OK for Vercel |

---

## 8. Windows-Specific Dependencies

| Dependency | Location | Purpose | Alternative |
|------------|----------|---------|-------------|
| MetaTrader 5 Terminal | `D:\programs\MetaTrader 5\terminal64.exe` | Live MT5 monitoring | None — MT5 is Windows-only |
| Python + MetaTrader5 package | System Python | MT5 bridge | None — Python MT5 requires Windows |
| PM2 (or Windows Service) | EC2 instance | Worker process management | Docker (Windows container) |

---

## 9. Cost and Resource Considerations

### 9.1 Vercel (Web App + API)

| Tier | Monthly Cost | Limits | Suitability |
|------|-------------|--------|-------------|
| Free | $0 | 100GB bandwidth, 100K edge invocations, 6K build min | Development, demo |
| Hobby | $20/domain | 1TB bandwidth, 1M edge invocations, unlimited builds | Small production |
| Pro | $20/domain (per member) | Unlimited | Production with team |

### 9.2 Neon (PostgreSQL)

| Tier | Monthly Cost | Compute | Storage | Suitability |
|------|-------------|---------|---------|-------------|
| Free | $0 | 0.5 NCU, 100MB | 1GB | Development |
| Starter | $19 | 1 NCU, 1GB | 10GB | Small production |
| Basic | $85 | 2 NCU, 4GB | 40GB | Production |
| Business | $265 | 4 NCU, 8GB | 80GB | Scaling production |

### 9.3 AWS EC2 Windows (Worker + MT5)

| Instance | Monthly Cost | OS | Notes |
|----------|-------------|-----|-------|
| t3.small | ~$18 | Windows Server | Minimum for worker + MT5 |
| t3.medium | ~$27 | Windows Server | Recommended for production |
| t3.large | ~$43 | Windows Server | If running MT5 terminal + worker |

**Important:** These are AWS on-demand prices. Actual costs may vary. Spot instances not recommended for continuous worker. Windows Server license included in EC2 pricing.

### 9.4 Estimated Total (Initial Production)

| Component | Monthly Cost |
|-----------|-------------|
| Vercel Hobby | $20 |
| Neon Starter | $19 |
| EC2 t3.small Windows | $18 |
| **Total** | **~$57/month** |

**Before any paid resource is created, user authorization is required.**

---

## 10. Deployment Blockers

| # | Blocker | Type | Resolution |
|---|---------|------|------------|
| 1 | No Vercel account/project | BLOCKED | Create Vercel project, link repo |
| 2 | No AWS account/EC2 instance | BLOCKED | Provision EC2 Windows (requires authorization) |
| 3 | No MT5 terminal on Windows host | BLOCKED | Install MT5 + Python bridge |
| 4 | Middleware deprecation | WARNING | Migrate to proxy pattern before production |
| 5 | Monitoring worker not deployed | BLOCKED | Deploy separate Node.js process |
| 6 | No domain/subdomain configured | BLOCKED | Register domain, configure Vercel |
| 7 | No SSL/TLS certificate | BLOCKED | Auto-provisioned by Vercel; EC2 requires separate |

---

## 11. Security Concerns

| Concern | Severity | Current State | Mitigation |
|---------|----------|---------------|------------|
| Secrets in source code | HIGH | None found — `.env.local` gitignored | Continue current practice |
| API route auth | MEDIUM | All API routes check session + role | Maintain pattern |
| MT5 credential exposure | CRITICAL | Encryption at rest, decrypt boundary documented | Worker must NOT expose decrypted creds in API |
| CORS misconfiguration | MEDIUM | Not explicitly configured | Vercel default is restrictive |
| CSRF protection | MEDIUM | Cookie-based session with SameSite=Strict | Adequate for current architecture |
| Worker auth (worker↔API) | HIGH | `WORKER_API_TOKEN` in env (not implemented) | Implement before production |
| SQL injection | LOW | Prisma parameterized queries | Maintain ORM usage |
| XSS | LOW | Next.js auto-escapes; React safe | Maintain current patterns |

---

## 12. Manual Steps Requiring User Authorization

| # | Step | Cost | Action Required |
|---|------|------|-----------------|
| 1 | Create Vercel project | Free-$20/mo | Link GitHub repo, configure env vars |
| 2 | Provision AWS EC2 Windows | $18-$43/mo | **Authorization required before creating** |
| 3 | Install MT5 Terminal on EC2 | Free | Download and install on Windows instance |
| 4 | Configure monitoring worker deployment | Free | Deploy Node.js process to EC2 |
| 5 | Register domain | $10-15/yr | Purchase and configure DNS |
| 6 | Set up staging environment | $19-57/mo | Neon branch + staging EC2 |
| 7 | Configure CI/CD | Free | GitHub Actions in repo |
| 8 | Database backup configuration | Free-tier included | Neon automated backups |

**No paid resources may be created without explicit user authorization.**

---

## 13. Dependency Compatibility

| Dependency | Vercel Compatible | EC2 Compatible | Notes |
|-----------|-------------------|----------------|-------|
| next@16.3.5 | YES | YES | |
| react@19 | YES | YES | |
| prisma@6.19.3 | YES | YES | |
| @prisma/client@6.19.3 | YES | YES | |
| typescript@5 | YES | YES | |
| tailwindcss@4 | YES | YES | |
| @tailwindcss/postcss@4 | YES | YES | |
| bcrypt@6.0.0 | YES | YES | Native module — compiles on target |
| jose@6.2.12 | YES | YES | Pure JS |
| tsx@4.23.13 | YES (dev) | YES (dev) | For running scripts |
| pnpm (package manager) | YES (Vercel build) | YES | |

---

## 14. Status Summary

| Deliverable | Status | Notes |
|-------------|--------|-------|
| Proposed architecture | COMPLETE | See §2 |
| Deployment boundaries | COMPLETE | See §3 |
| Environment matrix | COMPLETE | See §4 |
| Required environment variables | COMPLETE | See §5 |
| Worker architecture | COMPLETE | See §6 |
| Cost and resource risks | COMPLETE | See §9 |
| Deployment blockers | COMPLETE | See §10 |
| Security concerns | COMPLETE | See §11 |
| Manual steps requiring authorization | COMPLETE | See §12 |
| Dependency compatibility | COMPLETE | See §13 |
| Cloud deployment as COMPLETE | NO | Not deployed — documentation only |
