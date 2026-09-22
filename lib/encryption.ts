import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";

/**
 * MT5 Credential Encryption Module
 *
 * DECRYPTION BOUNDARY: The `decrypt()` function is intended ONLY for use in
 * an isolated MT5 worker service (planned: lib/monitoring/). It must NEVER be
 * called from API route handlers. Exposing decrypted credentials through API
 * responses would violate the security boundary of this application.
 *
 * Current operational scope: credentials are encrypted at write time and are
 * write-only via API routes. Decryption is available for the future worker.
 *
 * Key lifecycle: MT5_ENCRYPTION_KEY is read from environment at module load.
 * No key rotation is implemented. Changing the key requires re-encryption of
 * all stored credentials, which is an out-of-band migration.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function getMasterKey(): Buffer {
  const secret = process.env.MT5_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("MT5_ENCRYPTION_KEY must be set and at least 32 characters");
  }
  return scryptSync(secret, "fundedexperts-salt", KEY_LENGTH);
}

export function isEncryptionAvailable(): boolean {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}

export function encrypt(plaintext: string): string {
  if (!plaintext || plaintext.length === 0) {
    throw new Error("Plaintext must not be empty");
  }
  const masterKey = getMasterKey();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const dataKey = scryptSync(masterKey, salt, KEY_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dataKey, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, Buffer.from(encrypted, "hex")]).toString("base64");
}

/**
 * Decrypt MT5 credentials.
 *
 * SECURITY BOUNDARY: This function must only be called in an isolated
 * worker context (e.g., lib/monitoring/) that has access to the MT5 terminal.
 * It MUST NOT be called from API route handlers. Exposing decrypted
 * credentials through the API would create a critical security vulnerability.
 *
 * @throws {Error} If ciphertext is malformed, tampered, or too short
 * @throws {Error} If MT5_ENCRYPTION_KEY is not configured
 */
export function decrypt(ciphertext: string): string {
  const masterKey = getMasterKey();
  const data = Buffer.from(ciphertext, "base64");
  if (data.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Ciphertext too short");
  }
  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const dataKey = scryptSync(masterKey, salt, KEY_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, dataKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptIfEnabled(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  if (!isEncryptionAvailable()) {
    throw new Error("MT5_ENCRYPTION_KEY is required to store credentials");
  }
  return encrypt(plaintext);
}
