'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

export default function AdminAccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPurpose, setFilterPurpose] = useState("");
  const [filterBroker, setFilterBroker] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [authError, setAuthError] = useState(false);

  const fetchAccounts = useCallback(async (s = "", st = "", p = "", br = "") => {
    try {
      const params = new URLSearchParams();
      if (s) params.set("search", s);
      if (st) params.set("status", st);
      if (p) params.set("purpose", p);
      if (br) params.set("broker", br);
      const res = await fetch(`/api/accounts?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setAccounts(data.accounts ?? []);
        setError("");
      } else {
        setError(data.error || "Failed to load accounts");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOnMount = useRef(false);

  useEffect(() => {
    if (!fetchOnMount.current) {
      fetchOnMount.current = true;
      fetchAccounts();
    }
  }, [fetchAccounts]);

  async function handleSearch() {
    setLoading(true);
    await fetchAccounts(search, filterStatus, filterPurpose, filterBroker);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this account?")) return;
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 404) {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
      } else {
        setError("Failed to delete account");
      }
    } catch {
      setError("Network error");
    }
  }

  if (authError) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Access Denied</h1>
        <p className="text-red-600">You must be an administrator to access this page.</p>
        <Link href="/admin" className="mt-4 inline-block px-4 py-2 bg-gray-300 rounded">Back to Admin</Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Account Inventory</h1>
      <p className="text-gray-600 mb-6">Manage MT5 demo accounts.</p>
      {error && (
        <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded">{error}</div>
      )}

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search account number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border rounded w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="IN_USE">IN_USE</option>
          <option value="INACTIVE">INACTIVE</option>
          <option value="MAINTENANCE">MAINTENANCE</option>
        </select>
        <select
          value={filterPurpose}
          onChange={(e) => setFilterPurpose(e.target.value)}
          className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Purposes</option>
          <option value="EVALUATION">EVALUATION</option>
          <option value="FUNDED">FUNDED</option>
          <option value="OTHER">OTHER</option>
        </select>
        <input
          type="text"
          placeholder="Filter broker"
          value={filterBroker}
          onChange={(e) => setFilterBroker(e.target.value)}
          className="px-3 py-2 border rounded w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Search
        </button>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          {showAddForm ? "Cancel" : "Add Account"}
        </button>
      </div>

      {showAddForm && (
        <AddAccountForm onCreated={() => { setShowAddForm(false); fetchAccounts(); }} />
      )}

      {loading ? (
        <p className="text-gray-500">Loading accounts...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left border">Account #</th>
                <th className="px-4 py-2 text-left border">Broker</th>
                <th className="px-4 py-2 text-left border">Server</th>
                <th className="px-4 py-2 text-left border">Size</th>
                <th className="px-4 py-2 text-left border">Purpose</th>
                <th className="px-4 py-2 text-left border">Status</th>
                <th className="px-4 py-2 text-left border">Health</th>
                <th className="px-4 py-2 text-left border">Created</th>
                <th className="px-4 py-2 text-left border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-center text-gray-500">No accounts found</td>
                </tr>
              )}
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 border font-mono">{acc.accountNumber}</td>
                  <td className="px-4 py-2 border">{acc.broker ?? "—"}</td>
                  <td className="px-4 py-2 border">{acc.server ?? "—"}</td>
                  <td className="px-4 py-2 border">{acc.accountSize ? `${acc.accountSize} ${acc.currency}` : "—"}</td>
                  <td className="px-4 py-2 border">{acc.purpose ?? "—"}</td>
                  <td className="px-4 py-2 border">
                    <StatusBadge status={acc.status} />
                  </td>
                  <td className="px-4 py-2 border">
                    <HealthBadge status={acc.healthStatus} />
                  </td>
                  <td className="px-4 py-2 border text-sm text-gray-500">
                    {new Date(acc.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 border">
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/accounts/${acc.id}`}
                        className="px-2 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleDelete(acc.id)}
                        className="px-2 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    AVAILABLE: "bg-green-100 text-green-700",
    IN_USE: "bg-blue-100 text-blue-700",
    INACTIVE: "bg-gray-100 text-gray-700",
    MAINTENANCE: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function HealthBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    CONNECTED: "bg-green-100 text-green-700",
    DISCONNECTED: "bg-gray-100 text-gray-700",
    ERROR: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function AddAccountForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    accountNumber: "",
    broker: "",
    server: "",
    login: "",
    accountSize: "",
    currency: "USD",
    purpose: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSubmitError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          accountSize: form.accountSize ? parseFloat(form.accountSize) : undefined,
          purpose: form.purpose || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated();
      } else {
        if (data.errors) {
          setErrors(data.errors);
        } else {
          setSubmitError(data.error || "Failed to create account");
        }
      }
    } catch {
      setSubmitError("Network error");
    }
    setSubmitting(false);
  }

  return (
    <div className="mb-6 p-4 border rounded bg-gray-50">
      <h2 className="text-xl font-semibold mb-4">Add Account</h2>
      {submitError && (
        <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded">{submitError}</div>
      )}
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Account Number *</label>
          <input
            type="text"
            value={form.accountNumber}
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            required
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.accountNumber && <p className="text-xs text-red-600 mt-1">{errors.accountNumber}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Broker</label>
          <input
            type="text"
            value={form.broker}
            onChange={(e) => setForm({ ...form, broker: e.target.value })}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Server</label>
          <input
            type="text"
            value={form.server}
            onChange={(e) => setForm({ ...form, server: e.target.value })}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Login</label>
          <input
            type="text"
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value })}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Account Size</label>
          <input
            type="number"
            step="0.01"
            value={form.accountSize}
            onChange={(e) => setForm({ ...form, accountSize: e.target.value })}
            placeholder="0.00"
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Currency</label>
          <input
            type="text"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Purpose</label>
          <select
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">None</option>
            <option value="EVALUATION">EVALUATION</option>
            <option value="FUNDED">FUNDED</option>
            <option value="OTHER">OTHER</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="col-span-2 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 w-fit"
        >
          {submitting ? "Creating..." : "Create Account"}
        </button>
      </form>
    </div>
  );
}
