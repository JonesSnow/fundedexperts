export type LogSeverity = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: Date;
  workerId: string;
  jobId: string;
  eventType: string;
  status: string;
  duration?: number;
  retryAttempt?: number;
  errorCode: string | null;
  severity: LogSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LoggerConfig {
  workerId: string;
  maxEntries: number;
}

export class Logger {
  private entries: LogEntry[] = [];
  private config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  log(entry: Omit<LogEntry, "timestamp" | "workerId">): void {
    const logEntry: LogEntry = {
      ...entry,
      timestamp: new Date(),
      workerId: this.config.workerId,
    };
    this.entries.push(logEntry);
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }
  }

  getEntries(): readonly LogEntry[] {
    return this.entries;
  }

  getEntriesByJobId(jobId: string): readonly LogEntry[] {
    return this.entries.filter((e) => e.jobId === jobId);
  }

  getRecentEntries(count: number): readonly LogEntry[] {
    return this.entries.slice(-count);
  }

  clear(): void {
    this.entries = [];
  }

  debug(jobId: string, message: string, metadata?: Record<string, unknown>): void {
    this.log({ jobId, eventType: "DEBUG", status: "OK", errorCode: null, severity: "DEBUG", message, metadata });
  }

  info(jobId: string, message: string, metadata?: Record<string, unknown>): void {
    this.log({ jobId, eventType: "INFO", status: "OK", errorCode: null, severity: "INFO", message, metadata });
  }

  warn(jobId: string, message: string, metadata?: Record<string, unknown>): void {
    this.log({ jobId, eventType: "WARN", status: "WARN", errorCode: null, severity: "WARN", message, metadata });
  }

  error(
    jobId: string,
    message: string,
    errorCode: string | null = null,
    metadata?: Record<string, unknown>
  ): void {
    this.log({
      jobId,
      eventType: "ERROR",
      status: "ERROR",
      errorCode,
      severity: "ERROR",
      message,
      metadata,
    });
  }
}
