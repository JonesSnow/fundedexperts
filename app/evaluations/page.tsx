"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import TraderPageShell from "@/components/trader-page-shell";
import TraderLoadError from "@/components/trader-load-error";
import TraderStatusOverview from "@/components/trader-status-overview";
import { Badge, ButtonLink, Card, EmptyState, LoadingState, StatusBadge } from "@/components/ui";
import { formatAmount, formatDate } from "@/components/trader-format";

interface EvaluationRecord {
  id: string;
  rulesetName: string | null;
  rulesetVersion: string | null;
  productStage: { id: string; stageKey: string; displayName: string; stageOrder: number } | null;
  status: string;
  account: { accountNumber: string; broker: string | null; server: string | null; status: string; healthStatus: string } | null;
  startedAt: string;
  completedAt: string | null;
  totalPnl: number | null;
  maxDrawdown: number | null;
  ruleResults?: Array<{ ruleName: string; ruleType: string; state: string; result: string }>;
  rulePassedCount: number;
  ruleFailedCount: number;
  rulePendingCount?: number;
  ruleIncompleteCount?: number;
  ruleStaleCount?: number;
  ruleUnavailableCount?: number;
  ruleWarningCount: number;
}

interface EvaluationSummary {
  totalCount: number;
  statusCounts: Record<string, number>;
  largestDrawdown: number | null;
}

const EVALUATION_PAGE_SIZE = 50;

