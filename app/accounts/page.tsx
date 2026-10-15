"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";
import TraderPageShell from "@/components/trader-page-shell";
import TraderLoadError from "@/components/trader-load-error";
import TraderStatusOverview from "@/components/trader-status-overview";
import { Badge, ButtonLink, Card, EmptyState, LoadingState, StatusBadge } from "@/components/ui";
import { formatAmount, formatDate } from "@/components/trader-format";

interface AccountRecord {
  id: string;
  status: string;
  allocatedAt: string | null;
  activatedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  totalPnl: string | number | null;
  evaluation: { id: string; status: string; rulesetVersion?: { version: string; ruleset?: { name: string } } | null } | null;
  rulesetVersion?: { version: string } | null;
  account: {
    id: string;
    accountNumber: string;
    broker: string | null;
    server: string | null;
    status: string;
    healthStatus: string;
    accountSize: string | number | null;
    currency: string;
    lastMonitoringAt: string | null;
    currentMonitoringStatus?: string | null;
    currentMonitoringResult?: string | null;
  } | null;
}

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadAccounts() {
      setLoading(true);
      setError("");
      setSignInRequired(false);
      try {
        const response = await fetch("/api/trader/funded-accounts", { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setSignInRequired(true);
          throw new Error("Sign in to view your accounts.");
        }
        if (!response.ok || !data.success || !Array.isArray(data.accounts)) {
          throw new Error("Account data is unavailable right now.");
        }
        setAccounts(data.accounts);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Account data is unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadAccounts();
    return () => controller.abort();
  }, [retryKey]);

  const statuses = useMemo(() => [...new Set(accounts.map((account) => account.status))].sort(), [accounts]);
  const visibleAccounts = statusFilter === "ALL" ? accounts : accounts.filter((account) => account.status === statusFilter);

  return (
    <TraderPageShell
      currentPath="/accounts"
      title="Trading accounts"
      description="Review your account status and monitoring details."
      actions={<ButtonLink href="/dashboard" variant="outline">Back to dashboard</ButtonLink>}
    >
      <TraderStatusOverview
        title="Account status"
        total={accounts.length}
        statuses={statuses.map((status) => ({
          status,
          count: accounts.filter((account) => account.status === status).length,
        }))}
        loading={loading}
        unavailable={Boolean(error)}
      />
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? "Loading accounts…" : `${visibleAccounts.length} ${visibleAccounts.length === 1 ? "account" : "accounts"}`}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="account-status-filter" className="text-sm font-medium text-foreground">
            Filter by status
            <select
              id="account-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="ml-2 min-h-10 rounded-lg border border-input-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="ALL">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <TraderLoadError title="Accounts could not be loaded" message={error} signInRequired={signInRequired} onRetry={() => setRetryKey((key) => key + 1)} />
      ) : loading ? (
        <LoadingState variant="skeleton" text="Loading your accounts" />
      ) : accounts.length === 0 ? (
        <EmptyState title="No trading accounts yet" description="Allocated accounts will appear here when the account feed confirms them." variant="card" action={{ label: "Browse accounts", onClick: () => router.push("/catalog") }} />
      ) : visibleAccounts.length === 0 ? (
        <EmptyState title="No accounts match this status" description="Choose another status filter to see your accounts." variant="bordered" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleAccounts.map((account) => (
              <Card key={account.id} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trading account</p>
                    <h2 className="mt-1 break-all font-mono text-lg font-semibold text-card-foreground">{account.account?.accountNumber || "Allocation pending"}</h2>
                    {account.evaluation?.rulesetVersion?.ruleset?.name && <p className="mt-1 text-sm text-muted-foreground">{account.evaluation.rulesetVersion.ruleset.name}{account.evaluation.rulesetVersion.version ? ` · v${account.evaluation.rulesetVersion.version}` : ""}</p>}
                  </div>
                  <StatusBadge status={account.status} />
                </div>
                <div className="mt-5 grid gap-3 rounded-xl bg-muted/60 p-4 sm:grid-cols-2">
                  <Metric label="Recorded P&L" value={formatAmount(account.totalPnl, account.account?.currency) ?? "Unavailable"} />
                  <Metric label="Account size" value={formatAmount(account.account?.accountSize, account.account?.currency) ?? "Unavailable"} />
                  <Metric label="Broker and server" value={[account.account?.broker, account.account?.server].filter(Boolean).join(" · ") || "Unavailable"} />
                  <Metric label="Last monitoring update" value={formatDate(account.account?.lastMonitoringAt)} />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {account.account?.healthStatus && <StatusBadge status={account.account.healthStatus} size="sm" />}
                    {account.evaluation && <Badge variant="outline" size="sm">Evaluation {account.evaluation.status.replace(/_/g, " ")}</Badge>}
                  </div>
                  <Link href={`/accounts/${account.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Account details <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </TraderPageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p></div>;
}
