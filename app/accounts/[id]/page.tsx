"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, CircleHelp, ShieldCheck } from "lucide-react";
import TraderPageShell from "@/components/trader-page-shell";
import TraderLoadError from "@/components/trader-load-error";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, LoadingState, StatusBadge } from "@/components/ui";
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
  account: {
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

export default function AccountDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadAccount() {
      setLoading(true);
      setError("");
      setSignInRequired(false);
      try {
        const response = await fetch("/api/trader/funded-accounts", { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setSignInRequired(true);
          throw new Error("Sign in to view account details.");
        }
        if (!response.ok || !data.success || !Array.isArray(data.accounts)) {
          throw new Error("Account details are unavailable right now.");
        }
        setAccount(data.accounts.find((candidate: AccountRecord) => candidate.id === id) ?? null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Account details are unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadAccount();
    return () => controller.abort();
  }, [id, retryKey]);

  return (
    <TraderPageShell
      currentPath="/accounts"
      title="Account details"
      description="Current account information from the trader account feed."
      actions={<Link href="/accounts" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All accounts</Link>}
    >
      {error ? (
        <TraderLoadError title="Account details unavailable" message={error} signInRequired={signInRequired} onRetry={() => setRetryKey((key) => key + 1)} />
      ) : loading ? (
        <LoadingState variant="skeleton" text="Loading account details" />
      ) : !account ? (
        <EmptyState title="Account not found" description="This account is not available in your account list." variant="card" action={{ label: "View accounts", onClick: () => router.push("/accounts") }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="font-mono">{account.account?.accountNumber || "Allocation pending"}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{[account.account?.broker, account.account?.server].filter(Boolean).join(" · ") || "Broker details unavailable"}</p>
              </div>
              <StatusBadge status={account.status} />
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Account size" value={formatAmount(account.account?.accountSize, account.account?.currency) ?? "Unavailable"} />
                <Detail label="Recorded P&L" value={formatAmount(account.totalPnl, account.account?.currency) ?? "Unavailable"} />
                <Detail label="Platform status" value={account.account?.status.replace(/_/g, " ") || "Unavailable"} />
                <Detail label="Monitoring health" value={account.account?.healthStatus.replace(/_/g, " ") || "Unavailable"} />
              </div>
              {account.account?.currentMonitoringStatus && (
                <div className="mt-5 rounded-xl border border-border bg-muted/50 p-4">
                  <p className="text-sm font-semibold text-foreground">Latest monitoring state</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge status={account.account.currentMonitoringStatus} size="sm" />
                    {account.account.currentMonitoringResult && <Badge variant="outline" size="sm">{account.account.currentMonitoringResult.replace(/_/g, " ")}</Badge>}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Updated {formatDate(account.account.lastMonitoringAt)}</p>
                </div>
              )}
              {!account.account && <div className="mt-5 flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4" role="status"><CircleHelp className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" /><p className="text-sm leading-6 text-muted-foreground">No trading account is linked to this record yet. Platform balance and equity are unavailable.</p></div>}
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />Account timeline</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Detail label="Created" value={formatDate(account.createdAt)} />
                <Detail label="Allocated" value={formatDate(account.allocatedAt)} />
                <Detail label="Activated" value={formatDate(account.activatedAt)} />
                <Detail label="Closed" value={formatDate(account.closedAt)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />Linked evaluation</CardTitle></CardHeader>
              <CardContent>
                {account.evaluation ? <div><p className="font-medium text-foreground">{account.evaluation.rulesetVersion?.ruleset?.name || "Evaluation"}</p><p className="mt-1 text-sm text-muted-foreground">Status: {account.evaluation.status.replace(/_/g, " ")}</p><Link href={`/evaluations/${account.evaluation.id}`} className="mt-3 inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View evaluation</Link></div> : <p className="text-sm text-muted-foreground">No evaluation is linked in the available account feed.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </TraderPageShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border px-3 py-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p></div>;
}