export default function EvaluationsPage() {
  const router = useRouter();
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [retryKey, setRetryKey] = useState(0);
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadEvaluations() {
      setLoading(true);
      setError("");
      setSignInRequired(false);
      setSummary(null);
      setNextCursor(null);
      setOlderError("");
      try {
        const response = await fetch(`/api/trader/evaluations?limit=${EVALUATION_PAGE_SIZE}`, { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setSignInRequired(true);
          throw new Error("Sign in to view your evaluations.");
        }
        if (
          !response.ok ||
          !data.success ||
          !Array.isArray(data.evaluations) ||
          !data.summary ||
          !Number.isSafeInteger(data.summary.totalCount) ||
          !data.summary.statusCounts ||
          typeof data.summary.statusCounts !== "object" ||
          Array.isArray(data.summary.statusCounts) ||
          !Object.values(data.summary.statusCounts).every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0) ||
          (data.summary.largestDrawdown !== null &&
            (typeof data.summary.largestDrawdown !== "number" || !Number.isFinite(data.summary.largestDrawdown))) ||
          (data.nextCursor !== null && typeof data.nextCursor !== "string")
        ) {
          throw new Error("Evaluation data is unavailable right now.");
        }
        setEvaluations(data.evaluations);
        setSummary(data.summary as EvaluationSummary);
        setNextCursor(data.nextCursor);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Evaluation data is unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadEvaluations();
    return () => controller.abort();
  }, [retryKey]);

  async function loadOlderEvaluations() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError("");
    try {
      const params = new URLSearchParams({ limit: String(EVALUATION_PAGE_SIZE), before: nextCursor });
      const response = await fetch(`/api/trader/evaluations?${params.toString()}`);
      const data = await response.json();
      if (
        !response.ok ||
        !data.success ||
        !Array.isArray(data.evaluations) ||
        (data.nextCursor !== null && typeof data.nextCursor !== "string")
      ) throw new Error("Older evaluations could not be loaded.");

      setEvaluations((current) => {
        const knownIds = new Set(current.map((evaluation) => evaluation.id));
        return [...current, ...(data.evaluations as EvaluationRecord[]).filter((evaluation) => !knownIds.has(evaluation.id))];
      });
      setNextCursor(data.nextCursor);
    } catch (cause) {
      setOlderError(cause instanceof Error ? cause.message : "Older evaluations could not be loaded.");
    } finally {
      setLoadingOlder(false);
    }
  }

  const statuses = useMemo(
    () => summary ? Object.keys(summary.statusCounts).sort() : [...new Set(evaluations.map((evaluation) => evaluation.status))].sort(),
    [evaluations, summary],
  );
  const visibleEvaluations = statusFilter === "ALL" ? evaluations : evaluations.filter((evaluation) => evaluation.status === statusFilter);

  return (
    <TraderPageShell
      currentPath="/evaluations"
      title="Evaluations"
      description="See recorded stages, objective checks, and the latest available evaluation outcomes."
      actions={<><ButtonLink href="/accounts" variant="outline">Trading accounts</ButtonLink><ButtonLink href="/dashboard" variant="outline">Dashboard</ButtonLink></>}
    >
      <TraderStatusOverview
        title="Evaluation status"
        total={summary?.totalCount ?? evaluations.length}
        statuses={statuses.map((status) => ({
          status,
          count: summary?.statusCounts[status] ?? evaluations.filter((evaluation) => evaluation.status === status).length,
        }))}
        loading={loading}
        unavailable={Boolean(error)}
      />
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? "Loading evaluations…" : `Showing ${visibleEvaluations.length} of ${summary?.totalCount ?? evaluations.length} evaluations`}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="evaluation-status-filter" className="text-sm font-medium text-foreground">
            Filter by status
            <select id="evaluation-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="ml-2 min-h-10 rounded-lg border border-input-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="ALL">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <TraderLoadError title="Evaluations could not be loaded" message={error} signInRequired={signInRequired} onRetry={() => setRetryKey((key) => key + 1)} />
      ) : loading ? (
        <LoadingState variant="skeleton" text="Loading your evaluations" />
      ) : evaluations.length === 0 ? (
        <EmptyState title="No evaluations yet" description="An evaluation will appear here after an eligible product is activated. Payment and activation remain subject to the actual order state." variant="card" action={{ label: "Browse products", onClick: () => router.push("/catalog") }} />
      ) : visibleEvaluations.length === 0 ? (
        <EmptyState title="No loaded evaluations match this status" description={nextCursor ? "Load older evaluations to include more of your history, or choose another status." : "Choose another status filter to see your evaluations."} variant="bordered" />
      ) : (
        <div className="space-y-4">
          {visibleEvaluations.map((evaluation) => (
            <Card key={evaluation.id} className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-card-foreground">{evaluation.rulesetName || "Evaluation"}{evaluation.rulesetVersion ? ` · v${evaluation.rulesetVersion}` : ""}</h2>
                    <StatusBadge status={evaluation.status} />
                    {evaluation.productStage && <Badge variant="outline">{evaluation.productStage.displayName} · Stage {evaluation.productStage.stageOrder}</Badge>}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">Evaluation {evaluation.id.slice(0, 8)}</p>
                </div>
                <Link href={`/evaluations/${evaluation.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Objectives and details <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Started" value={formatDate(evaluation.startedAt)} />
                <Metric label="Recorded P&L" value={evaluation.totalPnl === null ? "Unavailable" : `${formatAmount(evaluation.totalPnl) ?? "Unavailable"} · currency not supplied`} />
                <Metric label="Recorded drawdown" value={evaluation.maxDrawdown === null ? "Unavailable" : `${formatAmount(evaluation.maxDrawdown) ?? "Unavailable"} · currency not supplied`} />
                <Metric label="Objective checks" value={objectiveSummary(evaluation)} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">
                  {evaluation.account ? `Linked account ${evaluation.account.accountNumber}` : "No trading account is linked in this feed"}
                  {evaluation.completedAt ? ` · Completed ${formatDate(evaluation.completedAt)}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {evaluation.account && <Badge variant="outline" size="sm">{[evaluation.account.broker, evaluation.account.server].filter(Boolean).join(" · ") || "Broker details unavailable"}</Badge>}
                  {evaluation.account && <StatusBadge status={evaluation.account.healthStatus} size="sm" />}
                </div>
              </div>
              {evaluation.status === "IN_PROGRESS" && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />The feed provides objective outcomes, but not a verified target percentage. No completion percentage is estimated here.</p>}
            </Card>
          ))}
        </div>
      )}
      {nextCursor && !error && !loading && (
        <div className="mt-5 space-y-3">
          {olderError && <p className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-foreground" role="alert">{olderError}</p>}
          <button
            type="button"
            onClick={() => void loadOlderEvaluations()}
            disabled={loadingOlder}
            aria-busy={loadingOlder}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
          >
            {loadingOlder ? "Loading older evaluations…" : olderError ? "Try loading older evaluations again" : "Load older evaluations"}
          </button>
          <p className="text-xs text-muted-foreground">Status filters show matching evaluations from the history loaded so far.</p>
        </div>
      )}
    </TraderPageShell>
  );
}

function objectiveSummary(evaluation: EvaluationRecord): string {
  const parts = [
    evaluation.rulePassedCount > 0 && `${evaluation.rulePassedCount} passed`,
    evaluation.ruleFailedCount > 0 && `${evaluation.ruleFailedCount} failed`,
    evaluation.rulePendingCount ? `${evaluation.rulePendingCount} pending` : false,
    evaluation.ruleIncompleteCount ? `${evaluation.ruleIncompleteCount} incomplete` : false,
    evaluation.ruleStaleCount ? `${evaluation.ruleStaleCount} stale` : false,
    evaluation.ruleUnavailableCount ? `${evaluation.ruleUnavailableCount} unavailable` : false,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : evaluation.ruleWarningCount ? `${evaluation.ruleWarningCount} unresolved` : "No checks reported";
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/60 p-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p></div>;
}
