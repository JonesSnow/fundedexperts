"use client";

import { useState, useEffect } from "react";

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
  updatedAt: string;
}

interface NotificationsPanelProps {
  sessionData: { authenticated: boolean; trader: { id: string; role: string; firstName: string | null; lastName: string | null; status: string } | null } | null;
}

export default function NotificationsPanel({ sessionData }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionData?.authenticated || !sessionData.trader) return;
    const cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/notifications");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setNotifications(data.notifications || []);
        } else {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setError((body as { error?: string }).error || "Failed to load notifications");
        }
      } catch {
        if (!cancelled) setError("Network error. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
  }, [sessionData]);

  async function handleMarkRead(notificationId: string) {
    setMarkingId(notificationId);
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
        const err = (body as { error?: string }).error || "Failed to mark as read";
        setError(err);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setMarkingId(null);
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  if (!sessionData?.authenticated || !sessionData.trader) {
    return null;
  }

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {unreadCount} unread
            </span>
          )}
        </h2>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-500">Loading notifications…</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-600">No notifications</p>
          <p className="mt-1 text-sm text-gray-500">
            You will receive notifications for important updates.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`rounded-lg border p-4 shadow-sm ${
                notif.read
                  ? "border-gray-200 bg-white"
                  : "border-blue-200 bg-blue-50"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-sm font-semibold ${notif.read ? "text-gray-800" : "text-gray-900"}`}>
                      {notif.title}
                    </h3>
                    {!notif.read && (
                      <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs font-medium text-white">
                        New
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600 break-words">
                    {notif.message}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatDate(notif.createdAt)}
                  </p>
                </div>
                {!notif.read && (
                  <button
                    onClick={() => handleMarkRead(notif.id)}
                    disabled={markingId === notif.id}
                    className="shrink-0 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
