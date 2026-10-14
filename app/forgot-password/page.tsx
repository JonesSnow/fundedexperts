"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to send reset email.");
      } else {
        window.sessionStorage.setItem("funded-experts:password-reset-email", email.trim().toLowerCase());
        setIsSubmitted(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email to get a 6-digit reset code."
    >
      {isSubmitted ? (
        <div className="rounded-2xl border border-success/25 bg-success-light p-5" role="status" aria-live="polite">
          <p className="font-semibold text-foreground">Check your email</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            If an account exists for that address, a reset code has been sent. Check your inbox and spam folder.
            For privacy, we do not confirm whether the address is registered.
          </p>
          <Button type="button" fullWidth className="mt-5" onClick={() => router.push("/reset-password")}>Enter reset code</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="rounded-xl border border-danger/25 bg-danger-light p-4 text-sm text-danger" role="alert">{error}</div>}
          <div>
            <label htmlFor="reset-email" className="mb-2 block text-sm font-medium text-foreground">Email address</label>
            <input
              id="reset-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="you@example.com"
            />
          </div>
          <Button type="submit" fullWidth size="lg" loading={isLoading} disabled={isLoading}>
            {isLoading ? "Sending…" : "Send reset code"}
          </Button>
        </form>
      )}
      <p className="mt-7 text-sm text-muted-foreground text-center">
        Remembered your password?{" "}
        <Link href="/login" className="font-semibold text-foreground underline decoration-primary underline-offset-4">Return to sign in</Link>
      </p>
    </AuthShell>
  );
}
