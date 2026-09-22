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
  if (opts?.metadata) entry.metadata = sanitize(opts.metadata) as Record<string, unknown>;
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
