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
  updatedAt: string;
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
  error?: string;
}

export default function AdminNotificationsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchTrader, setSearchTrader] = useState<TraderSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  async function searchTraderByEmailOrId(value: string) {
    if (!value.trim()) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchTrader(null);
    setNotifications([]);
    try {
      let url = "";
      if (value.includes("@")) {
        url = `/api/admin/lifecycle?email=${encodeURIComponent(value)}`;
      } else {
        url = `/api/admin/lifecycle?customerId=${encodeURIComponent(value)}`;
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

  async function loadNotifications(traderId: string) {
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      const res = await fetch(`/api/notifications?traderId=${encodeURIComponent(traderId)}`);
      const data = (await res.json()) as ApiNotificationResponse;
      if (res.ok && data.success) {
        setNotifications(data.notifications || []);
      } else {
        setNotificationsError((data as { error?: string }).error || "Failed to load notifications");
      }
    } catch {
      setNotificationsError("Network error. Please try again.");
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function handleMarkRead(notificationId: string) {
    setLoadingIds((prev) => new Set(prev).add(notificationId));
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
      } else {
        const body = await res.json().catch(() => ({}));
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
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: false } : n))
        );
      } else {
        const body = await res.json().catch(() => ({}));
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
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      } else {
        const body = await res.json().catch(() => ({}));
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

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Header />
      <h1 className="text-3xl font-bold mb-2">Notifications</h1>
      <p className="text-gray-600 mb-6">Manage trader notifications — search, view, send, and manage.</p>

      {/* Search */}
      <div className="mb-6 p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Search Trader</h2>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Trader email or ID"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="px-3 py-2 border rounded w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => searchTraderByEmailOrId(searchInput)}
            disabled={searchLoading || !searchInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {searchLoading ? "Searching…" : "Search"}
          </button>
        </div>
        {searchError && (
          <div className="mt-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {searchError}
          </div>
        )}
        {searchTrader && (
          <div className="mt-3 p-3 rounded border border-green-200 bg-green-50">
            <p className="text-sm font-medium">
              {searchTrader.firstName || ""} {searchTrader.lastName || ""} —{" "}
              <span className="font-mono">{searchTrader.email}</span>
            </p>
            <p className="text-xs text-gray-500">
              {searchTrader.status} · {searchTrader.role}
            </p>
          </div>
        )}
      </div>

      {/* Compose */}
      {searchTrader && (
        <div className="mb-6 p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Send Notification</h2>
          {composeError && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {composeError}
            </div>
          )}
          {composeSuccess && (
            <div className="mb-3 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
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
                className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={composeType}
                onChange={(e) => setComposeType(e.target.value)}
                className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={composeLoading || !composeTitle.trim() || !composeMessage.trim()}
              className="mt-3 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
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
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {unreadCount} unread
              </span>
            )}
          </h2>
        </div>

        {notificationsError && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {notificationsError}
          </div>
        )}

        {!searchTrader ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-600">Search for a trader to view their notifications.</p>
          </div>
        ) : notificationsLoading ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-500">Loading notifications…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-600">No notifications for this trader.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Trader</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Read</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {notifications.map((notif) => (
                  <tr key={notif.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{notif.title}</div>
                      <div className="text-xs text-gray-500 max-w-xs truncate">{notif.message}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {notif.trader
                        ? `${notif.trader.firstName || ""} ${notif.trader.lastName || ""} — ${notif.trader.email}`
                        : notif.traderId}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          notif.read
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {notif.read ? "Read" : "Unread"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(notif.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {!notif.read && (
                          <button
                            onClick={() => handleMarkRead(notif.id)}
                            disabled={loadingIds.has(notif.id)}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                          >
                            {loadingIds.has(notif.id) ? "…" : "Mark Read"}
                          </button>
                        )}
                        {notif.read && (
                          <button
                            onClick={() => handleMarkUnread(notif.id)}
                            disabled={loadingIds.has(notif.id)}
                            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                          >
                            {loadingIds.has(notif.id) ? "…" : "Mark Unread"}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(notif.id)}
                          disabled={loadingIds.has(notif.id)}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
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
      </section>
    </div>
  );
}
