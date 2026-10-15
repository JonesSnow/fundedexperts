"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CircleHelp } from "lucide-react";
import TraderPageShell from "@/components/trader-page-shell";
import TraderLoadError from "@/components/trader-load-error";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, LoadingState, StatusBadge } from "@/components/ui";
import { formatAmount, formatDate } from "@/components/trader-format";

interface RuleRecord {
  ruleName: string;
  ruleType: string;
  state?: string;
  result: string;
  expectedValue?: unknown;
  actualValue?: unknown;
  ruleValue?: unknown;
  details?: string | null;
  evaluationTimestamp?: string;
  sourceDataTimestamp?: string | null;
  requiredFollowUp?: string | null;
  calculationMethod?: string | null;
}

interface EvaluationRecord {
  id: string;
  rulesetName: string | null;
  rulesetVersion: string | null;
  status: string;
  account: { accountNumber: string; broker: string | null; server: string | null; status: string; healthStatus: string } | null;
  startedAt: string;
  completedAt: string | null;
  totalPnl: number | null;
  maxDrawdown: number | null;
  startingBalance?: number | null;
  ruleResults?: RuleRecord[];
  rulePassedCount: number;
  ruleFailedCount: number;
  rulePendingCount?: number;
  ruleIncompleteCount?: number;
  ruleStaleCount?: number;
  ruleUnavailableCount?: number;
  ruleWarningCount: number;
}

export default function EvaluationDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [evaluation, setEvaluation] = useState<EvaluationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadEvaluation() {
      setLoading(true);
      setError("");
      setSignInRequired(false);
      try {
        const response = await fetch("/api/trader/evaluations", { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setSignInRequired(true);
          throw new Error("Sign in to view this evaluation.");
        }
        if (!response.ok || !data.success || !Array.isArray(data.evaluations)) throw new Error("Evaluation details are unavailable right now.");
        setEvaluation(data.evaluations.find((candidate: EvaluationRecord) => candidate.id === id) ?? null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Evaluation details are unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadEvaluation();
    return () => controller.abort();
  }, [id, retryKey]);

  return (
    <TraderPageShell currentPath="/evaluations" title="Evaluation objectives" description="Recorded outcomes from the evaluation feed. Results marked pending, stale, or unavailable are not final pass/fail decisions." actions={<Link href="/evaluations" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All evaluations</Link>}>
      {error ? (
        <TraderLoadError title="Evaluation details unavailable" message={error} signInRequired={signInRequired} onRetry={() => setRetryKey((key) => key + 1)} />
      ) : loading ? (
        <LoadingState variant="skeleton" text="Loading evaluation objectives" />
      ) : !evaluation ? (
        <EmptyState title="Evaluation not found" description="This evaluation is not available in your evaluation list." variant="card" action={{ label: "View evaluations", onClick: () => router.push("/evaluations") }} />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div><CardTitle>{evaluation.rulesetName || "Evaluation"}{evaluation.rulesetVersion ? ` · v${evaluation.rulesetVersion}` : ""}</CardTitle><p className="mt-1 font-mono text-xs text-muted-foreground">Evaluation {evaluation.id.slice(0, 8)}</p></div>
              <StatusBadge status={evaluation.status} />
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Started" value={formatDate(evaluation.startedAt)} />
                <Metric label="Completed" value={formatDate(evaluation.completedAt)} />
                <Metric label="Recorded P&L" value={evaluation.totalPnl === null ? "Unavailable" : `${formatAmount(evaluation.totalPnl) ?? "Unavailable"} · currency not supplied`} />
                <Metric label="Recorded drawdown" value={evaluation.maxDrawdown === null ? "Unavailable" : `${formatAmount(evaluation.maxDrawdown) ?? "Unavailable"} · currency not supplied`} />
              </div>
              <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Objective check summary</h3>
                  {evaluation.account ? <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">Account {evaluation.account.accountNumber}</span><StatusBadge status={evaluation.account.healthStatus} size="sm" /></div> : <Link href="/accounts" className="text-sm font-semibold text-primary hover:underline">View accounts</Link>}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <CheckCount label="Passed" count={evaluation.rulePassedCount} tone="success" />
                  <CheckCount label="Failed" count={evaluation.ruleFailedCount} tone="danger" />
                  <CheckCount label="Unresolved" count={evaluation.ruleWarningCount} tone="warning" />
                  <CheckCount label="Pending" count={evaluation.rulePendingCount} />
                  <CheckCount label="Incomplete" count={evaluation.ruleIncompleteCount} />
                  <CheckCount label="Stale / unavailable" count={(evaluation.ruleStaleCount ?? 0) + (evaluation.ruleUnavailableCount ?? 0)} reported={evaluation.ruleStaleCount !== undefined || evaluation.ruleUnavailableCount !== undefined} />
                </dl>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Objectives and rule checks</CardTitle><p className="mt-1 text-sm text-muted-foreground">Limits and actual values appear only when the API supplied them. No progress percentage is estimated.</p></CardHeader>
            <CardContent>
              {(evaluation.ruleResults ?? []).length === 0 ? (
                <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4" role="status"><CircleHelp className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" /><p className="text-sm text-muted-foreground">No rule outcomes are available for this evaluation yet.</p></div>
              ) : (
                <ul className="divide-y divide-border">
                  {evaluation.ruleResults?.map((rule, index) => (
                    <li key={`${rule.ruleType}-${rule.ruleName}-${index}`} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-foreground">{rule.ruleName || rule.ruleType.replace(/_/g, " ")}</h3><Badge variant="outline" size="sm">{rule.ruleType.replace(/_/g, " ")}</Badge></div>
                        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                          <p className="text-muted-foreground">Limit / expected: <span className="font-medium text-foreground">{displayValue(rule.expectedValue ?? rule.ruleValue)}</span></p>
                          <p className="text-muted-foreground">Actual: <span className="font-medium text-foreground">{displayValue(rule.actualValue)}</span></p>
                        </div>
                        {rule.calculationMethod && <p className="mt-2 text-xs text-muted-foreground">Calculation method: {rule.calculationMethod}</p>}
                        {rule.details && <p className="mt-2 text-sm leading-6 text-muted-foreground">{rule.details}</p>}
                        {rule.requiredFollowUp && <p className="mt-2 text-sm leading-6 text-muted-foreground">Next step: {rule.requiredFollowUp}</p>}
                        {(rule.sourceDataTimestamp || rule.evaluationTimestamp) && <p className="mt-2 text-xs text-muted-foreground">{rule.sourceDataTimestamp ? `Data as of ${formatDate(rule.sourceDataTimestamp)}` : "Source data time unavailable"}{rule.evaluationTimestamp ? ` · Checked ${formatDate(rule.evaluationTimestamp)}` : ""}</p>}
                      </div>
                      <StatusBadge status={rule.state || rule.result} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-3"><Link href="/dashboard" className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted">Back to dashboard</Link><Link href="/accounts" className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted">Trading accounts</Link></div>
        </div>
      )}
    </TraderPageShell>
  );
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return "Unavailable";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return "Unavailable"; }
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/60 p-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p></div>;
}

function CheckCount({
  label,
  count,
  tone = "default",
  reported = count !== undefined,
}: {
  label: string;
  count: number | undefined;
  tone?: "default" | "success" | "danger" | "warning";
  reported?: boolean;
}) {
  const numberColor = {
    default: "text-foreground",
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
  }[tone];
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${numberColor}`}>{reported ? count : "—"}</dd>
    </div>
  );
}
