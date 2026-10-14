import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderEmailTemplate } from "../lib/email/renderer";
import { getEmailConfig, getEmailConfigDiagnostics, validateEmailConfig } from "../lib/email/config";
import { buildAppUrl, getAppUrl } from "../lib/email/urls";
import { checkCooldown, resetCooldown } from "../lib/auth/rate-limit";
import * as otp from "../lib/auth/otp";

process.env.JWT_SECRET = "unit-test-only-secret-do-not-use-outside-this-test-process";

describe("OTP utilities", () => {
  it("generates six-digit codes including leading zeroes", () => {
    for (let count = 0; count < 100; count++) {
      assert.match(otp.generateOtp(), /^\d{6}$/);
    }
  });

  it("stores a purpose-bound HMAC rather than the OTP value", () => {
    const digest = otp.hashOtp("email-verification", "Trader-ID", "012345");
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.notEqual(digest, "012345");
    assert.equal(digest, otp.hashOtp("email-verification", "trader-id", "012345"));
    assert.notEqual(digest, otp.hashOtp("password-reset", "Trader-ID", "012345"));
    assert.notEqual(digest, otp.hashOtp("email-verification", "Trader-ID", "012346"));
  });

  it("accepts only six numeric characters", () => {
    assert.equal(otp.isSixDigitOtp("000042"), true);
    assert.equal(otp.isSixDigitOtp("12345"), false);
    assert.equal(otp.isSixDigitOtp("1234567"), false);
    assert.equal(otp.isSixDigitOtp("12ab56"), false);
  });

  it("creates a high-entropy, URL-safe reset proof", () => {
    const first = otp.generateRecoveryProof();
    const second = otp.generateRecoveryProof();
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first, second);
  });

  it("enforces and clears an OTP resend cooldown", () => {
    const key = `otp-unit-test:${Date.now()}`;
    try {
      assert.equal(checkCooldown(key, 60_000).allowed, true);
      const blocked = checkCooldown(key, 60_000);
      assert.equal(blocked.allowed, false);
      assert.ok((blocked.retryAfter ?? 0) > 0);
      resetCooldown(key);
      assert.equal(checkCooldown(key, 60_000).allowed, true);
    } finally {
      resetCooldown(key);
    }
  });
});

