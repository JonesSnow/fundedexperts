import { EmailProvider } from "./types";

const DEFAULT_FROM = "Funded Experts <no-reply@fundedexperts.com>";

function getRequired(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Email configuration error: ${key} is not set. Set it in your environment variables.`);
  }
  return value;
}

function getOptional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  replyTo: string | null;
  secure: boolean;
  provider: EmailProvider;
}

export function getEmailConfig(): EmailConfig {
  const mode = process.env.EMAIL_MODE || (process.env.NODE_ENV === "production" ? "smtp" : "console");

  if (mode === "console") {
    return {
      host: "localhost",
      port: 0,
      user: "",
      password: "",
      from: getOptional("SMTP_FROM", DEFAULT_FROM),
      replyTo: process.env.SMTP_REPLY_TO || null,
      secure: false,
      provider: "console",
    };
  }

  const host = getRequired("SMTP_HOST");
  const port = parseInt(getRequired("SMTP_PORT"), 10);
  const user = getRequired("SMTP_USER");
  const password = getRequired("SMTP_PASSWORD");
  const from = getOptional("SMTP_FROM", DEFAULT_FROM);
  const replyTo = process.env.SMTP_REPLY_TO || null;

  const secure = port === 465;

  return {
    host,
    port,
    user,
    password,
    from,
    replyTo,
    secure,
    provider: "gmail-smtp",
  };
}

export function validateEmailConfig(): { valid: boolean; errors: string[] } {
  const mode = process.env.EMAIL_MODE || (process.env.NODE_ENV === "production" ? "smtp" : "console");
  const errors: string[] = [];

  if (mode === "smtp") {
    const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"];
    for (const key of required) {
      if (!process.env[key]) {
        errors.push(`${key} is required in production mode`);
      }
    }
  }

  if (process.env.NEXT_PUBLIC_SMTP_HOST || process.env.NEXT_PUBLIC_SMTP_PORT || process.env.NEXT_PUBLIC_SMTP_USER || process.env.NEXT_PUBLIC_SMTP_PASSWORD || process.env.NEXT_PUBLIC_SMTP_FROM) {
    errors.push("NEXT_PUBLIC_SMTP_* variables should not be used. Use server-only SMTP_* variables instead.");
  }

  return { valid: errors.length === 0, errors };
}

export { DEFAULT_FROM };
