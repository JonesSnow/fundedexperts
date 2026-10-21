"use client";

import { useState } from "react";
import Header from "@/components/header";

interface AdminNotification {
  id: string;
  traderId: string;
  trader: { email: string; firstName: string | null; lastName: string | null } | null;
  type: string;
  title: string;
  message: string;
  read: boolean;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
}

interface TraderSearchResult {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
}

interface ApiNotificationResponse {
  success: boolean;
  notifications?: AdminNotification[];
  unreadCount?: number;
  nextCursor?: string | null;
  error?: string;
}

const NOTIFICATION_PAGE_SIZE = 50;

export default function AdminNotificationsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchTrader, setSearchTrader] = useState<TraderSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");
  const [notificationsError, setNotificationsError] = useState("");
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  async function searchTraderByEmailOrId(value: string) {
    if (!value.trim()) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchTrader(null);
    setNotifications([]);
    setUnreadTotal(0);
    setNextCursor(null);
    setOlderError("");
    try {
      let url = "";
      if (value.includes("@")) {
        url = `/api/admin/lifecycle?email=${encodeURIComponent(value)}&identityOnly=true`;
      } else {
        url = `/api/admin/lifecycle?customerId=${encodeURIComponent(value)}&identityOnly=true`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success && data.customer) {
        const c: TraderSearchResult = {
          id: data.customer.id,
          email: data.customer.email,
          role: data.customer.role,
          firstName: data.customer.firstName,
          lastName: data.customer.lastName,
          status: data.customer.status,
        };
        setSearchTrader(c);
        await loadNotifications(c.id);
      } else {
        setSearchError((data as { error?: string }).error || "Trader not found");
      }
    } catch {
      setSearchError("Network error. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadNotifications(traderId: string, cursor: string | null = null, append = false) {
    if (append) setLoadingOlder(true);
    else setNotificationsLoading(true);
    if (append) setOlderError("");
    else setNotificationsError("");
    try {
      const query = new URLSearchParams({ traderId, limit: String(NOTIFICATION_PAGE_SIZE) });
      if (cursor) query.set("before", cursor);
      const res = await fetch(`/api/notifications?${query.toString()}`);
      const data = (await res.json()) as ApiNotificationResponse;
      if (
        res.ok && data.success && Array.isArray(data.notifications) &&
        typeof data.unreadCount === "number" && Number.isSafeInteger(data.unreadCount) && data.unreadCount >= 0 &&
        (data.nextCursor === null || typeof data.nextCursor === "string")
      ) {
        if (append) {
          setNotifications((current) => {
            const knownIds = new Set(current.map((notification) => notification.id));
            return [...current, ...(data.notifications ?? []).filter((notification) => !knownIds.has(notification.id))];
          });
          setOlderError("");
        } else {
          setNotifications(data.notifications);
        }
        setUnreadTotal(data.unreadCount);
        setNextCursor(data.nextCursor ?? null);
      } else {
        const error = data.error || "Notifications returned an unexpected response. Please retry.";
        if (append) setOlderError(error);
        else setNotificationsError(error);
      }
    } catch {
      if (append) setOlderError("Network error while loading older notifications.");
      else setNotificationsError("Network error. Please try again.");
    } finally {
      setNotificationsLoading(false);
      setLoadingOlder(false);
    }
  }

  async function handleLoadOlder() {
    if (!searchTrader || !nextCursor || loadingOlder) return;
    await loadNotifications(searchTrader.id, nextCursor, true);
  }

  async function handleMarkRead(notificationId: string) {
    setLoadingIds((prev) => new Set(prev).add(notificationId));
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && (body as { success?: boolean }).success) {
        const wasUnread = notifications.some((notification) => notification.id === notificationId && !notification.read);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
        if (wasUnread) setUnreadTotal((count) => Math.max(0, count - 1));
      } else {
        setNotificationsError((body as { error?: string }).error || "Failed to update");
      }
    } catch {
      setNotificationsError("Network error. Please try again.");
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  }

  async function handleMarkUnread(notificationId: string) {
    setLoadingIds((prev) => new Set(prev).add(notificationId));
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: false }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && (body as { success?: boolean }).success) {
        const wasRead = notifications.some((notification) => notification.id === notificationId && notification.read);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: false } : n))
        );
        if (wasRead) setUnreadTotal((count) => count + 1);
      } else {
        setNotificationsError((body as { error?: string }).error || "Failed to update");
      }
    } catch {
      setNotificationsError("Network error. Please try again.");
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  }

  async function handleDelete(notificationId: string) {
    setLoadingIds((prev) => new Set(prev).add(notificationId));
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && (body as { success?: boolean }).success) {
        const wasUnread = notifications.some((notification) => notification.id === notificationId && !notification.read);
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        if (wasUnread) setUnreadTotal((count) => Math.max(0, count - 1));
      } else {
        setNotificationsError((body as { error?: string }).error || "Failed to delete");
      }
    } catch {
      setNotificationsError("Network error. Please try again.");
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  }

  const [composeTitle, setComposeTitle] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeType, setComposeType] = useState("SYSTEM");
  const [composeLoading, setComposeLoading] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [composeSuccess, setComposeSuccess] = useState("");

  async function handleSendNotification(e: React.FormEvent) {
    e.preventDefault();
    if (!searchTrader) return;
    setComposeLoading(true);
    setComposeError("");
    setComposeSuccess("");
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: composeTitle,
          message: composeMessage,
          traderId: searchTrader.id,
          type: composeType,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setComposeSuccess("Notification sent successfully");
        setComposeTitle("");
        setComposeMessage("");
        await loadNotifications(searchTrader.id);
      } else {
        setComposeError((data as { error?: string }).error || "Failed to send notification");
      }
    } catch {
      setComposeError("Network error. Please try again.");
    } finally {
      setComposeLoading(false);
    }
  }

  const unreadCount = unreadTotal;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Header />
      <h1 className="text-3xl font-bold mb-2">Notifications</h1>
      <p className="text-muted-foreground mb-6">Manage trader notifications — search, view, send, and manage.</p>

      {/* Search */}
      <div className="mb-6 p-4 rounded-lg border border-border bg-card shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Search Trader</h2>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Trader email or ID"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="px-3 py-2 border rounded w-72 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            onClick={() => searchTraderByEmailOrId(searchInput)}
            disabled={searchLoading || !searchInput.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary disabled:opacity-50"
          >
            {searchLoading ? "Searching…" : "Search"}
          </button>
        </div>
        {searchError && (
          <div className="mt-2 rounded border border-danger/30 bg-danger-light p-3 text-sm text-danger">
            {searchError}
          </div>
        )}
        {searchTrader && (
          <div className="mt-3 rounded border border-success/30 bg-success-light p-3 text-success">
            <p className="text-sm font-medium">
              {searchTrader.firstName || ""} {searchTrader.lastName || ""} —{" "}
              <span className="font-mono">{searchTrader.email}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {searchTrader.status} · {searchTrader.role}
            </p>
          </div>
        )}
      </div>

      {/* Compose */}
      {searchTrader && (
        <div className="mb-6 p-4 rounded-lg border border-border bg-card shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Send Notification</h2>
          {composeError && (
            <div className="mb-3 rounded border border-danger/30 bg-danger-light p-3 text-sm text-danger">
              {composeError}
            </div>
          )}
          {composeSuccess && (
            <div className="mb-3 rounded border border-success/30 bg-success-light p-3 text-sm text-success">
              {composeSuccess}
            </div>
          )}
          <form onSubmit={handleSendNotification}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <input
                type="text"
                placeholder="Title"
                value={composeTitle}
                onChange={(e) => setComposeTitle(e.target.value)}
                required
                className="px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <select
                value={composeType}
                onChange={(e) => setComposeType(e.target.value)}
                className="px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="SYSTEM">SYSTEM</option>
                <option value="ORDER">ORDER</option>
                <option value="EVALUATION">EVALUATION</option>
                <option value="ACCOUNT">ACCOUNT</option>
                <option value="EMAIL_VERIFICATION">EMAIL_VERIFICATION</option>
                <option value="PASSWORD_RESET">PASSWORD_RESET</option>
                <option value="ACCOUNT_ACTIVATION">ACCOUNT_ACTIVATION</option>
                <option value="NOTICE">NOTICE</option>
              </select>
            </div>
            <textarea
              placeholder="Message"
              value={composeMessage}
              onChange={(e) => setComposeMessage(e.target.value)}
              required
              rows={3}
              className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={composeLoading || !composeTitle.trim() || !composeMessage.trim()}
              className="mt-3 px-4 py-2 bg-success text-primary-foreground rounded hover:bg-success-hover disabled:opacity-50"
            >
              {composeLoading ? "Sending…" : "Send Notification"}
            </button>
          </form>
        </div>
      )}

      {/* Notifications List */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            Notifications
            {searchTrader && unreadCount > 0 && (
              <span className="ml-2 rounded-full bg-danger-light px-2 py-0.5 text-xs font-medium text-danger">
                {unreadCount} unread
              </span>
            )}
          </h2>
        </div>

        {notificationsError && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger-light p-3 text-sm text-danger" role="alert">
            <span>{notificationsError}</span>
            {searchTrader && (
              <button
                type="button"
                onClick={() => void loadNotifications(searchTrader.id)}
                disabled={notificationsLoading}
                className="rounded px-3 py-2 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {notificationsLoading ? "Retrying…" : "Retry"}
              </button>
            )}
          </div>
        )}

        {!searchTrader ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">Search for a trader to view their notifications.</p>
          </div>
        ) : notificationsLoading ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">Loading notifications…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">No notifications for this trader.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-background">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Trader</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Read</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {notifications.map((notif) => (
                  <tr key={notif.id} className="hover:bg-background">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{notif.title}</div>
                      <div className="text-xs text-muted-foreground max-w-xs truncate">{notif.message}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {notif.trader
                        ? `${notif.trader.firstName || ""} ${notif.trader.lastName || ""} — ${notif.trader.email}`
                        : notif.traderId}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          notif.read
                            ? "bg-success-light text-success"
                            : "bg-danger-light text-danger"
                        }`}
                      >
                        {notif.read ? "Read" : "Unread"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(notif.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {!notif.read && (
                          <button
                            onClick={() => handleMarkRead(notif.id)}
                            disabled={loadingIds.has(notif.id)}
                            className="rounded bg-info-light px-2 py-1 text-xs text-info hover:bg-info/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          >
                            {loadingIds.has(notif.id) ? "…" : "Mark Read"}
                          </button>
                        )}
                        {notif.read && (
                          <button
                            onClick={() => handleMarkUnread(notif.id)}
                            disabled={loadingIds.has(notif.id)}
                            className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-muted disabled:opacity-50"
                          >
                            {loadingIds.has(notif.id) ? "…" : "Mark Unread"}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(notif.id)}
                          disabled={loadingIds.has(notif.id)}
                          className="rounded bg-danger-light px-2 py-1 text-xs text-danger hover:bg-danger/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          {loadingIds.has(notif.id) ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {searchTrader && !notificationsLoading && nextCursor && (
          <div className="mt-4 space-y-2">
            {olderError && <p className="text-sm text-danger" role="alert">{olderError}</p>}
            <button
              type="button"
              onClick={() => void handleLoadOlder()}
              disabled={loadingOlder}
              aria-busy={loadingOlder}
              className="min-h-10 rounded border border-border bg-card px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {loadingOlder ? "Loading older notifications…" : olderError ? "Try again" : "Load older notifications"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
