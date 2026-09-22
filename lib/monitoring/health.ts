import { HealthStatus } from "./types";
import { MonitoringResult, HealthResult, HealthReason } from "./result";

export interface HealthEvaluationConfig {
  staleDataThresholdMs: number;
  missingAccountThresholdMs: number;
}

const DEFAULT_CONFIG: HealthEvaluationConfig = {
  staleDataThresholdMs: 300000,
  missingAccountThresholdMs: 600000,
};

export function evaluateHealth(
  result: MonitoringResult,
  config: HealthEvaluationConfig = DEFAULT_CONFIG
): HealthResult {
  const reasons: HealthReason[] = [];

  if (!result.snapshot) {
    reasons.push({
      code: "NO_SNAPSHOT",
      message: "No monitoring snapshot available",
      severity: "HIGH",
      category: "INVALID_SNAPSHOT",
    });
    return { health: "UNKNOWN", reasons, timestamp: new Date(), accountId: result.accountId, accountLoginMasked: result.accountLoginMasked, snapshotAvailable: false, dataAgeMs: null };
  }

  const snapshot = result.snapshot;
  const now = Date.now();
  const dataTimestamp = snapshot.dataTimestamp ? snapshot.dataTimestamp.getTime() : null;
  const dataAgeMs = dataTimestamp !== null ? now - dataTimestamp : null;

  if (result.status === "DISCONNECTED") {
    reasons.push({
      code: "TERMINAL_DISCONNECTED",
      message: "Terminal is disconnected",
      severity: "CRITICAL",
      category: "CONNECTION_FAILURE",
    });
    return { health: "DISCONNECTED", reasons, timestamp: new Date(), accountId: result.accountId, accountLoginMasked: result.accountLoginMasked, snapshotAvailable: true, dataAgeMs };
  }

  if (result.status === "TIMEOUT") {
    reasons.push({
      code: "PROVIDER_TIMEOUT",
      message: "Provider request timed out",
      severity: "HIGH",
      category: "PROVIDER_TIMEOUT",
    });
    return { health: "ERROR", reasons, timestamp: new Date(), accountId: result.accountId, accountLoginMasked: result.accountLoginMasked, snapshotAvailable: true, dataAgeMs };
  }

  if (result.status === "PROVIDER_FAILURE") {
    reasons.push({
      code: "PROVIDER_ERROR",
      message: "Provider returned an error",
      severity: "HIGH",
      category: "CONNECTION_FAILURE",
    });
    return { health: "ERROR", reasons, timestamp: new Date(), accountId: result.accountId, accountLoginMasked: result.accountLoginMasked, snapshotAvailable: true, dataAgeMs };
  }

  if (result.status === "VALIDATION_FAILURE") {
    reasons.push({
      code: "INVALID_SNAPSHOT",
      message: "Snapshot validation failed",
      severity: "HIGH",
      category: "INVALID_SNAPSHOT",
    });
    return { health: "ERROR", reasons, timestamp: new Date(), accountId: result.accountId, accountLoginMasked: result.accountLoginMasked, snapshotAvailable: true, dataAgeMs };
  }

  if (dataTimestamp === null) {
    reasons.push({
      code: "NO_TIMESTAMP",
      message: "No data timestamp available",
      severity: "MEDIUM",
      category: "STALE_DATA",
    });
  } else if (dataAgeMs !== null && dataAgeMs > config.staleDataThresholdMs) {
    reasons.push({
      code: "STALE_DATA",
      message: `Data is ${Math.round(dataAgeMs / 1000)}s old (threshold: ${config.staleDataThresholdMs / 1000}s)`,
      severity: "MEDIUM",
      category: "STALE_DATA",
    });
  } else {
    reasons.push({
      code: "FRESH_DATA",
      message: `Data is ${Math.round(dataAgeMs! / 1000)}s old`,
      severity: "LOW",
      category: "FRESH_DATA",
    });
  }

  if (snapshot.equity === null && snapshot.balance === null) {
    reasons.push({
      code: "NO_ACCOUNT_DATA",
      message: "No account balance or equity data",
      severity: "HIGH",
      category: "MISSING_ACCOUNT",
    });
  }

  if (snapshot.terminalConnected === false) {
    reasons.push({
      code: "TERMINAL_NOT_CONNECTED",
      message: "Terminal connectivity status is false",
      severity: "HIGH",
      category: "CONNECTION_FAILURE",
    });
  }

  const error = result.error;
  const criticalErrors = error !== undefined && error.severity === "CRITICAL";

  if (criticalErrors) {
    reasons.push({
      code: "CRITICAL_PROVIDER_ERROR",
      message: error.message,
      severity: "CRITICAL",
      category: "PROVIDER",
    });
    return { health: "ERROR", reasons, timestamp: new Date(), accountId: result.accountId, accountLoginMasked: result.accountLoginMasked, snapshotAvailable: true, dataAgeMs };
  }

  if (snapshot.accountLoginMasked === "[MASKED]") {
    reasons.push({
      code: "UNKNOWN_ACCOUNT",
      message: "Account information unavailable",
      severity: "HIGH",
      category: "MISSING_ACCOUNT",
    });
  }

  const highCount = reasons.filter((r) => r.severity === "HIGH" || r.severity === "CRITICAL").length;
  const mediumCount = reasons.filter((r) => r.severity === "MEDIUM").length;

  let health: HealthStatus;
  if (highCount === 0 && !criticalErrors) {
    if (mediumCount === 0) {
      health = "HEALTHY";
    } else {
      health = "DEGRADED";
    }
  } else if (highCount > 0) {
    health = "DEGRADED";
  } else {
    health = "ERROR";
  }

  if (result.status === "PARTIAL") {
    health = "DEGRADED";
  }

  return { health, reasons, timestamp: new Date(), accountId: result.accountId, accountLoginMasked: result.accountLoginMasked, snapshotAvailable: true, dataAgeMs };
}
