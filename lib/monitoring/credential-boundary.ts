export type ProviderType = "mt5" | "demo" | "mock";

export interface ProviderCredentials {
  providerType: ProviderType;
  server: string;
  login: number;
  password: string;
  connectionTimeoutMs: number;
}

export interface CredentialSet {
  providerType: ProviderType;
  maskedLogin: string;
}

export interface CredentialValidationResult {
  valid: boolean;
  providerType: ProviderType;
  errors: string[];
}

export function maskLogin(login: number | string): string {
  const str = String(login);
  if (str.length <= 4) return "****";
  return "****" + str.slice(-4);
}

export function createCredentialSet(credentials: ProviderCredentials): CredentialSet {
  return {
    providerType: credentials.providerType,
    maskedLogin: maskLogin(credentials.login),
  };
}

export function validateCredentials(credentials: ProviderCredentials): CredentialValidationResult {
  const errors: string[] = [];

  if (!credentials.server || credentials.server.trim().length === 0) {
    errors.push("Server address is required");
  }

  if (!Number.isFinite(credentials.login) || credentials.login <= 0) {
    errors.push("Login must be a positive number");
  }

  if (!credentials.password || credentials.password.length < 1) {
    errors.push("Password is required");
  }

  if (credentials.connectionTimeoutMs <= 0) {
    errors.push("Connection timeout must be positive");
  }

  return {
    valid: errors.length === 0,
    providerType: credentials.providerType,
    errors,
  };
}

export function supportsProvider(type: string): boolean {
  return ["mt5", "demo", "mock"].includes(type);
}
