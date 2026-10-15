"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";

type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  performedBy: string | null;
  timestamp: string;
};

type AuditResponse = {
  success: true;
  events: AuditEvent[];
  nextCursor: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuditEvent(value: unknown): value is AuditEvent {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.action === "string"
    && typeof value.entityType === "string"
    && typeof value.entityId === "string"
    && (typeof value.performedBy === "string" || value.performedBy === null)
    && typeof value.timestamp === "string"
    && !Number.isNaN(Date.parse(value.timestamp));
}

function isAuditResponse(value: unknown): value is AuditResponse {
  return isRecord(value)
    && value.success === true
    && Array.isArray(value.events)
    && value.events.every(isAuditEvent)
    && (typeof value.nextCursor === "string" || value.nextCursor === null);
}

async function requestAuditPage(cursor: string | null): Promise<AuditResponse> {
  const query = new URLSearchParams({ limit: "25" });
  if (cursor) query.set("before", cursor);
  const response = await fetch(`/api/admin/audit-logs?${query.toString()}`, { cache: "no-store" });

  if (response.status === 401) throw new Error("Sign in with an administrator account to view audit history.");
  if (response.status === 403) throw new Error("Administrator access is required to view audit history.");
  if (!response.ok) throw new Error("Audit history is temporarily unavailable. Please try again.");

  const body: unknown = await response.json();
  if (!isAuditResponse(body)) throw new Error("Audit history returned an unexpected response. Please retry.");
  return body;
}

function formatLabel(value: string) {
  return value.toLowerCase().split("_").map((word) => word ? word[0]!.toUpperCase() + word.slice(1) : "").join(" ");
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export default function AdminAuditLogsPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadPage = useCallback(async (cursor: string | null, replace: boolean) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);
    setError("");

    try {
      const body = await requestAuditPage(cursor);

      setEvents((current) => replace ? body.events : [...current, ...body.events]);
      setNextCursor(body.nextCursor);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "Error" ? cause.message : "Audit history is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void requestAuditPage(null)
      .then((body) => {
        if (!active) return;
        setEvents(body.events);
        setNextCursor(body.nextCursor);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error && cause.name === "Error" ? cause.message : "Audit history is temporarily unavailable. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPath="/admin" />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
        <div className="mb-7 flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Administration</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Audit history</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review recorded account, product, rule, and evaluation actions in time order.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPage(null, true)}
            disabled={loading || loadingMore}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh history
          </button>
        </div>

        <p className="mb-5 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
          This view shows event metadata only. Stored event details are intentionally hidden because they may include personal or sensitive information.
        </p>

        {loading && !loaded ? (
          <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading audit history…</p>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-danger/25 bg-danger/5 p-5">
            <p className="text-sm text-danger">{error}</p>
            <button
              type="button"
              onClick={() => void loadPage(null, true)}
              className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {loaded ? "No audit events have been recorded yet." : "Audit history is unavailable."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="min-w-[44rem] w-full divide-y divide-border">
                <caption className="sr-only">Recent administrator audit events</caption>
                <thead className="bg-background">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Record</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Performed by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{formatTimestamp(event.timestamp)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{formatLabel(event.action)}</td>
                      <td className="max-w-sm px-4 py-3 text-sm text-foreground">
                        <span className="block">{formatLabel(event.entityType)}</span>
                        <span className="block break-all font-mono text-xs text-muted-foreground">{event.entityId}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{event.performedBy ?? "System"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nextCursor && (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadPage(nextCursor, false)}
                  disabled={loadingMore}
                  aria-busy={loadingMore}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Load older events"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
