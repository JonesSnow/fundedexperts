import { HealthStatus, SnapshotStatus, Retryability } from "./types";

export interface ProviderErrorDetail {
  code: string;
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: "CONNECTION" | "AUTHENTICATION" | "TIMEOUT" | "VALIDATION" | "RATE_LIMIT" | "PROVIDER" | "UNKNOWN";
  retryable: Retryability;
}

export interface MonitoringResult {
  success: boolean;
  status: SnapshotStatus;
  message: string;
  timestamp: Date;
  snapshot?: import("./types").MonitoringSnapshot;
  error?: ProviderErrorDetail;
  partialFields?: string[];
  accountId: string;
  accountLoginMasked: string;
}

export interface HealthResult {
  health: HealthStatus;
  accountId: string;
  accountLoginMasked: string;
  timestamp: Date;
  reasons: HealthReason[];
  snapshotAvailable: boolean;
  dataAgeMs: number | null;
}

export interface HealthReason {
  code: string;
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: "FRESH_DATA" | "STALE_DATA" | "MISSING_ACCOUNT" | "PROVIDER_TIMEOUT" | "CONNECTION_FAILURE" | "INVALID_SNAPSHOT" | "PARTIAL_DATA" | "UNKNOWN" | "PROVIDER" | "UNKNOWN";
}

export interface RetryPolicyConfig {
  maxAttempts: number;
  baseTimeoutMs: number;
  maxTimeoutMs: number;
  backoffMultiplier: number;
  retryableCodes: string[];
  nonRetryableCodes: string[];
}

export interface RetryResult {
  attempts: number;
  finalSuccess: boolean;
  finalResult?: MonitoringResult;
  error?: ProviderErrorDetail;
  totalDurationMs: number;
  exhausted: boolean;
}
