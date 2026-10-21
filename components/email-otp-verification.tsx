"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/auth-shell";
import { Button, ButtonLink } from "@/components/ui/button";

const EMAIL_STORAGE_KEY = "funded-experts:verification-email";

export default function EmailOtpVerification() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setEmail(window.sessionStorage.getItem(EMAIL_STORAGE_KEY) ?? "");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      const response = await fetch("/api/auth/verify-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setMessage(data.error ?? "That code could not be verified. Request a new one and try again.");
        setIsError(true);
        return;
      }
      window.sessionStorage.removeItem(EMAIL_STORAGE_KEY);
      setVerified(true);
      setMessage("Your email is verified. You can now sign in.");
    } catch {
      setMessage("We could not reach the verification service. Check your connection and try again.");
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (resendSeconds > 0 || busy) return;
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setMessage(data.error ?? "We could not request a new code. Try again later.");
        setIsError(true);
        return;
      }
      setCode("");
      setResendSeconds(60);
      setMessage("If this address belongs to an unverified account, a new code has been requested. Check your inbox and spam folder.");
    } catch {
      setMessage("We could not reach the email service. Check your connection and try again.");
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={verified ? "Email verified" : "Verify your email"}
      description={verified ? "Your account is ready. Sign in to continue." : "If this is a new account, enter the 6-digit code sent to this address. If you already have an account, sign in or reset your password."}
    >
      {verified ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-success/30 bg-success-light p-4 text-sm text-foreground" role="status">{message}</p>
          <ButtonLink href="/login" fullWidth>Continue to sign in</ButtonLink>
        </div>
      ) : (
        <>
          {message && <div className={`mb-5 rounded-xl border p-4 text-sm ${isError ? "border-danger/30 bg-danger-light text-danger" : "border-info/30 bg-info-light text-info"}`} role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"}>{message}</div>}
          <form onSubmit={submitCode} className="space-y-5">
            <div>
              <label htmlFor="verify-email" className="mb-2 block text-sm font-medium text-foreground">Email address</label>
              <input id="verify-email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={255} autoComplete="email" className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label htmlFor="verification-code" className="mb-2 block text-sm font-medium text-foreground">Six-digit code</label>
              <input id="verification-code" name="code" type="text" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required minLength={6} maxLength={6} inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" aria-describedby="verification-code-help" className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-center font-mono text-2xl tracking-[0.45em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <p id="verification-code-help" className="mt-2 text-xs leading-5 text-muted-foreground">Paste the complete code from the email. The latest code replaces earlier ones.</p>
            </div>
            <Button type="submit" fullWidth size="lg" loading={busy} disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify email"}</Button>
          </form>
          <Button type="button" variant="outline" fullWidth className="mt-3" disabled={busy || resendSeconds > 0 || !email} onClick={resendCode}>
            {resendSeconds > 0 ? `Request another code in ${resendSeconds}s` : "Resend code"}
          </Button>
          <p className="mt-6 text-sm text-muted-foreground text-center">Already have an account? <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">Sign in</Link>{" "}or{" "}<Link href="/forgot-password" className="font-semibold text-foreground underline underline-offset-4">reset your password</Link></p>
        </>
      )}
    </AuthShell>
  );
}