describe("OTP email templates", () => {
  it("renders verification codes without account-verification links", () => {
    const rendered = renderEmailTemplate("verification", {
      email: "trader@example.test",
      code: "012345",
      expiresAt: "Oct 14, 2026, 12:00 PM UTC",
      appUrl: "https://example.test",
    });
    assert.match(rendered.html, /012345/);
    assert.match(rendered.text, /012345/);
    assert.doesNotMatch(rendered.html, /verificationUrl|#012345/);
    assert.doesNotMatch(rendered.text, /verificationUrl|click the link/i);
    assert.match(rendered.html, /View Help Resources/);
    assert.doesNotMatch(`${rendered.html}\n${rendered.text}`, /Contact Support/i);
  });

  it("renders password reset codes without reset links", () => {
    const rendered = renderEmailTemplate("password-reset", {
      email: "trader@example.test",
      code: "654321",
      expiresAt: "Oct 14, 2026, 12:00 PM UTC",
      appUrl: "https://example.test",
    });
    assert.match(rendered.html, /654321/);
    assert.match(rendered.text, /654321/);
    assert.doesNotMatch(rendered.html, /resetUrl|#654321/);
    assert.doesNotMatch(rendered.text, /resetUrl|click the link/i);
    assert.match(rendered.text, /available security resources/i);
    assert.doesNotMatch(`${rendered.html}\n${rendered.text}`, /contact support/i);
  });

  it("keeps welcome email copy within verified simulated-product claims", () => {
    const rendered = renderEmailTemplate("welcome", {
      email: "trader@example.test",
      firstName: "Trader",
      emailVerified: false,
      appUrl: "https://example.test",
      dashboardUrl: "https://example.test/dashboard",
    });
    assert.match(rendered.text, /configured simulated evaluation products/i);
    assert.doesNotMatch(`${rendered.html}\n${rendered.text}`, /funded trading|Contact Support/i);
  });
});

describe("SMTP configuration", () => {
  const keys = ["NODE_ENV", "EMAIL_MODE", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "NEXT_PUBLIC_SITE_URL", "SITE_URL", "NEXT_PUBLIC_SMTP_HOST", "NEXT_PUBLIC_SMTP_PORT", "NEXT_PUBLIC_SMTP_USER", "NEXT_PUBLIC_SMTP_PASSWORD", "NEXT_PUBLIC_SMTP_FROM"] as const;
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const mutableEnvironment = process.env as unknown as Record<string, string | undefined>;

  function restoreEnvironment() {
    for (const key of keys) {
      const value = original[key];
      if (value === undefined) delete mutableEnvironment[key];
      else mutableEnvironment[key] = value;
    }
  }

  it("reports missing required SMTP variable names without exposing values", () => {
    try {
      process.env.EMAIL_MODE = "smtp";
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASSWORD;
      delete process.env.SMTP_FROM;
      const validation = validateEmailConfig();
      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some((entry) => entry.includes("SMTP_PASSWORD")));
      assert.ok(validation.errors.some((entry) => entry.includes("SMTP_FROM")));
    } finally {
      restoreEnvironment();
    }
  });

  it("uses implicit TLS for port 465 and STARTTLS for port 587", () => {
    try {
      process.env.EMAIL_MODE = "smtp";
      process.env.SMTP_HOST = "smtp.gmail.com";
      process.env.SMTP_USER = "mailer@example.test";
      process.env.SMTP_PASSWORD = "unit-test-placeholder";
      process.env.SMTP_FROM = "Funded Experts <mailer@example.test>";
      process.env.SMTP_PORT = "465";
      assert.equal(getEmailConfig().secure, true);
      process.env.SMTP_PORT = "587";
      assert.equal(getEmailConfig().secure, false);
      assert.equal(getEmailConfigDiagnostics().transportSecurity, "starttls");
    } finally {
      restoreEnvironment();
    }
  });

  it("rejects unsupported SMTP ports", () => {
    try {
      process.env.EMAIL_MODE = "smtp";
      process.env.SMTP_HOST = "smtp.gmail.com";
      process.env.SMTP_USER = "mailer@example.test";
      process.env.SMTP_PASSWORD = "unit-test-placeholder";
      process.env.SMTP_FROM = "Funded Experts <mailer@example.test>";
      process.env.SMTP_PORT = "2525";
      assert.throws(() => getEmailConfig(), /SMTP_PORT must be 465 \(implicit TLS\) or 587 \(STARTTLS\)/);
    } finally {
      restoreEnvironment();
    }
  });

  it("rejects console email mode in production", () => {
    try {
      mutableEnvironment.NODE_ENV = "production";
      process.env.EMAIL_MODE = "console";
      process.env.SITE_URL = "https://example.test";

      assert.equal(validateEmailConfig().valid, false);
      assert.throws(() => getEmailConfig(), /EMAIL_MODE must be smtp in production/);
    } finally {
      restoreEnvironment();
    }
  });

  it("requires a configured HTTPS site URL in production without echoing its value", () => {
    try {
      mutableEnvironment.NODE_ENV = "production";
      process.env.EMAIL_MODE = "smtp";
      process.env.SMTP_HOST = "smtp.example.test";
      process.env.SMTP_PORT = "465";
      process.env.SMTP_USER = "unit-test@example.test";
      process.env.SMTP_PASSWORD = "unit-test-placeholder";
      process.env.SMTP_FROM = "Funded Experts <unit-test@example.test>";
      delete process.env.NEXT_PUBLIC_SITE_URL;
      delete process.env.SITE_URL;

      const validation = validateEmailConfig();
      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some((entry) => entry.includes("NEXT_PUBLIC_SITE_URL or SITE_URL")));
      assert.throws(() => getEmailConfig(), /NEXT_PUBLIC_SITE_URL or SITE_URL is required/);

      process.env.SITE_URL = "http://example.test";
      assert.throws(() => getEmailConfig(), /production site URL must be an HTTPS URL/);
      assert.ok(!JSON.stringify(validateEmailConfig()).includes("example.test"));
    } finally {
      restoreEnvironment();
    }
  });

  it("rejects browser-prefixed SMTP configuration without returning credential values", () => {
    try {
      process.env.EMAIL_MODE = "smtp";
      process.env.SMTP_HOST = "smtp.example.test";
      process.env.SMTP_PORT = "465";
      process.env.SMTP_USER = "unit-test@example.test";
      process.env.SMTP_PASSWORD = "unit-test-placeholder";
      process.env.SMTP_FROM = "Funded Experts <unit-test@example.test>";
      process.env.NEXT_PUBLIC_SMTP_PASSWORD = "browser-secret-placeholder";

      assert.equal(validateEmailConfig().valid, false);
      assert.throws(() => getEmailConfig(), /browser-prefixed SMTP variables: NEXT_PUBLIC_SMTP_PASSWORD/);
      assert.ok(!JSON.stringify(getEmailConfigDiagnostics()).includes("browser-secret-placeholder"));
    } finally {
      restoreEnvironment();
    }
  });

  it("reports delivery mode and credential presence without returning credential values", () => {
    try {
      process.env.EMAIL_MODE = "smtp";
      process.env.SMTP_HOST = "smtp.gmail.com";
      process.env.SMTP_PORT = "465";
      process.env.SMTP_USER = "diagnostic-user@example.test";
      process.env.SMTP_PASSWORD = "diagnostic-password-placeholder";
      process.env.SMTP_FROM = "Funded Experts <diagnostic-user@example.test>";
      const diagnostics = getEmailConfigDiagnostics();
      assert.equal(diagnostics.provider, "gmail-smtp");
      assert.equal(diagnostics.deliveryEnabled, true);
      assert.deepEqual(diagnostics.missingVariables, []);
      assert.equal(diagnostics.transportSecurity, "implicit-tls");
      const sanitized = JSON.stringify(diagnostics);
      assert.ok(!sanitized.includes("diagnostic-password-placeholder"));
      assert.ok(!sanitized.includes("diagnostic-user@example.test"));
    } finally {
      restoreEnvironment();
    }
  });
});

describe("email application URL configuration", () => {
  const keys = ["NODE_ENV", "NEXT_PUBLIC_SITE_URL", "SITE_URL"] as const;
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const mutableEnvironment = process.env as unknown as Record<string, string | undefined>;

  function restoreEnvironment() {
    for (const key of keys) {
      const value = original[key];
      if (value === undefined) delete mutableEnvironment[key];
      else mutableEnvironment[key] = value;
    }
  }

  it("uses a local fallback only outside production and normalizes the configured origin", () => {
    try {
      mutableEnvironment.NODE_ENV = "test";
      delete mutableEnvironment.NEXT_PUBLIC_SITE_URL;
      delete mutableEnvironment.SITE_URL;
      assert.equal(getAppUrl(), "http://localhost:3000");

      mutableEnvironment.NODE_ENV = "production";
      assert.throws(() => getAppUrl(), /NEXT_PUBLIC_SITE_URL or SITE_URL is required/);
      mutableEnvironment.SITE_URL = "https://example.test/";
      assert.equal(getAppUrl(), "https://example.test");
      assert.equal(buildAppUrl("/verify-email"), "https://example.test/verify-email");
    } finally {
      restoreEnvironment();
    }
  });
});
