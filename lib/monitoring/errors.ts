export interface SnapshotValidationError {
  code: string;
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  field?: string;
}

export interface ProviderTimeoutError {
  code: "PROVIDER_TIMEOUT";
  message: string;
  severity: "HIGH";
  category: "TIMEOUT";
  retryable: "RETRYABLE" | "NON_RETRYABLE";
  timeoutMs: number;
}

export interface ProviderConnectionError {
  code: "PROVIDER_UNAVAILABLE" | "CONNECTION_RESET" | "CONNECTION_REFUSED";
  message: string;
  severity: "HIGH" | "CRITICAL";
  category: "CONNECTION";
  retryable: "RETRYABLE" | "NON_RETRYABLE";
}

export interface ProviderAuthError {
  code: "INVALID_CREDENTIALS" | "AUTHENTICATION_FAILED";
  message: string;
  severity: "CRITICAL";
  category: "AUTHENTICATION";
  retryable: "RETRYABLE" | "NON_RETRYABLE";
}

export interface ProviderAccountError {
  code: "ACCOUNT_NOT_FOUND" | "ACCOUNT_DISABLED" | "UNKNOWN_ACCOUNT";
  message: string;
  severity: "HIGH" | "CRITICAL";
  category: "PROVIDER";
  retryable: "RETRYABLE" | "NON_RETRYABLE";
}

export interface ProviderRateLimitError {
  code: "RATE_LIMIT_EXCEEDED";
  message: string;
  severity: "MEDIUM";
  category: "RATE_LIMIT";
  retryable: "RETRYABLE" | "NON_RETRYABLE";
}

export interface ProviderGenericError {
  code: string;
  message: string;
  severity: "HIGH" | "CRITICAL";
  category: "PROVIDER" | "VALIDATION" | "UNKNOWN";
  retryable: "RETRYABLE" | "NON_RETRYABLE";
}
