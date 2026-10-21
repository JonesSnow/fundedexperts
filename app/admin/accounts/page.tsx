'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

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

const ACCOUNT_PAGE_SIZE = 50;

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPurpose, setFilterPurpose] = useState("");
  const [filterBroker, setFilterBroker] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ search: "", status: "", purpose: "", broker: "" });
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchAccounts = useCallback(async (s = "", st = "", p = "", br = "", before?: string, append = false) => {
    try {
      const params = new URLSearchParams();
      params.set("limit", String(ACCOUNT_PAGE_SIZE));
      if (s) params.set("search", s);
      if (st) params.set("status", st);
      if (p) params.set("purpose", p);
      if (br) params.set("broker", br);
      if (before) params.set("before", before);
      const res = await fetch(`/api/accounts?${params.toString()}`);
      const data = await res.json();
      if (
        res.ok &&
        Array.isArray(data.accounts) &&
        Number.isSafeInteger(data.totalCount) &&
        (data.nextCursor === null || typeof data.nextCursor === "string")
      ) {
        setAuthError(false);
        if (append) {
          setAccounts((current) => {
            const knownIds = new Set(current.map((account) => account.id));
            return [...current, ...(data.accounts as Account[]).filter((account) => !knownIds.has(account.id))];
          });
          setOlderError("");
        } else {
          setAccounts(data.accounts);
          setOlderError("");
        }
        setTotalCount(data.totalCount);
        setNextCursor(data.nextCursor);
        setError("");
      } else {
        setAuthError(res.status === 401 || res.status === 403);
        if (append) setOlderError(data.error || "Older accounts could not be loaded.");
        else setError(data.error || "Failed to load accounts");
      }
    } catch {
      if (append) setOlderError("Network error while loading older accounts.");
      else setError("Network error");
    } finally {
      setLoading(false);
      setLoadingOlder(false);
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
    setNextCursor(null);
    setOlderError("");
    setAppliedFilters({ search, status: filterStatus, purpose: filterPurpose, broker: filterBroker });
    await fetchAccounts(search, filterStatus, filterPurpose, filterBroker);
  }

  async function handleLoadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    await fetchAccounts(
      appliedFilters.search,
      appliedFilters.status,
      appliedFilters.purpose,
      appliedFilters.broker,
      nextCursor,
      true,
    );
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this account?")) return;
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 404) {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
        setTotalCount((count) => Math.max(0, count - 1));
      } else {
        setError("Failed to delete account");
      }
    } catch {
      setError("Network error");
    }
  }

  if (authError) {
    return (
      <div className="w-full min-w-0 p-4 sm:p-8 max-w-6xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">Access Denied</h1>
        <p className="text-danger">You must be an administrator to access this page.</p>
        <Link href="/admin" className="mt-4 inline-block px-4 py-2 bg-muted rounded">Back to Admin</Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 p-4 sm:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">Account Inventory</h1>
      <p className="text-muted-foreground mb-6">Manage MT5 demo accounts.</p>
      {error && (
        <div className="mb-4 p-3 text-sm text-danger bg-danger-light rounded">{error}</div>
      )}

      <div className="w-full min-w-0 flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search account number"
          aria-label="Search account number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full min-w-0 px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-48"
        />
        <select
          aria-label="Filter accounts by status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="w-full min-w-0 max-w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
        >
          <option value="">All Statuses</option>
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="IN_USE">IN_USE</option>
          <option value="INACTIVE">INACTIVE</option>
          <option value="MAINTENANCE">MAINTENANCE</option>
        </select>
        <select
          aria-label="Filter accounts by purpose"
          value={filterPurpose}
          onChange={(e) => setFilterPurpose(e.target.value)}
          className="w-full min-w-0 max-w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
        >
          <option value="">All Purposes</option>
          <option value="EVALUATION">EVALUATION</option>
          <option value="FUNDED">FUNDED</option>
          <option value="OTHER">OTHER</option>
        </select>
        <input
          type="text"
          placeholder="Filter broker"
          aria-label="Filter by broker"
          value={filterBroker}
          onChange={(e) => setFilterBroker(e.target.value)}
          className="w-full min-w-0 px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
        />
        <button
          type="button"
          onClick={handleSearch}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary"
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-success text-primary-foreground rounded hover:bg-success-hover"
        >
          {showAddForm ? "Cancel" : "Add Account"}
        </button>
      </div>

      {showAddForm && (
        <AddAccountForm onCreated={() => {
          setShowAddForm(false);
          setLoading(true);
          const filters = { search, status: filterStatus, purpose: filterPurpose, broker: filterBroker };
          setAppliedFilters(filters);
          fetchAccounts(filters.search, filters.status, filters.purpose, filters.broker);
        }} />
      )}

      {loading ? (
        <p className="text-muted-foreground" role="status" aria-live="polite">Loading accounts...</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground" role="status" aria-live="polite">
            Showing {accounts.length} of {totalCount} accounts
          </p>
          <div className="w-full min-w-0 max-w-full overflow-x-auto" role="region" aria-label="Account inventory table" tabIndex={0}>
            <table className="min-w-full bg-card border">
              <thead>
                <tr className="bg-muted">
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
                    <td colSpan={9} className="px-4 py-4 text-center text-muted-foreground">No accounts found</td>
                  </tr>
                )}
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-background">
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
                    <td className="px-4 py-2 border text-sm text-muted-foreground">
                      {new Date(acc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 border">
                      <div className="flex gap-2">
                        <Link
                          href={`/admin/accounts/${acc.id}`}
                          className="rounded bg-info-light px-2 py-1 text-sm text-info hover:bg-info/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleDelete(acc.id)}
                          className="rounded bg-danger-light px-2 py-1 text-sm text-danger hover:bg-danger/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          {nextCursor && (
            <div className="mt-4 space-y-2">
              {olderError && <p className="text-sm text-danger" role="alert">{olderError}</p>}
              <button
                type="button"
                onClick={() => void handleLoadOlder()}
                disabled={loadingOlder}
                aria-busy={loadingOlder}
                className="min-h-10 rounded border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {loadingOlder ? "Loading older accounts..." : olderError ? "Try again" : "Load older accounts"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    AVAILABLE: "bg-success-light text-success",
    IN_USE: "bg-info-light text-info",
    INACTIVE: "bg-muted text-muted-foreground",
    MAINTENANCE: "bg-warning-light text-warning",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function HealthBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    CONNECTED: "bg-success-light text-success",
    DISCONNECTED: "bg-muted text-muted-foreground",
    ERROR: "bg-danger-light text-danger",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-muted text-muted-foreground"}`}>
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
    mt5Password: "",
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
      const { mt5Password, ...accountFields } = form;
      const login = form.login.trim();
      const server = form.server.trim();
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...accountFields,
          login,
          server,
          credentials: JSON.stringify({ login, password: mt5Password, server }),
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
    <div className="mb-6 p-4 border rounded bg-background">
      <h2 className="text-xl font-semibold mb-4">Add Account</h2>
      {submitError && (
        <div className="mb-4 p-3 text-sm text-danger bg-danger-light rounded">{submitError}</div>
      )}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1">Account Number *</label>
          <input
            type="text"
            value={form.accountNumber}
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            required
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {errors.accountNumber && <p className="text-xs text-danger mt-1">{errors.accountNumber}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Broker</label>
          <input
            type="text"
            value={form.broker}
            onChange={(e) => setForm({ ...form, broker: e.target.value })}
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="mt5-server" className="block text-sm font-medium mb-1">MT5 Server *</label>
          <input
            id="mt5-server"
            type="text"
            value={form.server}
            onChange={(e) => setForm({ ...form, server: e.target.value })}
            required
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {errors.server && <p className="text-xs text-danger mt-1" role="alert">{errors.server}</p>}
        </div>
        <div>
          <label htmlFor="mt5-login" className="block text-sm font-medium mb-1">MT5 Login *</label>
          <input
            id="mt5-login"
            type="text"
            inputMode="numeric"
            pattern="[0-9]+"
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value })}
            required
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {errors.login && <p className="text-xs text-danger mt-1" role="alert">{errors.login}</p>}
        </div>
        <div>
          <label htmlFor="mt5-password" className="block text-sm font-medium mb-1">MT5 Password *</label>
          <input
            id="mt5-password"
            type="password"
            autoComplete="new-password"
            value={form.mt5Password}
            onChange={(e) => setForm({ ...form, mt5Password: e.target.value })}
            required
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {errors.credentials && <p className="text-xs text-danger mt-1" role="alert">{errors.credentials}</p>}
          {!errors.credentials && <p className="mt-1 text-xs text-muted-foreground">Encrypted before storage. The password is never returned by the API.</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Account Size</label>
          <input
            type="number"
            step="0.01"
            value={form.accountSize}
            onChange={(e) => setForm({ ...form, accountSize: e.target.value })}
            placeholder="0.00"
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Currency</label>
          <input
            type="text"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Purpose</label>
          <select
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="col-span-2 px-6 py-2 bg-primary text-primary-foreground rounded hover:bg-primary disabled:opacity-50 w-fit"
        >
          {submitting ? "Creating..." : "Create Account"}
        </button>
      </form>
    </div>
  );
}
