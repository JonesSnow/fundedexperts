# Phase 25 WP5: Cloud Architecture Review

**Date:** 2026-09-22
**Phase:** 25
**Status:** COMPLETED

---

## 1. Application Deployment (Vercel)

| Check | Status | Detail |
|-------|--------|--------|
| Next.js build passes | PASS | Compiled successfully in 1155ms |
| All routes compile | PASS | 19 routes (static + dynamic) |
| Server Components | PASS | App Router default |
| Client Components | PASS | Login, register, admin pages |
| API routes | PASS | 18 API route files |
| Static export | N/A | Not configured; SSR mode |
| Vercel deployment | ASSUMED | Next.js on Vercel is standard |
| Environment variables | PASS | .env.local with DATABASE_URL, JWT_SECRET, MT5_ENCRYPTION_KEY |
| Build output | PASS | `.next/` directory |
| Middleware | PASS | Auth middleware on /admin/* and /dashboard/* |

### Vercel Configuration

| Setting | Recommendation |
|---------|---------------|
| Framework | Next.js 16.3.5 |
| Build command | `next build` |
| Output directory | `.next` |
| Node version | 20+ |
| Environment | Production (NODE_ENV=production) |

### Free Tier Limitations

- Vercel free tier: 100GB bandwidth/month, 400 build minutes/month
- Serverless function execution: 10s timeout on free tier
- May need upgrade for production traffic

---

## 2. Database Connectivity (Neon PostgreSQL)

| Check | Status | Detail |
|-------|--------|--------|
| Connection works | PASS | `scripts/test-fk.ts` PASSED |
| Query execution | PASS | `SELECT 1 as ok` returned |
| Connection pooling | WARNING | Serverless pooler (no dedicated pool) |
| Prisma connect | PASS | PrismaClient connects successfully |
| Migration support | PASS | 5 migrations exist and apply |
| Schema validation | PASS | `prisma validate` passes |
| SSL required | PASS | `sslmode=require` in connection string |
| Connection limit | WARNING | Serverless pooler has limits |
| Interactive timeout | WARNING | Neon has 5s interactive timeout |
| Intermittent connectivity | WARNING | P1001 errors observed during testing |

### Connection String Format

```
postgresql://neondb_owner:[password]@ep-gentle-pine-b4sgpi7e-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

### Free Tier Limitations

- Neon free tier: 0.5 vCPU, 512MB RAM, 1GB storage
- Connection pool: Serverless (auto-scaling)
- 90-day retention for backup history
- Auto-suspend after 5 minutes of inactivity (dev)

---

## 3. AWS Windows EC2 (MT5 and Monitoring Worker)

| Check | Status | Detail |
|-------|--------|--------|
| EC2 instance type | ASSUMED | Windows Server 2022 |
| MT5 installation | BLOCKED | No authorized credentials |
| MT5 login | BLOCKED | Requires broker credentials |
| Monitoring worker | BLOCKED | Not deployed |
| Windows licensing | WARNING | Windows EC2 has additional cost |
| Security group | ASSUMED | Must restrict to Vercel IPs + worker IPs |
| RDP access | ASSUMED | Admin access for MT5 |
| EBS storage | ASSUMED | MT5 data + logs |
| Auto-recovery | ASSUMED | Need to configure |

### Required AWS Setup

| Resource | Purpose | Security |
|----------|---------|----------|
| EC2 Windows instance | MT5 + worker | Security group: RDP from admin IP only, HTTP/HTTPS from Vercel |
| Security group inbound | RDP (3389), HTTP (80), HTTPS (443) | Restrict by IP |
| Security group outbound | HTTPS (443) to Neon, Vercel | Open |
| EBS volume | MT5 data, logs | Encrypted |
| IAM role | Minimal permissions | No S3 if not needed |
| Elastic IP | Static IP for worker | Single IP |

### Firewall Rules

| Rule | Source | Port | Purpose |
|------|--------|------|---------|
| RDP | Admin IP only | 3389 | Server management |
| HTTPS | Vercel IPs | 443 | API access |
| HTTPS | Neon IPs | 443 | DB access |
| Outbound | All | 443 | Internet access |

---

## 4. Source Control and CI/CD (GitHub)

| Check | Status | Detail |
|-------|--------|--------|
| Git repository | PASS | Git repo initialized |
| Branch management | PASS | master branch |
| Commit history | PASS | Working tree uncommitted |
| CI/CD pipeline | MISSING | No GitHub Actions configured |
| Automated testing | MISSING | No CI workflow |
| Automated deployment | MISSING | No deploy workflow |
| Environment separation | ASSUMED | .env.example has template |
| Secret management | WARNING | Secrets in .env.local, no vault |

### CI/CD Recommendations

| Workflow | Trigger | Actions |
|----------|---------|---------|
| Test | PR to master | ESLint, TypeScript, Next.js build, non-DB tests |
| Deploy | Merge to master | Vercel auto-deploy (built-in) |
| Database migrate | Deploy | Prisma migrate deploy |
| Security scan | Weekly | npm audit, vulnerability scan |

---

## 5. Worker-to-Application Communication

| Check | Status | Detail |
|-------|--------|--------|
| API endpoint for worker | ASSUMED | Worker would call app API |
| Worker authentication | MISSING | No worker auth mechanism |
| HTTPS required | PASS | All APIs use HTTPS in production |
| Health check endpoint | MISSING | No worker health endpoint |
| Worker status reporting | MISSING | No worker status API |

### Recommended Architecture

```
Worker → App API (HTTPS) → Database (Neon)
         ↑
         Vercel (user requests)
```

---

## 6. Worker Health Checks

| Check | Status | Detail |
|-------|--------|--------|
| Worker heartbeat | MISSING | No heartbeat mechanism |
| Health endpoint | MISSING | No /health endpoint |
| Process monitoring | MISSING | No external monitoring |
| Auto-restart | ASSUMED | Need Windows service config |
| Log aggregation | MISSING | No centralized logging |

---

## 7. Restart and Recovery

| Check | Status | Detail |
|-------|--------|--------|
| Worker auto-restart | ASSUMED | Windows service needed |
| MT5 auto-restart | ASSUMED | MT5 auto-start config needed |
| DB auto-recovery | PASS | Neon managed service |
| App auto-restart | PASS | Vercel managed |
| Failed job recovery | PASS | Stale job recovery in worker |
| Disaster recovery plan | MISSING | No DR plan documented |
| Backup strategy | MISSING | No backup schedule |
| RTO target | MISSING | No recovery time objective |
| RPO target | MISSING | No recovery point objective |

---

## 8. Logging

| Check | Status | Detail |
|-------|--------|--------|
| Application logging | MISSING | No general app logger |
| Worker logging | PASS | Ring buffer logger |
| Error logging | MISSING | No centralized error logger |
| Access logging | PASS | Audit log |
| Log persistence | MISSING | Ring buffer is in-memory |
| Log aggregation | MISSING | No ELK/cloud logging |
| Log retention | MISSING | No retention policy |

---

## 9. Monitoring

| Check | Status | Detail |
|-------|--------|--------|
| System monitoring | MISSING | No uptime monitoring |
| Performance monitoring | MISSING | No APM |
| Error tracking | MISSING | No error tracking service |
| Database monitoring | PASS | Neon dashboard |
| Worker monitoring | MISSING | No worker health checks |
| Alert configuration | MISSING | No alerting |

---

## 10. Free-Tier Limitations Summary

| Service | Free Tier | Limitation | Impact |
|---------|-----------|------------|--------|
| Vercel | 100GB BW, 400 build min | Serverless 10s timeout | May need Pro plan |
| Neon | 0.5 vCPU, 512MB, 1GB | Connection limits, 5s timeout | May need Standard |
| AWS EC2 | Free tier eligible (12mo) | Windows has extra cost | Budget needed |
| GitHub | Unlimited public/private | CI/CD free for private repos | OK |

---

## 11. Future Scaling

| Component | Current | Scaling Path |
|-----------|---------|-------------|
| App | Single Next.js | Vercel auto-scales |
| Database | Neon serverless | Auto-scaling with limits |
| Worker | Single EC2 | Add more EC2 instances |
| MT5 | Single MT5 per account | Multiple MT5 instances |
| Caching | None | Add Redis |
| CDN | None | Add CloudFront |
| Queue | In-memory | Add Redis/BullMQ |

---

## 12. Backup and Disaster Recovery

| Check | Status | Detail |
|-------|--------|--------|
| Database backup | MISSING | No backup configured |
| Backup schedule | MISSING | No schedule |
| Backup retention | MISSING | No retention policy |
| Cross-region backup | MISSING | No cross-region copy |
| Application backup | MISSING | No app state backup |
| DR plan | MISSING | No disaster recovery plan |
| RTO | MISSING | No recovery time objective |
| RPO | MISSING | No recovery point objective |

---

## Cloud Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    User Browser                     │
│                       │                             │
│                       ▼                             │
│              ┌────────────────┐                     │
│              │    Vercel      │                     │
│              │  (Next.js App) │                     │
│              └───────┬────────┘                     │
│                      │                             │
│          ┌───────────┼───────────┐                  │
│          ▼           ▼           ▼                  │
│     Admin UI    Dashboard   API Routes             │
│          │           │           │                  │
│          └───────────┼───────────┘                  │
│                      │                             │
│                      ▼                             │
│              ┌────────────────┐                     │
│              │  Neon PG       │                     │
│              │  (Serverless)  │                     │
│              └────────────────┘                     │
│                                                      │
│  ┌─────────────────────┐  ┌──────────────────┐      │
│  │  AWS Windows EC2    │  │  Monitoring      │      │
│  │  (MT5 + Worker)     │  │  Worker          │      │
│  │                      │  │  (in-progress)   │      │
│  └─────────────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────┘
```

---

## Changes Required Before Cloud Deployment

| # | Change | Priority | Risk |
|---|--------|----------|------|
| 1 | Create CI/CD pipeline | HIGH | Low |
| 2 | Configure database backup | HIGH | Low |
| 3 | Set up monitoring/alerting | HIGH | Low |
| 4 | Add worker authentication | HIGH | Medium |
| 5 | Add health check endpoint | MEDIUM | Low |
| 6 | Configure AWS security groups | HIGH | Low |
| 7 | Document backup/DR procedures | MEDIUM | Low |
| 8 | Add application logging | MEDIUM | Low |
| 9 | Set up error tracking | MEDIUM | Low |
| 10 | Add CDN for static assets | LOW | Low |
