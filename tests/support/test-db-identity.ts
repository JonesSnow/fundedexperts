import { isIP } from "node:net";

export interface ObservedTestDatabaseIdentity {
  databaseName: string;
  userName: string;
  serverAddress: string | null;
  serverPort: number | null;
  serverVersion: string;
}

export interface TestDatabaseIdentityOptions {
  configuredPort: number;
  githubActions: boolean;
}

function isLoopbackAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  return normalized === "::1" || normalized === "0:0:0:0:0:0:0:1" || normalized.startsWith("127.");
}

function isPrivateIpv4Address(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const parts = address.split(".").map(Number);
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

export function assertTestDatabaseIdentity(
  identity: ObservedTestDatabaseIdentity,
  options: TestDatabaseIdentityOptions,
): void {
  if (identity.databaseName !== "fundedexperts_test") {
    throw new Error("Connected database name does not match the dedicated disposable test database.");
  }
  if (identity.userName !== "fundedexperts_test_user") {
    throw new Error("Connected database role does not match the dedicated least-privilege test role.");
  }
  if (!identity.serverAddress || isIP(identity.serverAddress) === 0) {
    throw new Error("Connected PostgreSQL server address could not be verified.");
  }
  if (identity.serverPort !== options.configuredPort) {
    throw new Error("Connected PostgreSQL server port does not match the configured test target.");
  }
  if (!/^\d+(?:\.\d+)?/.test(identity.serverVersion)) {
    throw new Error("Connected database server did not identify as PostgreSQL.");
  }

  const localServer = isLoopbackAddress(identity.serverAddress);
  const isolatedCiService = options.githubActions && isPrivateIpv4Address(identity.serverAddress);
  if (!localServer && !isolatedCiService) {
    throw new Error("Connected PostgreSQL server is not a local test server or the isolated CI database service.");
  }
}

export function configuredDatabasePort(databaseUrl: string): number {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Configured test database URL is invalid.");
  }
  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Configured test database port is invalid.");
  }
  return port;
}
