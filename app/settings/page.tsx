"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import TraderPageShell from "@/components/trader-page-shell";
import TraderLoadError from "@/components/trader-load-error";
import { Badge, Card, CardContent, CardHeader, CardTitle, LoadingState, StatusBadge } from "@/components/ui";

interface UserSettings {
  id: string;
  email: string;
  role: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserSettings | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [signInRequired, setSignInRequired] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [profileFeedback, setProfileFeedback] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadSettings() {
      setLoading(true);
      setPageError("");
      setSignInRequired(false);
      try {
        const response = await fetch("/api/auth/settings", { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setSignInRequired(true);
          throw new Error("Sign in to manage your settings.");
        }
        if (!response.ok || !data.success || !data.user) throw new Error("Account settings are unavailable right now.");
        setUser(data.user);
        setFirstName(data.user.firstName ?? "");
        setLastName(data.user.lastName ?? "");
      } catch (cause) {
        if (!controller.signal.aborted) setPageError(cause instanceof Error ? cause.message : "Account settings are unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadSettings();
    return () => controller.abort();
  }, [retryKey]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileFeedback("");
    setPasswordFeedback("");
    setPageError("");
    setSignInRequired(false);
    try {
      const response = await fetch("/api/auth/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      const data = await response.json();
      if (response.status === 401) {
        setSignInRequired(true);
        throw new Error("Sign in again before saving profile details.");
      }
      if (!response.ok || !data.success || !data.user) throw new Error(data.error || "Profile could not be saved. Please try again.");
      setUser(data.user);
      setProfileFeedback("Profile details saved.");
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : "Profile could not be saved. Please try again.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordSaving(true);
    setPasswordFeedback("");
    setProfileFeedback("");
    setPageError("");
    setSignInRequired(false);
    try {
      const response = await fetch("/api/auth/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (response.status === 401) {
        setSignInRequired(true);
        throw new Error("Sign in again before changing your password.");
      }
      if (!response.ok || !data.success) throw new Error(data.error || "Password could not be changed. Please try again.");
      setCurrentPassword("");
      setNewPassword("");
      setPasswordFeedback("Password changed.");
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : "Password could not be changed. Please try again.");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <TraderPageShell currentPath="/settings" title="Profile and settings" description="Manage the profile details and password controls currently supported by your account." actions={<Badge variant="outline">{user?.role || "Account"}</Badge>}>
      {pageError && user && (
        <div className="mb-5 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger" role="alert">
          <p>{pageError}</p>
          {signInRequired && <Link href="/login" className="mt-2 inline-flex min-h-9 items-center font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Sign in again</Link>}
        </div>
      )}
      {loading ? (
        <LoadingState variant="skeleton" text="Loading account settings" />
      ) : !user ? (
        <TraderLoadError title="Settings unavailable" message={pageError || "Sign in to view and update your account settings."} signInRequired={signInRequired} onRetry={() => setRetryKey((key) => key + 1)} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Profile details</CardTitle><p className="mt-1 text-sm text-muted-foreground">Your email address is used for account access and cannot be changed here.</p></CardHeader>
            <CardContent>
              <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-base font-bold text-primary" aria-hidden="true">
                  {[firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || user.email[0]?.toUpperCase() || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{[firstName, lastName].filter(Boolean).join(" ") || "Profile name not set"}</p>
                  <p className="mt-0.5 break-all text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <StatusBadge status={user.status} size="sm" />
                  <Badge variant={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "Email verified" : "Email not verified"}</Badge>
                </div>
              </div>
              {!user.emailVerified && <p className="mb-5 text-sm text-muted-foreground">Verify your email to complete account setup. <Link href="/verify-email-pending" className="font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open verification options</Link></p>}
              <form onSubmit={saveProfile} className="space-y-4">
                <Field id="settings-first-name" label="First name" value={firstName} onChange={setFirstName} maxLength={100} autoComplete="given-name" />
                <Field id="settings-last-name" label="Last name" value={lastName} onChange={setLastName} maxLength={100} autoComplete="family-name" />
                {profileFeedback && <p className="text-sm font-medium text-success" role="status">{profileFeedback}</p>}
                <button type="submit" disabled={profileSaving} aria-busy={profileSaving} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">{profileSaving ? "Saving…" : "Save profile"}</button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Password</CardTitle><p className="mt-1 text-sm text-muted-foreground">Changing your password requires your current password.</p></CardHeader>
            <CardContent>
              <form onSubmit={changePassword} className="space-y-4">
                <label htmlFor="settings-current-password" className="block text-sm font-medium text-foreground">Current password<input id="settings-current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-input-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
                <label htmlFor="settings-new-password" className="block text-sm font-medium text-foreground">New password<input id="settings-new-password" type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-input-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /><span className="mt-1 block text-xs text-muted-foreground">Use at least 8 characters.</span></label>
                <p className="text-sm text-muted-foreground">Forgot your current password? <Link href="/forgot-password" className="font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Request a password reset code</Link></p>
                {passwordFeedback && <p className="text-sm font-medium text-success" role="status">{passwordFeedback}</p>}
                <button type="submit" disabled={passwordSaving} aria-busy={passwordSaving} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">{passwordSaving ? "Updating…" : "Change password"}</button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </TraderPageShell>
  );
}

function Field({ id, label, value, onChange, maxLength, autoComplete }: { id: string; label: string; value: string; onChange: (value: string) => void; maxLength: number; autoComplete: string }) {
  return <label htmlFor={id} className="block text-sm font-medium text-foreground">{label}<input id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} autoComplete={autoComplete} className="mt-1.5 min-h-11 w-full rounded-lg border border-input-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>;
}
