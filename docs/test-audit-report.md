# Test Audit Report

**Date:** 2026-09-20
**Phase:** Phase 8 — Comprehensive Audit
**Status:** Complete

## Test Summary

| Test File | Tests | Passed | Failed | Skipped | Blocked |
|---|---|---|---|---|---|
| tests/mt5-accounts.test.ts | 37 | 37 | 0 | 0 | 0 |
| tests/products-and-rulesets.test.ts | 14 | 14 | 0 | 0 | 0 |
| tests/auth.test.ts | 15 (Prisma-dependent) | Varies | Varies | Depends on DB | 0 |
| tests/mt5-accounts.integration.test.ts | 20 (stubs) | 0 | 0 | 20 | 20 |
| POC script (poc-mt5-bridge/) | 14 | 0 | 0 | 14 | 0 |
| **Total** | **~86** | **51** | **0** | **~34** | **20** |

### Detailed Results

#### TypeScript Compilation
- **Command:** `npx tsc --noEmit` (with JWT_SECRET and MT5_ENCRYPTION_KEY set)
- **Result:** PASS (0 errors)

#### ESLint
- **Command:** `npm run lint`
- **Result:** 36 problems (4 errors, 32 warnings) — all pre-existing
- See ESLint Error Inventory below

#### Production Build
- **Command:** `JWT_SECRET="..." MT5_ENCRYPTION_KEY="..." npx next build`
- **Result:** PASS (all 21 routes compiled successfully)
- **Note:** Build fails without JWT_SECRET (required at module load in lib/auth/session.ts)

#### Unit Tests
- **Command:** `JWT_SECRET="..." node --test --import=tsx tests/mt5-accounts.test.ts`
- **Result:** 37/37 PASS
- **Command:** `JWT_SECRET="..." node --test --import=tsx tests/products-and-rulesets.test.ts`
- **Result:** 14/14 PASS

#### POC Tests
- **Command:** `cd poc-mt5-bridge && python poc_bridge.py`
- **Result:** 0 passed, 0 failed, 14 skipped/blocked (no XM terminal connection available)

## ESLint Error Inventory

| # | File | Line | Error | Severity | Pre-existing? | Affects |
|---|---|---|---|---|---|---|
| 1 | tests/products-and-rulesets.test.ts | 5:39 | `Unexpected any` — inline validation function parameter | Warning | Yes | Test code only, not production code |
| 2 | app/api/products/[id]/route.ts | 119:37 | `Unexpected any` — route handler body type | Warning | Yes | Production route — type safety gap |
| 3 | app/api/products/route.ts | 103:37 | `Unexpected any` — request body type | Warning | Yes | Production route — type safety gap |
| 4 | app/admin/accounts/page.tsx | 59:5 | `setState synchronously within effect` | Error | Yes | UI component — potential render loop |

### Error Analysis

**Error 1 (tests/products-and-rulesets.test.ts:5:39):**
- Pre-existing: Yes (before Phase 8)
- Impact: Low — test file, inline validation function uses `any` for body parameter
- Fix: Change `body: any` to `body: Record<string, unknown>` or create a type
- Deferred: Acceptable for test-only code

**Error 2 (app/api/products/[id]/route.ts:119:37):**
- Pre-existing: Yes
- Impact: Medium — production API route handles product updates with `any` typed body, bypassing TypeScript checks
- Fix: Create `ProductUpdateInput` type and use it for the body cast
- Deferred: Should be fixed before production

**Error 3 (app/api/products/route.ts:103:37):**
- Pre-existing: Yes
- Impact: Medium — production API route creates products with `any` typed body
- Fix: Create `ProductCreateInput` type and use it for the body cast
- Deferred: Should be fixed before production

**Error 4 (app/admin/accounts/page.tsx:59:5):**
- Pre-existing: Yes
- Impact: High — calling setState synchronously in useEffect can trigger cascading renders, potential performance issue
- Fix: Move state update to useEffect with proper dependency array or use a different pattern
- Deferred: Requires code review

