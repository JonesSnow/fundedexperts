'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

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
  credentialsConfigured: boolean;
}

export default function AdminAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [credentialLogin, setCredentialLogin] = useState("");
  const [credentialServer, setCredentialServer] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialFeedback, setCredentialFeedback] = useState<{ message: string; success: boolean } | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/accounts/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAccount(data.account);
          setCredentialLogin(data.account.login ?? "");
          setCredentialServer(data.account.server ?? "");
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
        setAccount((current) => current
          ? { ...current, ...data.account, credentialsConfigured: current.credentialsConfigured }
          : data.account);
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
        setAccount((current) => current
          ? { ...current, ...data.account, credentialsConfigured: current.credentialsConfigured }
          : data.account);
      } else {
        setError(data.error || "Failed to update health");
      }
    } catch {
      setError("Network error");
    }
  }

  async function handleSaveCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || !/^\d+$/.test(credentialLogin.trim()) || !credentialServer.trim() || credentialPassword.length === 0) {
      setCredentialFeedback({ message: "Enter a positive MT5 login, server, and password.", success: false });
      return;
    }
    const login = credentialLogin.trim();
    const server = credentialServer.trim();
    setCredentialBusy(true);
    setCredentialFeedback(null);
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login,
          server,
          credentials: JSON.stringify({ login, password: credentialPassword, server }),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.account) {
        throw new Error(data.errors?.credentials ?? data.error ?? "Failed to save MT5 credentials");
      }
      setAccount(data.account);
      setCredentialLogin(data.account.login ?? login);
      setCredentialServer(data.account.server ?? server);
      setCredentialFeedback({ message: "MT5 credentials encrypted and saved.", success: true });
    } catch (cause) {
      setCredentialFeedback({ message: cause instanceof Error ? cause.message : "Network error. Try again.", success: false });
    } finally {
      setCredentialPassword("");
      setCredentialBusy(false);
    }
  }

  if (loading) return <div className="p-8 max-w-4xl mx-auto"><p className="text-muted-foreground">Loading account...</p></div>;
  if (error) return <div className="p-8 max-w-4xl mx-auto"><p className="text-danger">{error}</p><Link href="/admin/accounts" className="mt-4 inline-block px-4 py-2 bg-muted rounded">Back</Link></div>;
  if (!account) return <div className="p-8 max-w-4xl mx-auto"><p>Account not found</p></div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">{account.accountNumber}</h1>
          <p className="text-muted-foreground">Account Details</p>
        </div>
        <Link href="/admin/accounts" className="px-4 py-2 bg-muted rounded hover:bg-muted">Back</Link>
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

      <section className="mb-6 rounded-lg border p-4" aria-labelledby="mt5-credentials-heading">
        <div className="mb-3">
          <h2 id="mt5-credentials-heading" className="text-xl font-semibold">MT5 Credentials</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The saved password is never displayed. {account.credentialsConfigured ? "Enter the broker details again to replace the stored credential bundle." : "Add a credential bundle before the monitoring runner can process this account."}
          </p>
        </div>
        {credentialFeedback && (
          <p className={"mb-3 text-sm " + (credentialFeedback.success ? "text-success" : "text-danger")} role={credentialFeedback.success ? "status" : "alert"}>
            {credentialFeedback.message}
          </p>
        )}
        <form onSubmit={handleSaveCredentials} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="credential-login" className="mb-1 block text-sm font-medium">MT5 Login</label>
            <input
              id="credential-login"
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              value={credentialLogin}
              onChange={(event) => setCredentialLogin(event.target.value)}
              required
              className="w-full rounded border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="credential-server" className="mb-1 block text-sm font-medium">MT5 Server</label>
            <input
              id="credential-server"
              type="text"
              value={credentialServer}
              onChange={(event) => setCredentialServer(event.target.value)}
              required
              className="w-full rounded border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="credential-password" className="mb-1 block text-sm font-medium">MT5 Password</label>
            <input
              id="credential-password"
              type="password"
              autoComplete="new-password"
              value={credentialPassword}
              onChange={(event) => setCredentialPassword(event.target.value)}
              required
              className="w-full rounded border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={credentialBusy}
              aria-busy={credentialBusy}
              className="min-h-10 rounded bg-primary px-4 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {credentialBusy ? "Saving securely..." : account.credentialsConfigured ? "Replace Credentials" : "Save Credentials"}
            </button>
          </div>
        </form>
      </section>

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
        <p className="text-sm text-muted-foreground mt-2">
          Last health check: {account.lastHealthCheck ? new Date(account.lastHealthCheck).toLocaleString() : "Never"}
        </p>
      </div>

      {account.notes && (
        <div className="mb-6 p-4 bg-background rounded">
          <h2 className="text-xl font-semibold mb-2">Notes</h2>
          <p className="text-muted-foreground">{account.notes}</p>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        Last updated: {new Date(account.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border rounded">
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
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
      className={`px-3 py-1 rounded text-sm ${isActive ? "bg-success-light text-success" : "bg-muted text-muted-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );
}

function HealthButton({ label, current, target, onSelect }: { label: string; current: string; target: string; onSelect: (s: string) => void }) {
  const isActive = current === target;
  const colors: Record<string, string> = {
    CONNECTED: "bg-success-light text-success",
    DISCONNECTED: "bg-muted text-muted-foreground",
    ERROR: "bg-danger-light text-danger",
  };
  return (
    <button
      onClick={() => onSelect(target)}
      disabled={isActive}
      className={`px-3 py-1 rounded text-sm ${isActive ? colors[target] ?? "bg-success-light text-success" : "bg-muted text-muted-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );
}
