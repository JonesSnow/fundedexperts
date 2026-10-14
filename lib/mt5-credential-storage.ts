import { encryptIfEnabled } from "./encryption";

export type CredentialPreparation =
  | { ok: true; value: string | null | undefined }
  | { ok: false; reason: "invalid" | "unavailable" };

type CredentialEncryptor = (plaintext: string) => string | null;

export function prepareMt5Credentials(
  value: unknown,
  encryptor: CredentialEncryptor = encryptIfEnabled,
): CredentialPreparation {
  if (value === undefined || value === null) return { ok: true, value };
  if (typeof value !== "string") return { ok: false, reason: "invalid" };
  if (value.length === 0) return { ok: true, value: null };

  try {
    return { ok: true, value: encryptor(value) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}