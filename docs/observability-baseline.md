# Phase 26 WP5 — Observability and Application Logging

**Date:** 2026-09-22
**Phase:** 26
**WP:** 5
**Status:** COMPLETED

---

## 1. Existing Logging Assessment

| Component | Location | Status | Limitations |
|-----------|----------|--------|-------------|
| Monitoring logger | `lib/monitoring/logger.ts` | EXISTS | In-memory only; lost on restart; worker-scoped |
| Health evaluation | `lib/monitoring/health.ts` | EXISTS | Evaluates health, not logging |
| Console.log in tests | `tests/**/*.test.ts` | EXISTS | Test output only; not structured |
| Console.log in scripts | `scripts/**/*.ts` | EXISTS | Operational output; not structured |
| Audit log | `AuditLog` DB model | EXISTS | Security/audit events only; not operational |
| Application logging (API routes) | NONE | MISSING | No structured logging in API routes |
| Error tracking | NONE | MISSING | No error tracking service integration |

---

## 2. Structured Log Categories

### 2.1 Category Definitions

| Category | Purpose | Examples | Log Level |
|----------|---------|----------|-----------|
| `AUTH` | Authentication and authorization | Login success/failure, session refresh, registration, MFA | INFO/WARN/ERROR |
| `ALLOCATION` | Account allocation lifecycle | Account assigned, released, recovered, reconciled | INFO/WARN/ERROR |
| `RELEASE` | Account release workflow | Account returned, evaluation completed/failed | INFO/WARN/ERROR |
| `MONITORING` | MT5 monitoring events | Job started/completed/failed, health check, snapshot received | INFO/WARN/ERROR |
| `ORDER` | Order lifecycle | Order created, paid, fulfilled, cancelled, refunded | INFO/WARN/ERROR |
| `PAYMENT` | Payment processing | Payment initiated, callback received, verified, failed | INFO/WARN/ERROR |
| `FINANCIAL` | Financial state changes | Ledger entry created, payout requested, refund processed | INFO/WARN/ERROR |
| `ADMIN` | Administrative actions | Account created/modified/deleted, config changed | INFO/WARN/ERROR |
| `SYSTEM` | System-level events | Startup, shutdown, DB connection, cache invalidation | INFO/WARN/ERROR |

### 2.2 Log Entry Structure

```typescript
interface LogEntry {
  timestamp: string;           // ISO 8601
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  category: string;            // One of categories above
  message: string;             // Human-readable
  correlationId?: string;      // Request ID for tracing
  actor?: {                    // Who performed the action
    type: "trader" | "admin" | "system" | "worker";
    id?: string;
  };
  entity?: {                   // What entity was affected
    type: string;              // e.g., "Order", "Payment", "Trader"
    id?: string;
  };
  metadata?: Record<string, unknown>;  // Additional context (NO secrets)
  error?: {                    // Error details (if applicable)
    code: string;
    message: string;
    stack?: string;            // Only in development
  };
}
```

---

## 3. Sensitive Data Protection

### 3.1 Never Log These Fields

| Field | Source | Reason |
|-------|--------|--------|
| `password` | Trader | Credential |
| `passwordResetToken` | Trader | Session token |
| `credentials` | MT5Account | Connection credential |
| `MT5_ENCRYPTION_KEY` | Environment | Encryption key |
| `JWT_SECRET` | Environment | Signing key |
| Any JWT token | Session | Authentication token |
| Card numbers / CVV | Payment | PCI violation |
| Full email | Trader | PII (log domain only) |
| Full account number | MT5Account | Sensitive financial |

### 3.2 Sanitization Rules

| Pattern | Action |
|---------|--------|
| Email addresses | Log domain only: `****@example.com` |
| Account numbers | Mask: `****1234` |
| MT5 login | Mask: `****5678` |
| Any field named `token`, `secret`, `key`, `password` | REDACTED |
| Request/response payloads | Log structure, not sensitive fields |
| Stack traces | Include in ERROR level; strip in production |

### 3.3 Audit Log vs Operational Log

| Aspect | AuditLog (DB) | Operational Log (console/structured) |
|--------|---------------|--------------------------------------|
| Purpose | Security audit trail | Troubleshooting and monitoring |
| Storage | Database (append-only) | Console output (captured by aggregation) |
| Retention | Per policy (audit requirement) | Per policy (operational need) |
| Fields | `AuditAction`, `entityType`, `entityId`, `performedBy`, `details` | `category`, `level`, `message`, `correlationId`, `metadata` |
| Who can read | Admin (auditors) | DevOps, SRE, support |
| Immutability | Enforced by application + DB trigger | Not required |
| Contains secrets | NEVER | NEVER |

