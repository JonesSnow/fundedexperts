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

function getProductionSiteUrlIssue(): string | null {
  if (process.env.NODE_ENV !== "production") return null;

  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (!configuredUrl) return "NEXT_PUBLIC_SITE_URL or SITE_URL is required in production";

  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return "The production site URL must be an HTTPS URL without credentials, query, or fragment";
    }
  } catch {
    return "The production site URL must be a valid HTTPS URL";
  }

  return null;
}

function getPublicSmtpVariableNames(): string[] {
  return [
    "NEXT_PUBLIC_SMTP_HOST",
    "NEXT_PUBLIC_SMTP_PORT",
    "NEXT_PUBLIC_SMTP_USER",
    "NEXT_PUBLIC_SMTP_PASSWORD",
    "NEXT_PUBLIC_SMTP_FROM",
  ].filter((key) => Boolean(process.env[key]));
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

  if (process.env.NODE_ENV === "production" && mode !== "smtp") {
    throw new Error("EMAIL_MODE must be smtp in production.");
  }
  const publicSmtpVariables = getPublicSmtpVariableNames();
  if (publicSmtpVariables.length > 0) {
    throw new Error(`Do not configure browser-prefixed SMTP variables: ${publicSmtpVariables.join(", ")}.`);
  }
  const siteUrlIssue = getProductionSiteUrlIssue();
  if (siteUrlIssue) throw new Error(siteUrlIssue);

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

  if (mode !== "smtp") {
    throw new Error("EMAIL_MODE must be either console or smtp.");
  }

  const host = getRequired("SMTP_HOST");
  const port = Number(getRequired("SMTP_PORT"));
  if (!Number.isInteger(port) || (port !== 465 && port !== 587)) {
    throw new Error("SMTP_PORT must be 465 (implicit TLS) or 587 (STARTTLS).");
  }
  const user = getRequired("SMTP_USER");
  const password = getRequired("SMTP_PASSWORD");
  const from = getRequired("SMTP_FROM");
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

  if (process.env.NODE_ENV === "production" && mode !== "smtp") {
    errors.push("EMAIL_MODE must be smtp in production");
  }
  const siteUrlIssue = getProductionSiteUrlIssue();
  if (siteUrlIssue) errors.push(siteUrlIssue);

  if (mode !== "smtp" && mode !== "console") {
    errors.push("EMAIL_MODE must be either smtp or console");
  }

  if (mode === "smtp") {
    const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"];
    for (const key of required) {
      if (!process.env[key]) {
        errors.push(`${key} is required in production mode`);
      }
    }
    const port = process.env.SMTP_PORT;
    if (port && port !== "465" && port !== "587") {
      errors.push("SMTP_PORT must be 465 (implicit TLS) or 587 (STARTTLS)");
    }
  }

  if (getPublicSmtpVariableNames().length > 0) errors.push("NEXT_PUBLIC_SMTP_* variables should not be used. Use server-only SMTP_* variables instead.");

  return { valid: errors.length === 0, errors };
}

export function getEmailConfigDiagnostics() {
  const mode = process.env.EMAIL_MODE || (process.env.NODE_ENV === "production" ? "smtp" : "console");
  const validation = validateEmailConfig();
  const required = mode === "smtp"
    ? ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]
    : [];

  return {
    mode: mode === "smtp" ? "smtp" as const : mode === "console" ? "console" as const : "invalid" as const,
    provider: mode === "smtp" ? "gmail-smtp" as const : mode === "console" ? "console" as const : "none" as const,
    configurationValid: validation.valid,
    deliveryEnabled: mode === "smtp" && validation.valid,
    missingVariables: required.filter((key) => !process.env[key]),
    transportSecurity: mode === "smtp" && process.env.SMTP_PORT === "465"
      ? "implicit-tls" as const
      : mode === "smtp" && process.env.SMTP_PORT === "587"
        ? "starttls" as const
        : null,
    issues: validation.errors,
  };
}

export { DEFAULT_FROM };
