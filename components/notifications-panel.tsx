"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, EmptyState, LoadingState } from "@/components/ui";

interface Notification {
  id: string;
  traderId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
}

interface NotificationsPanelProps {
  sessionData: { authenticated: boolean; trader?: { id: string; role: string; firstName: string | null; lastName: string | null; status: string } | null } | null;
  showViewAll?: boolean;
}

export default function NotificationsPanel({ sessionData, showViewAll = false }: NotificationsPanelProps) {
  const authenticatedTraderId = sessionData?.authenticated && sessionData.trader ? sessionData.trader.id : null;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadedTraderId, setLoadedTraderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!authenticatedTraderId) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setNotifications([]);
      setLoadedTraderId(null);
      setHasLoaded(false);
      setError("");
      setSignInRequired(false);
      setMarkingId(null);
      try {
        const res = await fetch("/api/notifications", { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          if (!controller.signal.aborted) {
            setSignInRequired(true);
            setError("Your session has expired. Sign in again to view notifications.");
          }
        } else if (!res.ok || !data.success || !Array.isArray(data.notifications)) {
          if (!controller.signal.aborted) setError((data as { error?: string }).error || "Failed to load notifications");
        } else if (!controller.signal.aborted) {
          setNotifications(data.notifications);
          setLoadedTraderId(authenticatedTraderId);
          setHasLoaded(true);
        }
      } catch {
        if (!controller.signal.aborted) setError("Network error. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [authenticatedTraderId, retryKey]);

  async function handleMarkRead(notificationId: string) {
    setMarkingId(notificationId);
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
        setError("");
        setSignInRequired(false);
      } else {
        const err = (body as { error?: string }).error || "Failed to mark as read";
        setError(err);
        setSignInRequired(res.status === 401);
      }
    } catch {
      setError("Network error. Please try again.");
      setSignInRequired(false);
    } finally {
      setMarkingId(null);
    }
  }

  const visibleNotifications = loadedTraderId === authenticatedTraderId ? notifications : [];
  const visibleHasLoaded = loadedTraderId === authenticatedTraderId && hasLoaded;
  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return Number.isNaN(date.getTime())
      ? "Date unavailable"
      : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  if (!sessionData?.authenticated || !sessionData.trader) {
    return null;
  }

  return (
    <section className="mb-8" aria-labelledby="notifications-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="notifications-heading" className="text-xl font-semibold text-card-foreground">
          Notifications
          {unreadCount > 0 && (
            <Badge variant="warning" size="sm" className="ml-2">{unreadCount} unread</Badge>
          )}
        </h2>
        {showViewAll && <Link href="/notifications" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View notification history <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
      </div>

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger" role="alert">
          <span>{error}</span>
          {signInRequired ? (
            <Link href="/login" className="rounded-lg px-3 py-2 font-semibold text-danger underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Sign in again</Link>
          ) : (
            <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="rounded-lg px-3 py-2 font-semibold text-danger underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Reload notifications</button>
          )}
        </div>
      )}

      {loading || !visibleHasLoaded && !error ? (
        <div role="status" aria-label="Loading notifications"><LoadingState variant="skeleton" /></div>
      ) : error && !visibleHasLoaded ? null : visibleNotifications.length === 0 ? (
        <EmptyState title="No notifications" description="Account notices will appear here when they are available." variant="bordered" />
      ) : (
        <div className="space-y-3">
          {visibleNotifications.map((notif) => (
            <div
              key={notif.id}
              className={`rounded-lg border p-4 shadow-sm ${
                notif.read
                  ? "border-border bg-card"
                  : "border-primary/40 bg-primary-light/40"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-card-foreground">
                      {notif.title}
                    </h3>
                    {!notif.read && (
                      <Badge variant="primary" size="sm">New</Badge>
                    )}
                  </div>
                  <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                    {notif.message}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(notif.createdAt)}
                  </p>
                  {getNotificationHref(notif) && (
                    <Link href={getNotificationHref(notif)!} className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      View related {relatedEntityLabel(notif.relatedEntityType)}
                    </Link>
                  )}
                </div>
                {!notif.read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(notif.id)}
                    disabled={markingId === notif.id}
                    aria-busy={markingId === notif.id}
                    className="min-h-9 shrink-0 rounded-lg border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {markingId === notif.id ? "Marking…" : "Mark read"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function getNotificationHref(notification: Notification): string | null {
  if (!notification.relatedEntityId) return null;
  const id = encodeURIComponent(notification.relatedEntityId);
  switch (notification.relatedEntityType?.toLowerCase()) {
    case "order": return `/orders/${id}`;
    case "evaluation": return `/evaluations/${id}`;
    case "fundedaccount": return `/accounts/${id}`;
    default: return null;
  }
}

function relatedEntityLabel(entityType: string | null): string {
  switch (entityType?.toLowerCase()) {
    case "order": return "order";
    case "evaluation": return "evaluation";
    case "fundedaccount": return "account";
    default: return "record";
  }
}