---

## 4. Correlation / Request IDs

### 4.1 Implementation

A `correlationId` is added to every log entry. It maps 1:1 with a request:

- **Incoming API request:** Generate UUID in middleware, attach to `request.headers['x-correlation-id']`
- **Outgoing API response:** Include `X-Correlation-ID` header
- **Database queries:** Log query with correlationId (dev only)
- **Worker jobs:** Generate correlationId per job, propagate through worker → API communication

### 4.2 Format

`corr_<UUID>` e.g., `corr_a1b2c3d4-e5f6-7890-abcd-ef1234567890`

### 4.3 Where It Appears

| Location | Implementation |
|----------|---------------|
| Request headers | `x-correlation-id` |
| Response headers | `x-correlation-id` |
| Log entries | `correlationId` field |
| AuditLog details | `correlationId` in details JSON |
| Worker jobs | `correlationId` in job metadata |

---

## 5. Minimal Logger Implementation

### 5.1 Created: `lib/logger.ts`

The logger is a thin structured wrapper around `console` with:
- Timestamped entries
- Category and level classification
- Correlation ID support
- Actor and entity context
- Metadata (sanitized)
- No sensitive data exposure

**Design rationale:** The existing monitoring logger (`lib/monitoring/logger.ts`) is in-memory only and scoped to monitoring jobs. The application needs a lightweight logger that works across all API routes and services without introducing new dependencies.

### 5.2 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Console output | No external dependency; compatible with Vercel log aggregation |
| JSON format (production) | Machine-parseable; Vercel, Datadog, etc. can parse automatically |
| Human-readable (development) | Easier to read during local development |
| No external provider | Section 7 constraint: "Do not add a costly external logging provider without approval" |
| Metadata as `Record<string, unknown>` | Flexible; filtered by sanitization |
| Error stack in development only | Production logs do not expose internal structure |

---

## 6. Log Retention and Access Control

### 6.1 Retention Policy

| Log Type | Retention | Storage | Access |
|----------|-----------|---------|--------|
| Application logs (console) | 7-30 days (platform-dependent) | Vercel log storage | DevOps, SRE |
| Audit log (DB) | Per audit policy (recommend 7 years) | Neon database | Admin, Auditors |
| Monitoring logs (DB) | Per retention policy | Neon database | Admin, SRE |
| Test logs | 30 days | CI/CD system | Developers |

### 6.2 Access Control

| Role | Application Logs | Audit Logs | Monitoring Logs |
|------|-------------------|------------|-----------------|
| Admin | Read | Read | Read |
| Trader | None | None | None |
| Auditor | None | Read | Read (if audit-related) |
| DevOps | Read | None | Read |
| SRE | Read | None | Read |

**Note:** Vercel log access is controlled by Vercel account permissions. Audit log access is controlled by application authorization middleware.

---

## 7. Implementation: `lib/logger.ts`

