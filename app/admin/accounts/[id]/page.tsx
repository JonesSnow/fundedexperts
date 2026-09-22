'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

interface Account {
  id: string;
  accountNumber: string;
  broker: string | null;
  server: string | null;
  login: string | null;
  accountSize: number | null;
  currency: string;
  purpose: string | null;
  status: string;
  healthStatus: string;
  notes: string | null;
  lastHealthCheck: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/accounts/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAccount(data.account);
        } else {
          setError(data.error || "Failed to load account");
        }
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleStatusChange(newStatus: string) {
    try {
      const res = await fetch(`/api/accounts/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        setAccount(data.account);
      } else {
        setError(data.error || "Failed to update status");
      }
    } catch {
      setError("Network error");
    }
  }

  async function handleHealthChange(newHealth: string) {
    try {
      const res = await fetch(`/api/accounts/${id}/health`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ healthStatus: newHealth }),
      });
      const data = await res.json();
      if (res.ok) {
        setAccount(data.account);
      } else {
        setError(data.error || "Failed to update health");
      }
    } catch {
      setError("Network error");
    }
  }

  if (loading) return <div className="p-8 max-w-4xl mx-auto"><p className="text-gray-500">Loading account...</p></div>;
  if (error) return <div className="p-8 max-w-4xl mx-auto"><p className="text-red-600">{error}</p><Link href="/admin/accounts" className="mt-4 inline-block px-4 py-2 bg-gray-300 rounded">Back</Link></div>;
  if (!account) return <div className="p-8 max-w-4xl mx-auto"><p>Account not found</p></div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">{account.accountNumber}</h1>
          <p className="text-gray-600">Account Details</p>
        </div>
        <Link href="/admin/accounts" className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Back</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <DetailCard label="Account Number" value={account.accountNumber} />
        <DetailCard label="Broker" value={account.broker ?? "—"} />
        <DetailCard label="Server" value={account.server ?? "—"} />
        <DetailCard label="Login" value={account.login ?? "—"} />
        <DetailCard label="Account Size" value={account.accountSize ? `${account.accountSize} ${account.currency}` : "—"} />
        <DetailCard label="Currency" value={account.currency} />
        <DetailCard label="Purpose" value={account.purpose ?? "—"} />
        <DetailCard label="Created" value={new Date(account.createdAt).toLocaleString()} />
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Status Management</h2>
        <div className="flex gap-3 flex-wrap">
          <StatusButton
            label="AVAILABLE"
            current={account.status}
            target="AVAILABLE"
            onSelect={handleStatusChange}
          />
          <StatusButton
            label="IN_USE"
            current={account.status}
            target="IN_USE"
            onSelect={handleStatusChange}
          />
          <StatusButton
            label="INACTIVE"
            current={account.status}
            target="INACTIVE"
            onSelect={handleStatusChange}
          />
          <StatusButton
            label="MAINTENANCE"
            current={account.status}
            target="MAINTENANCE"
            onSelect={handleStatusChange}
          />
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Health Status</h2>
        <div className="flex gap-3 flex-wrap">
          <HealthButton
            label="CONNECTED"
            current={account.healthStatus}
            target="CONNECTED"
            onSelect={handleHealthChange}
          />
          <HealthButton
            label="DISCONNECTED"
            current={account.healthStatus}
            target="DISCONNECTED"
            onSelect={handleHealthChange}
          />
          <HealthButton
            label="ERROR"
            current={account.healthStatus}
            target="ERROR"
            onSelect={handleHealthChange}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Last health check: {account.lastHealthCheck ? new Date(account.lastHealthCheck).toLocaleString() : "Never"}
        </p>
      </div>

      {account.notes && (
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h2 className="text-xl font-semibold mb-2">Notes</h2>
          <p className="text-gray-700">{account.notes}</p>
        </div>
      )}

      <div className="text-sm text-gray-500">
        Last updated: {new Date(account.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border rounded">
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function StatusButton({ label, current, target, onSelect }: { label: string; current: string; target: string; onSelect: (s: string) => void }) {
  const isActive = current === target;
  return (
    <button
      onClick={() => onSelect(target)}
      disabled={isActive}
      className={`px-3 py-1 rounded text-sm ${isActive ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
    >
      {label}
    </button>
  );
}

function HealthButton({ label, current, target, onSelect }: { label: string; current: string; target: string; onSelect: (s: string) => void }) {
  const isActive = current === target;
  const colors: Record<string, string> = {
    CONNECTED: "bg-green-200 text-green-800",
    DISCONNECTED: "bg-gray-200 text-gray-700",
    ERROR: "bg-red-200 text-red-800",
  };
  return (
    <button
      onClick={() => onSelect(target)}
      disabled={isActive}
      className={`px-3 py-1 rounded text-sm ${isActive ? colors[target] ?? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
    >
      {label}
    </button>
  );
}
