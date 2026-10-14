"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

type Step = "code" | "password" | "success";

export default function ResetPasswordPage() {
  const [step, setStep] = useState<Step>("code");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [proof, setProof] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setEmail(window.sessionStorage.getItem("funded-experts:password-reset-email") ?? "");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/reset-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || typeof data.proof !== "string") {
        setError(data.error ?? "That code could not be verified. Request a new one and try again.");
        return;
      }
      setProof(data.proof);
      setCode("");
      setStep("password");
    } catch {
      setError("We could not reach the reset service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      setError("Use at least 8 characters, including a letter and a number.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, proof, newPassword: password }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error ?? "The reset session expired. Request a new code and try again.");
        return;
      }
      setProof("");
      setPassword("");
      setConfirmPassword("");
      window.sessionStorage.removeItem("funded-experts:password-reset-email");
      setStep("success");
    } catch {
      setError("We could not reach the reset service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "success") {
    return (
      <AuthShell
        title="Password updated"
        description="Your new password is ready to use."
      >
        <p className="rounded-xl border border-success/30 bg-success-light p-4 text-sm text-foreground" role="status">Sign in with your new password. Other existing sessions may remain active.</p>
        <Link href="/login" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Return to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={step === "code" ? "Verify reset code" : "Choose a new password"}
      description={step === "code" ? "Enter the 6-digit code from your email. It expires after 10 minutes." : "Use at least 8 characters, including a letter and a number."}
    >
      {error && <div className="mb-5 rounded-xl border border-danger/30 bg-danger-light p-4 text-sm text-danger" role="alert">{error}</div>}
      {step === "code" ? (
        <form onSubmit={verifyCode} className="space-y-5">
          <div>
            <label htmlFor="reset-email" className="mb-2 block text-sm font-medium text-foreground">Email address</label>
            <input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={255} autoComplete="email" className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div>
            <label htmlFor="reset-code" className="mb-2 block text-sm font-medium text-foreground">Six-digit code</label>
            <input id="reset-code" type="text" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required minLength={6} maxLength={6} inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-center font-mono text-2xl tracking-[0.45em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <Button type="submit" fullWidth size="lg" loading={busy} disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify code"}</Button>
        </form>
      ) : (
        <form onSubmit={updatePassword} className="space-y-5">
          <p className="rounded-xl border border-info/30 bg-info-light p-4 text-sm text-info" role="status">Code verified for {email}. Choose your new password to finish.</p>
          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-foreground">New password</label>
            <input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-foreground">Confirm new password</label>
            <input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} autoComplete="new-password" className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <Button type="submit" fullWidth size="lg" loading={busy} disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
        </form>
      )}
      <p className="mt-6 text-sm text-muted-foreground text-center">Need a new code? <Link href="/forgot-password" className="font-semibold text-foreground underline underline-offset-4">Request another</Link></p>
      <p className="mt-3 text-sm text-muted-foreground text-center">Remembered your password? <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">Sign in</Link></p>
    </AuthShell>
  );
}
