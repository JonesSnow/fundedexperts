"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });
      const data = await response.json();

      if (response.ok) {
        window.sessionStorage.setItem("funded-experts:verification-email", data.trader.email);
        window.sessionStorage.setItem("funded-experts:verification-delivery", data.emailSent ? "sent" : "failed");
        router.push("/verify-email-pending");
      } else if (data.errors) {
        setErrors(data.errors);
      } else {
        setError(data.error || "Registration failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      description="Register to access the account catalog and your dashboard."
    >
      {error && <div className="mb-5 rounded-xl border border-danger/25 bg-danger-light p-4 text-sm text-danger" role="alert">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="register-first-name" className="mb-2 block text-sm font-medium text-foreground">First name (optional)</label>
            <input
              id="register-first-name"
              name="firstName"
              type="text"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="John"
            />
          </div>
          <div>
            <label htmlFor="register-last-name" className="mb-2 block text-sm font-medium text-foreground">Last name (optional)</label>
            <input
              id="register-last-name"
              name="lastName"
              type="text"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Doe"
            />
          </div>
        </div>
        <div>
          <label htmlFor="register-email" className="mb-2 block text-sm font-medium text-foreground">Email address</label>
          <input
            id="register-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "register-email-error" : undefined}
            className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="you@example.com"
          />
          {errors.email && <p id="register-email-error" className="mt-2 text-sm text-danger" role="alert">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="register-password" className="mb-2 block text-sm font-medium text-foreground">Password</label>
          <input
            id="register-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "register-password-error password-guidance" : "password-guidance"}
            className="w-full rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="••••••••"
          />
          {errors.password && <p id="register-password-error" className="mt-2 text-sm text-danger" role="alert">{errors.password}</p>}
          <p id="password-guidance" className="mt-2 text-xs leading-5 text-muted-foreground">At least 8 characters, including a letter and a number.</p>
        </div>
        <Button type="submit" fullWidth size="lg" loading={loading} disabled={loading} className="mt-2">
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-5 text-xs leading-5 text-muted-foreground text-center">
        By registering, you agree to our{" "}
        <Link href="/policies#terms" className="font-semibold text-foreground underline underline-offset-4">Terms</Link>{" "}
        and{" "}
        <Link href="/policies#privacy" className="font-semibold text-foreground underline underline-offset-4">Privacy notice</Link>.
        Please read the{" "}
        <Link href="/policies#risk" className="font-semibold text-foreground underline underline-offset-4">risk disclosure</Link>
        before trading.
      </p>
      <p className="mt-7 text-sm text-muted-foreground text-center">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-foreground underline decoration-primary underline-offset-4">Sign in</Link>
      </p>
    </AuthShell>
  );
}
