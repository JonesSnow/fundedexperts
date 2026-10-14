"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TraderPageShell from "@/components/trader-page-shell";
import NotificationsPanel from "@/components/notifications-panel";
import { ButtonLink, EmptyState, LoadingState } from "@/components/ui";

interface SessionData {
  authenticated: boolean;
  trader?: { id: string; role: string; firstName: string | null; lastName: string | null; status: string } | null;
}

export default function NotificationsPage() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSession() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/auth/session", { signal: controller.signal });
        if (!response.ok) throw new Error("Session status is unavailable.");
        const data = await response.json();
        if (!controller.signal.aborted) setSessionData(data);
      } catch {
        if (!controller.signal.aborted) setError("We could not verify your session. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadSession();
    return () => controller.abort();
  }, [retryKey]);

  return (
    <TraderPageShell currentPath="/notifications" title="Notifications" description="Review account notices and mark unread items as read." actions={<ButtonLink href="/dashboard" variant="outline">Dashboard</ButtonLink>}>
      {error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 p-5" role="alert"><p className="font-semibold text-foreground">Notifications unavailable</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><button type="button" onClick={() => setRetryKey((key) => key + 1)} className="mt-4 min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Try again</button></div>
      ) : loading ? (
        <LoadingState variant="skeleton" text="Checking your session" />
      ) : !sessionData?.authenticated || !sessionData.trader ? (
        <EmptyState title="Sign in to view notifications" description="Notifications are tied to your account." variant="card"><Link href="/login" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Sign in</Link></EmptyState>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><NotificationsPanel sessionData={sessionData} /></div>
      )}
    </TraderPageShell>
  );
}
