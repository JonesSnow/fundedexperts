import { encryptIfEnabled } from "./encryption";

export type CredentialPreparation =
  | { ok: true; value: string | null | undefined }
  | { ok: false; reason: "invalid" | "unavailable" };

type CredentialEncryptor = (plaintext: string) => string | null;

function isMt5CredentialPayload(value: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const payload = parsed as Record<string, unknown>;
  if (Object.keys(payload).some((key) => !["login", "password", "server"].includes(key))) return false;

  const login = payload.login;
  const loginText = typeof login === "number" && Number.isSafeInteger(login)
    ? String(login)
    : typeof login === "string"
      ? login.trim()
      : "";
  const password = payload.password;
  const server = payload.server;

  return /^\d+$/.test(loginText)
    && Number.isSafeInteger(Number(loginText))
    && Number(loginText) > 0
    && typeof password === "string"
    && password.length > 0
    && typeof server === "string"
    && server.trim().length > 0;
}

export function prepareMt5Credentials(
  value: unknown,
  encryptor: CredentialEncryptor = encryptIfEnabled,
): CredentialPreparation {
  if (value === undefined || value === null) return { ok: true, value };
  if (typeof value !== "string") return { ok: false, reason: "invalid" };
  if (value.length === 0) return { ok: true, value: null };
  if (!isMt5CredentialPayload(value)) return { ok: false, reason: "invalid" };

  try {
    return { ok: true, value: encryptor(value) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function buildMt5CredentialUpdateData(
  wasProvided: boolean,
  encryptedValue: string | null | undefined,
): { credentials?: string | null } {
  return wasProvided ? { credentials: encryptedValue ?? null } : {};
}
