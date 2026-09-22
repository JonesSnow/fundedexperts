# Known Limitations

**Date:** 2026-09-20
**Phase:** Phase 8 — Audit
**Status:** Complete

This document lists known limitations that are NOT defects but are acknowledged gaps in the current implementation. Each limitation is categorized and includes the recommended resolution path.

---

## Infrastructure Limitations

### IN-1: PostgreSQL Not Available
- **Category:** Database
- **Impact:** All integration tests blocked. Schema, migrations, transactions, concurrency, and referential integrity cannot be verified.
- **Affects:** tests/mt5-accounts.integration.test.ts (20 stubs), all Prisma-based operations
- **Resolution:** Install PostgreSQL with administrator access. See docs/test-environment.md for setup steps.

### IN-2: MT5 Terminal Not Logged In
- **Category:** External Integration
- **Impact:** No MT5/XM connectivity tests can be performed. No account data can be retrieved.
- **Affects:** All Phase 7B POC tests, docs/mt5-connectivity-investigation.md
- **Resolution:** Log into MT5 terminal with XM demo account credentials. Rerun poc-mt5-bridge/poc_bridge.py.

### IN-3: No Admin Rights on Environment
- **Category:** Infrastructure
- **Impact:** Cannot install PostgreSQL, MT5 terminal (if not present), or other system packages.
- **Affects:** All installation-dependent operations
- **Resolution:** Use existing installations or obtain admin access.

---

## Authentication Limitations

### AU-1: Stateless JWT Cannot Be Revoked
- **Category:** Session Management
- **Impact:** JWT tokens cannot be invalidated server-side. Logout only clears the cookie; valid tokens remain usable until 7-day expiry.
- **Affects:** All authenticated endpoints
- **Resolution:** Implement token blacklist (Redis or DB table) or use short-lived tokens with refresh tokens.

### AU-2: Rate Limiting Is Process-Local
- **Category:** Rate Limiting
- **Impact:** Rate limit counters reset on server restart. Does not work across multiple instances.
- **Affects:** /api/auth/login, /api/auth/register
- **Resolution:** Use Redis-backed rate limiting or external service. Documented in docs/authentication.md.

### AU-3: Middleware Does Not Check Account Status
- **Category:** Authorization
- **Impact:** SUSPENDED/INACTIVE users can access /admin and /dashboard UI pages before API rejection.
- **Affects:** All /admin/* and /dashboard/* paths
- **Resolution:** Add status check to middleware or page server components.

### AU-4: No Email Verification
- **Category:** Registration
- **Impact:** Registered emails are not verified. No way to confirm email ownership.
- **Affects:** /api/auth/register
- **Resolution:** Implement email verification flow (SMTP not yet configured).

### AU-5: No Password Recovery
- **Category:** Authentication
- **Impact:** No "forgot password" functionality exists.
- **Affects:** End users
- **Resolution:** Implement password reset flow with email tokens.

---

## MT5 Integration Limitations

### MT-1: No Decryption in API Layer
- **Category:** Credential Security
- **Impact:** Credentials can be encrypted but not decrypted via API routes. A separate worker service (lib/monitoring/) would be needed for decryption.
- **Affects:** Any workflow requiring credential retrieval
- **Resolution:** Implement monitoring worker in lib/monitoring/ or accept write-only credential lifecycle.

### MT-2: No Key Rotation
- **Category:** Credential Security
- **Impact:** MT5_ENCRYPTION_KEY cannot be rotated without re-encrypting all stored credentials.
- **Affects:** All MT5 accounts with stored credentials
- **Resolution:** Implement key rotation procedure with re-encryption migration.

### MT-3: No Monitoring Worker
- **Category:** MT5 Bridge
- **Impact:** lib/architecture.md references `lib/monitoring/` for the monitoring service but it does not exist.
- **Affects:** All monitoring functionality
- **Resolution:** Create lib/monitoring/ directory with bridge client implementation.

### MT-4: No Production Monitoring
- **Category:** MT5 Bridge
- **Impact:** POC cannot establish connection to MT5 terminal. No production monitoring is implemented.
- **Affects:** Real-time account monitoring
- **Resolution:** Complete POC with logged-in terminal, then build monitoring worker.

---

## Data Integrity Limitations

### DI-1: AuditLog No Foreign Key Constraints
- **Category:** Database
- **Impact:** AuditLog uses loose entityType/entityId references. If an entity is deleted, audit logs become orphaned.
- **Affects:** Audit trail integrity
- **Resolution:** Implement soft-delete for audited entities or add periodic cleanup.

### DI-2: Physical Deletion (Not Archival)
- **Category:** Data Lifecycle
- **Impact:** DELETE /api/accounts/[id] permanently deletes accounts despite test expecting archival. The implementation does physical deletion after dependency check.
- **Affects:** MT5 accounts, audit trail
- **Resolution:** Implement soft-delete pattern or archival workflow.

### DI-3: Ruleset Publishing Does Not Auto-Archive
- **Category:** Ruleset Versioning
- **Impact:** When a new version is published, existing PUBLISHED versions are not automatically archived. Multiple PUBLISHED versions can coexist.
- **Affects:** Ruleset version history
- **Resolution:** Add auto-archive logic in publish route handler.

---

## Testing Limitations

### TE-1: No Integration Tests Run
- **Category:** Test Coverage
- **Impact:** All integration tests are stubs requiring PostgreSQL. No real API endpoints have been tested end-to-end.
- **Affects:** All API routes
- **Resolution:** Set up PostgreSQL and run integration tests.

### TE-2: No Concurrent Allocation Tests
- **Category:** Concurrency
- **Impact:** Cannot verify that one account cannot be allocated to two users simultaneously.
- **Affects:** Account allocation logic
- **Resolution:** Requires PostgreSQL and concurrent test framework.

### TE-3: No Real XM Connectivity Tests
- **Category:** External Integration
- **Impact:** No tests verify actual MT5/XM data retrieval or write operations.
- **Affects:** All MT5/XM integration
- **Resolution:** Complete POC with logged-in terminal.

### TE-4: ESLint Errors Not Fixed
- **Category:** Code Quality
- **Impact:** 4 ESLint errors (3 `any` types, 1 setState-in-effect) remain unfixed.
- **Affects:** Code quality, type safety
- **Resolution:** Fix all 4 ESLint errors.

---

## Operational Limitations

### OP-1: No Production Deployment Configuration
- **Category:** Deployment
- **Impact:** next.config.ts is empty. No production-specific settings (security headers, redirects, etc.).
- **Affects:** Production deployment
- **Resolution:** Configure next.config.ts for production.

### OP-2: Unused Documentation Variables
- **Category:** Documentation
- **Impact:** .env.example documents MT5_API_URL, MT5_API_KEY, MT5_API_SECRET, REDIS_URL, SMTP settings but none are used in code.
- **Affects:** Developer onboarding confusion
- **Resolution:** Remove unused variables from .env.example or implement their features.

### OP-3: No Prisma Client Singleton
- **Category:** Performance
- **Impact:** Each API route creates a new PrismaClient instance. This can exhaust database connections under load.
- **Affects:** All Prisma-based operations
- **Resolution:** Implement global PrismaClient singleton pattern.