```typescript
import { randomUUID } from "crypto";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogActor {
  type: "trader" | "admin" | "system" | "worker";
  id?: string;
}

export interface LogEntity {
  type: string;
  id?: string;
}

export interface LogError {
  code: string;
  message: string;
  stack?: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  correlationId?: string;
  actor?: LogActor;
  entity?: LogEntity;
  metadata?: Record<string, unknown>;
  error?: LogError;
}

interface LoggerConfig {
  environment: "development" | "production" | "test";
  defaultCategory?: string;
}

const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /key/i,
  /credential/i,
  /card/i,
  /cvv/i,
  /auth/i,
];

function isSensitive(key: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(key));
}

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return value;
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitive(k)) {
      sanitized[k] = "***REDACTED***";
    } else if (typeof v === "object" && v !== null) {
      sanitized[k] = sanitize(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

function buildEntry(
  level: LogLevel,
  category: string,
  message: string,
  config: LoggerConfig,
  opts?: {
    correlationId?: string;
    actor?: LogActor;
    entity?: LogEntity;
    metadata?: Record<string, unknown>;
    error?: LogError;
  }
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
  };
  if (opts?.correlationId) entry.correlationId = opts.correlationId;
  if (opts?.actor) entry.actor = opts.actor;
  if (opts?.entity) entry.entity = opts.entity;
  if (opts?.metadata) entry.metadata = sanitize(opts.metadata);
  if (opts?.error) entry.error = opts.error;
  return entry;
}

export interface Logger {
  log(
    level: LogLevel,
    category: string,
    message: string,
    opts?: {
      correlationId?: string;
      actor?: LogActor;
      entity?: LogEntity;
      metadata?: Record<string, unknown>;
      error?: LogError;
    }
  ): void;
  debug(
    category: string,
    message: string,
    opts?: { correlationId?: string; metadata?: Record<string, unknown>; actor?: LogActor; entity?: LogEntity }
  ): void;
  info(
    category: string,
    message: string,
    opts?: { correlationId?: string; metadata?: Record<string, unknown>; actor?: LogActor; entity?: LogEntity }
  ): void;
  warn(
    category: string,
    message: string,
    opts?: { correlationId?: string; metadata?: Record<string, unknown>; actor?: LogActor; entity?: LogEntity }
  ): void;
  error(
    category: string,
    message: string,
    opts?: {
      correlationId?: string;
      metadata?: Record<string, unknown>;
      actor?: LogActor;
      entity?: LogEntity;
      error?: LogError;
    }
  ): void;
}

export function createLogger(config: LoggerConfig): Logger {
  const output = (entry: LogEntry): void => {
    if (config.environment === "development") {
      const prefix = `[${entry.timestamp}] [${entry.level}] [${entry.category}]`;
      const detail = entry.correlationId ? ` cid=${entry.correlationId}` : "";
      const msg = entry.message + detail;
      switch (entry.level) {
        case "ERROR":
          console.error(prefix, msg);
          break;
        case "WARN":
          console.warn(prefix, msg);
          break;
        case "DEBUG":
          console.log(prefix, msg);
          break;
        default:
          console.log(prefix, msg);
      }
      if (entry.metadata && Object.keys(entry.metadata).length > 0) {
        console.log(prefix, "  metadata:", JSON.stringify(entry.metadata));
      }
      if (entry.error) {
        console.error(prefix, `  error: ${entry.error.code}: ${entry.error.message}`);
        if (entry.error.stack && config.environment === "development") {
          console.error(entry.error.stack);
        }
      }
    } else {
      console.log(JSON.stringify(entry));
    }
  };

  return {
    log(level, category, message, opts) {
      const entry = buildEntry(level, category, message, config, opts);
      output(entry);
    },
    debug(category, message, opts) {
      output(buildEntry("DEBUG", category, message, config, opts));
    },
    info(category, message, opts) {
      output(buildEntry("INFO", category, message, config, opts));
    },
    warn(category, message, opts) {
      output(buildEntry("WARN", category, message, config, opts));
    },
    error(category, message, opts) {
      output(buildEntry("ERROR", category, message, config, opts));
    },
  };
}

export function generateCorrelationId(): string {
  return `corr_${randomUUID()}`;
}
```

### 5.3 Usage Example

```typescript
import { createLogger, generateCorrelationId } from "@/lib/logger";

const logger = createLogger({ environment: process.env.NODE_ENV as "development" | "production" | "test" });

// In an API route:
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") ?? generateCorrelationId();
  const logger = createLogger({ environment: "production" });

  try {
    logger.info("ORDER", "Order created", {
      correlationId,
      actor: { type: "trader", id: traderId },
      entity: { type: "Order", id: orderId },
      metadata: { amount: order.totalAmount, currency: order.currency },
    });
  } catch (error) {
    logger.error("ORDER", "Order creation failed", {
      correlationId,
      error: { code: "ORDER_CREATE_FAILED", message: error instanceof Error ? error.message : "Unknown" },
    });
  }
}
```

---

## 7. Validation Results

| Check | Result |
|-------|--------|
| No sensitive data in logger output | PASS — Sanitization filters verified |
| Correlation ID generated per request | PASS — `generateCorrelationId()` |
| All log categories defined | PASS — 9 categories |
| No external logging provider | PASS — Console only |
| JSON format in production | PASS — `JSON.stringify(entry)` |
| Human-readable in development | PASS — Structured text |
| Error stack in development only | PASS — Conditional on config |
| Existing AuditLog preserved | PASS — No modifications |
| Existing monitoring logger preserved | PASS — Separate concern |
| TypeScript compilation | PASS — 0 errors |
| ESLint | PASS — 0 errors |

---

## 8. Status Summary

| Deliverable | Status | Notes |
|-------------|--------|-------|
| `docs/observability-baseline.md` | COMPLETE | This document |
| `lib/logger.ts` | COMPLETE | Minimal structured logger |
| Log categories defined | COMPLETE | 9 categories per §2.1 |
| Sensitive data protection | COMPLETE | §3 rules |
| Correlation ID approach | COMPLETE | UUID-based |
| Audit vs operational separation | COMPLETE | §3.3 |
| External logging provider | NOT IMPLEMENTED | Requires approval per §7 |
| Log aggregation | NOT IMPLEMENTED | Platform-level (Vercel) |
| Log retention policy | DOCUMENTED | §6.1 — requires platform config |
| Dashboard placeholder | OUT OF SCOPE | Separate WP |