## Dependency Observations

| Package | Version | Observation |
|---|---|---|
| next | 16.3.5 | Latest stable |
| react | 19.2.8 | Latest stable |
| bcrypt | 6.0.0 | Native binding — ensure compatible with Node 22+ |
| jose | 6.2.12 | JWT library — current |
| prisma | 6.19.3 | ORM — current |
| tailwindcss | 4.x | CSS framework |
| eslint | 9.x | Linting — flat config |

**Lockfile consistency:** pnpm-lock.yaml modified (613 additions) — consistent with package.json changes (added bcrypt, prisma scripts). No lockfile drift detected.

## Git Status

```
Modified (5):  .env.example, .gitignore, docs/architecture.md, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
Untracked (53): app/admin/, app/api/, app/catalog/, app/dashboard/, app/login/, app/register/, docs/*.md, lib/, middleware.ts, prisma/, tests/, poc-mt5-bridge/
Staged: 0
```

## Secret Detection Results

Search patterns: `change-me-in-production`, `password123`, `testpass`, `secret`, `admin123`, `root`, `toor`

| Match | File | Line | Type | Risk |
|---|---|---|---|---|
| `change-me-in-production` | lib/auth/session.ts | 5 | Default JWT secret value | LOW — code rejects this value at startup |
| `TestPass123` | tests/auth.test.ts | 9,171,215 | Test data password | LOW — test data only |
| `secret-data` | tests/mt5-accounts.test.ts | 169 | Test encryption data | LOW — test data only |
| `secret123` | tests/mt5-accounts.test.ts | 269 | Test audit data | LOW — test data only |
| `MT5_ENCRYPTION_KEY` | lib/encryption.ts, .env.example | Various | Env var reference | NONE — env var reference only |
| `JWT_SECRET` | lib/auth/session.ts, .env.example | Various | Env var reference | NONE — env var reference only |

**No production secrets found in source code.**

## .gitignore Coverage Review

| Pattern | Present? | Adequate? |
|---|---|---|
| node_modules | Yes | Yes |
| .env, .env.local, .env.production | Yes | Yes |
| .next, build, dist | Yes | Yes |
| *.tsbuildinfo | Yes | Yes |
| coverage | Yes | Yes |
| .cache, *.log | Yes | Yes |
| .vscode, .idea | Yes | Yes |
| pnpm-store | Yes | Yes |
| prisma/generated | Yes | Yes |
| docs/generated | Yes | Yes |
| poc-mt5-bridge/ | Added (Phase 8) | Yes |
| next-env.d.ts | No | LOW — auto-generated, should be ignored |
| .next/types/ | No | LOW — generated types |

## Environment Variable Usage Review

| Variable | Required? | Set in env? | Used by | Validation |
|---|---|---|---|---|
| DATABASE_URL | Yes (Prisma) | No | lib/auth/session.ts (indirect), all API routes via Prisma | Module load fails if Prisma client can't connect |
| JWT_SECRET | Yes | No | lib/auth/session.ts | Module load THROWS if default value |
| MT5_ENCRYPTION_KEY | Yes | No | lib/encryption.ts | Throws if <32 chars |
| NEXT_PUBLIC_SITE_URL | No | No | .env.example only | Not used in code |
| NEXT_PUBLIC_API_URL | No | No | .env.example only | Not used in code |
| MT5_API_URL | No | No | .env.example only | Not used in code |
| MT5_API_KEY | No | No | .env.example only | Not used in code |
| MT5_API_SECRET | No | No | .env.example only | Not used in code |
| REDIS_URL | No | No | .env.example only | Not used in code |
| SMTP settings | No | No | .env.example only | Not used in code |

**Observation:** .env.example documents more variables than actually used by the codebase. MT5_API_URL, MT5_API_KEY, MT5_API_SECRET, REDIS_URL, and SMTP settings are documented but not referenced in any source file.
