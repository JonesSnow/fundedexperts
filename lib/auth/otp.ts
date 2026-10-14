import { createHmac, randomInt, randomBytes } from "node:crypto";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export type OtpPurpose = "email-verification" | "password-reset" | "password-reset-proof";

function getOtpKey(): string {
  const key = process.env.JWT_SECRET;
  if (!key || key === "change-me-in-production" || Buffer.byteLength(key, "utf8") < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes before issuing or validating one-time codes.");
  }
  return key;
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateRecoveryProof(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOtp(purpose: OtpPurpose, subject: string, value: string): string {
  return createHmac("sha256", getOtpKey())
    .update(`${purpose}:${subject.trim().toLowerCase()}:${value}`)
    .digest("hex");
}

export function isSixDigitOtp(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}
