"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/header";
import NotificationsPanel from "@/components/notifications-panel";
import TraderWorkspaceNav from "@/components/trader-workspace-nav";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  CircleHelp,
  Clock3,
  ListOrdered,
  ShieldCheck,
  Wallet,
} from "lucide-react";

interface Trader {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
}

interface SessionData {
  authenticated: boolean;
  trader: Trader | null;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  totalAmount: number | string;
  createdAt: string;
}

interface EvaluationRule {
  ruleName: string;
  ruleType: string;
  result: string;
  state?: "PASS" | "FAIL" | "INCOMPLETE" | "PENDING" | "STALE" | "UNAVAILABLE";
  calculationMethod?: string | null;
  details?: string | null;
  expectedValue?: unknown;
  actualValue?: unknown;
  ruleValue?: unknown;
  evaluationId?: string;
  rulesetVersionId?: string;
  evaluationTimestamp?: string;
  sourceDataTimestamp?: string | null;
  provisional?: boolean;
  requiredFollowUp?: string | null;
}

interface Evaluation {
  id: string;
  rulesetName: string | null;
  rulesetVersion: string | null;
  status: string;
  account: {
    accountNumber: string;
    broker: string | null;
    server: string | null;
    status: string;
    healthStatus: string;
  } | null;
  startedAt: string;
  completedAt: string | null;
  totalPnl: number | null;
  maxDrawdown: number | null;
  startingBalance?: number | null;
  ruleResults?: EvaluationRule[];
  rulePassedCount: number;
  ruleFailedCount: number;
  rulePendingCount?: number;
  ruleIncompleteCount?: number;
  ruleStaleCount?: number;
  ruleUnavailableCount?: number;
  ruleWarningCount: number;
}

interface FundedAccount {
  id: string;
  status: string;
  allocatedAt: string | null;
  activatedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  totalPnl: number | string | null;
  account: {
    accountNumber: string;
    broker?: string | null;
    server?: string | null;
    status: string;
    healthStatus?: string;
    accountSize?: number | string | null;
    currency?: string;
    lastMonitoringAt?: string | null;
  } | null;
}

type LoadStatus = "idle" | "loading";
type MetricTone = "default" | "positive" | "negative" | "unavailable";

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number, currency?: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      ...(currency ? { style: "currency", currency } : {}),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  }
}

function formatNumericValue(value: unknown, currency?: string) {
  const number = toFiniteNumber(value);
  return number === null ? null : formatNumber(number, currency);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatRuleValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function ruleBadgeVariant(result: string): "success" | "warning" | "danger" | "default" {
  if (result === "PASS") return "success";
  if (result === "WARNING" || result === "INCOMPLETE" || result === "PENDING" || result === "STALE" || result === "UNAVAILABLE" || result === "UNDER_REVIEW") return "warning";
  if (result === "FAIL") return "danger";
  return "default";
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: MetricTone;
}) {
  const valueColor =
    tone === "positive"
      ? "text-success"
      : tone === "negative"
        ? "text-danger"
        : tone === "unavailable"
          ? "text-muted-foreground"
          : "text-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className={`mt-3 text-2xl font-semibold tracking-tight sm:text-3xl ${valueColor}`}>
            {value}
          </p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<LoadStatus>("idle");
  const [ordersError, setOrdersError] = useState("");
  const [fundedAccounts, setFundedAccounts] = useState<FundedAccount[]>([]);
  const [fundedAccountsLoading, setFundedAccountsLoading] = useState<LoadStatus>("idle");
  const [fundedAccountsError, setFundedAccountsError] = useState("");
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [evaluationsLoading, setEvaluationsLoading] = useState<LoadStatus>("idle");
  const [evaluationsError, setEvaluationsError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setSessionLoading(true);
      setSessionError("");
      try {
        const response = await fetch("/api/auth/session");
        if (!response.ok) throw new Error("Unable to verify your session.");
        const data = (await response.json()) as SessionData;
        if (!cancelled) setSessionData(data);
      } catch {
        if (!cancelled) setSessionError("Unable to verify your session. Please try again.");
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!sessionData?.authenticated || !sessionData.trader) return;
    let cancelled = false;

    const evaluationUrl =
      sessionData.trader.role === "TRADER" ? "/api/trader/evaluations" : "/api/evaluations";
    const fundedAccountsUrl =
      sessionData.trader.role === "TRADER"
        ? "/api/trader/funded-accounts"
        : "/api/funded-accounts";

    async function loadOrders() {
      setOrdersLoading("loading");
      setOrdersError("");
      try {
        const response = await fetch("/api/orders");
        const body = (await response.json()) as { success?: boolean; orders?: Order[]; error?: string };
        if (!response.ok || !body.success || !Array.isArray(body.orders)) {
          throw new Error(body.error || "Failed to load recent orders.");
        }
        if (!cancelled) setOrders(body.orders);
      } catch (error) {
        if (!cancelled) {
          setOrdersError(error instanceof Error ? error.message : "Failed to load recent orders.");
        }
      } finally {
        if (!cancelled) setOrdersLoading("idle");
      }
    }

    async function loadEvaluations() {
      setEvaluationsLoading("loading");
      setEvaluationsError("");
      try {
        const response = await fetch(evaluationUrl);
        const body = (await response.json()) as { success?: boolean; evaluations?: Evaluation[]; error?: string };
        if (!response.ok || !body.success || !Array.isArray(body.evaluations)) {
          throw new Error(body.error || "Failed to load evaluations.");
        }
        if (!cancelled) setEvaluations(body.evaluations);
      } catch (error) {
        if (!cancelled) {
          setEvaluationsError(error instanceof Error ? error.message : "Failed to load evaluations.");
        }
      } finally {
        if (!cancelled) setEvaluationsLoading("idle");
      }
    }

    async function loadFundedAccounts() {
      setFundedAccountsLoading("loading");
      setFundedAccountsError("");
      try {
        const response = await fetch(fundedAccountsUrl);
        const body = (await response.json()) as { success?: boolean; accounts?: FundedAccount[]; error?: string };
        if (!response.ok || !body.success || !Array.isArray(body.accounts)) {
          throw new Error(body.error || "Failed to load funded accounts.");
        }
        if (!cancelled) setFundedAccounts(body.accounts);
      } catch (error) {
        if (!cancelled) {
          setFundedAccountsError(error instanceof Error ? error.message : "Failed to load funded accounts.");
        }
      } finally {
        if (!cancelled) setFundedAccountsLoading("idle");
      }
    }

    void Promise.all([loadOrders(), loadEvaluations(), loadFundedAccounts()]);
    return () => {
      cancelled = true;
    };
  }, [sessionData, refreshKey]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header currentPath="/dashboard" />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
          <LoadingState variant="spinner" text="Loading dashboard..." size="lg" />
        </main>
      </div>
    );
  }

  if (!sessionData?.authenticated || !sessionData.trader) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header currentPath="/dashboard" />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
          {sessionError ? (
            <div className="rounded-2xl border border-danger/20 bg-card p-6 text-center shadow-sm" role="alert">
              <AlertCircle className="mx-auto h-8 w-8 text-danger" aria-hidden="true" />
              <h1 className="mt-3 text-lg font-semibold text-foreground">Session check unavailable</h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{sessionError}</p>
              <button
                type="button"
                onClick={() => setRefreshKey((key) => key + 1)}
                className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Try again
              </button>
            </div>
          ) : (
            <EmptyState
              title="Sign in required"
              description="You must be logged in to access your dashboard."
              variant="card"
              action={{
                label: "Go to sign in",
                onClick: () => router.push("/login"),
              }}
            />
          )}
        </main>
      </div>
    );
  }

  const trader = sessionData.trader;
  const displayName =
    `${trader.firstName ?? ""} ${trader.lastName ?? ""}`.trim() || trader.email;
  const activeEvaluations = evaluations.filter((evaluation) => evaluation.status === "IN_PROGRESS");
  const pendingOrders = orders.filter((order) => order.status === "PENDING_PAYMENT");
  const pnlAccounts = fundedAccounts
    .filter((account) => account.status === "ACTIVE")
    .map((account) => ({ account, totalPnl: toFiniteNumber(account.totalPnl) }))
    .filter((account): account is { account: FundedAccount; totalPnl: number } => account.totalPnl !== null);
  const pnlCurrencies = pnlAccounts.map((item) => item.account.account?.currency);
  const pnlCurrency =
    pnlCurrencies.length > 0 &&
    pnlCurrencies.every((currency) => Boolean(currency) && currency === pnlCurrencies[0])
      ? pnlCurrencies[0]
      : undefined;
  const fundedPnl =
    pnlAccounts.length > 0 && pnlCurrency
      ? pnlAccounts.reduce((sum, account) => sum + account.totalPnl, 0)
      : null;
  const drawdowns = (trader.role === "TRADER" ? evaluations : [])
    .filter(
      (evaluation): evaluation is Evaluation & { maxDrawdown: number } =>
        typeof evaluation.maxDrawdown === "number" && Number.isFinite(evaluation.maxDrawdown),
    )
    .map((evaluation) => evaluation.maxDrawdown);
  const largestDrawdown = drawdowns.length > 0 ? Math.max(...drawdowns) : null;

  const recentActivity = [
    ...orders.map((order) => ({
      id: `order-${order.id}`,
      title: `Order ${order.orderNumber}`,
      status: order.status,
      date: order.createdAt,
      kind: "Order",
      href: `/orders/${order.id}`,
    })),
    ...evaluations.map((evaluation) => ({
      id: `evaluation-${evaluation.id}`,
      title: evaluation.rulesetName || "Evaluation",
      status: evaluation.status,
      date: evaluation.completedAt || evaluation.startedAt,
      kind: "Evaluation",
      href: `/evaluations/${evaluation.id}`,
    })),
    ...fundedAccounts.map((account) => ({
      id: `funded-${account.id}`,
      title: account.account?.accountNumber
        ? `Account ${account.account.accountNumber}`
        : "Funded account",
      status: account.status,
      date: account.closedAt || account.activatedAt || account.allocatedAt || account.createdAt,
      kind: "Account",
      href: `/accounts/${account.id}`,
    })),
  ]
    .filter((item) => !Number.isNaN(new Date(item.date).getTime()))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 5);

  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPath="/dashboard" />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
        <TraderWorkspaceNav currentPath="/dashboard" />
        <div className="mb-7 flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-5 shadow-sm sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <PageHeader
            title="Your dashboard"
            description={`Welcome back, ${displayName}. Here's your account overview.`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={trader.status} />
            <button
              type="button"
              onClick={() => setRefreshKey((key) => key + 1)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Activity className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <section className="mb-8" aria-label="Account metrics">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Orders recorded"
              value={
                ordersLoading === "loading"
                  ? "Loading…"
                  : ordersError
                    ? "Unavailable"
                    : String(orders.length)
              }
              detail={
                ordersError
                  ? "Order history could not be loaded."
                  : pendingOrders.length > 0
                    ? `${pendingOrders.length} pending; order status alone does not confirm payment.`
                    : "Recorded order history from your account."
              }
              icon={<ListOrdered className="h-5 w-5" />}
              tone={ordersError ? "unavailable" : "default"}
            />
            <MetricCard
              label="Active evaluations"
              value={
                evaluationsLoading === "loading"
                  ? "Loading…"
                  : evaluationsError
                    ? "Unavailable"
                    : String(activeEvaluations.length)
              }
              detail={
                evaluationsError
                  ? "Evaluation data could not be loaded."
                  : `${evaluations.length} recorded evaluation${evaluations.length === 1 ? "" : "s"}; objective checks appear below.`
              }
              icon={<ShieldCheck className="h-5 w-5" />}
              tone={evaluationsError ? "unavailable" : "default"}
            />
            <MetricCard
              label="Funded account P&L"
              value={
                fundedAccountsLoading === "loading"
                  ? "Loading..."
                  : fundedAccountsError
                    ? "Unavailable"
                    : fundedPnl !== null && pnlCurrency
                      ? formatNumber(fundedPnl, pnlCurrency)
                      : "Unavailable"
              }
              detail={
                fundedAccountsError
                  ? "Funded account data could not be loaded."
                  : pnlAccounts.length > 0 && pnlCurrency
                    ? `Combined from ${pnlAccounts.length} active account${pnlAccounts.length === 1 ? "" : "s"} in ${pnlCurrency}.`
                    : "No comparable active-account P&L is available."
              }
              icon={
                fundedPnl !== null && fundedPnl < 0
                  ? <ArrowDownRight className="h-5 w-5" />
                  : <ArrowUpRight className="h-5 w-5" />
              }
              tone={
                fundedPnl === null
                  ? "unavailable"
                  : fundedPnl < 0
                    ? "negative"
                    : "positive"
              }
            />
            <MetricCard
              label="Largest recorded drawdown"
              value={
                evaluationsLoading === "loading"
                  ? "Loading..."
                  : evaluationsError || largestDrawdown === null
                    ? "Unavailable"
                    : formatNumber(largestDrawdown)
              }
              detail={
                evaluationsError
                  ? "Evaluation data could not be loaded."
                  : largestDrawdown === null
                    ? "No verified drawdown snapshot is available."
                    : "Recorded drawdown amount; currency is not supplied by this feed."
              }
              icon={<BarChart3 className="h-5 w-5" />}
              tone={largestDrawdown === null ? "unavailable" : "default"}
            />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
          <section aria-labelledby="evaluation-heading">
            <Card className="h-full">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle id="evaluation-heading" className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Evaluation progress
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Current stage and rule-check results from your evaluations.
                  </p>
                </div>
                {activeEvaluations.length > 0 && (
                  <Badge variant="info">{activeEvaluations.length} active</Badge>
                )}
              </CardHeader>
              <CardContent>
                {evaluationsError ? (
                  <div className="rounded-xl border border-danger/20 bg-danger/5 p-4" role="alert">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Evaluations unavailable</p>
                        <p className="mt-1 text-sm text-muted-foreground">{evaluationsError}</p>
                        <button
                          type="button"
                          className="mt-3 text-sm font-medium text-primary hover:underline"
                          onClick={() => setRefreshKey((key) => key + 1)}
                        >
                          Try again
                        </button>
                      </div>
                    </div>
                  </div>
                ) : evaluationsLoading === "loading" ? (
                  <LoadingState variant="skeleton" />
                ) : evaluations.length === 0 ? (
                  <EmptyState
                    title="No evaluations yet"
                    description="Your evaluation will appear here after an eligible challenge is activated."
                    variant="default"
                    action={{
                      label: "Browse accounts",
                      onClick: () => router.push("/catalog"),
                    }}
                  />
                ) : (
                  <div className="space-y-4">
                    {evaluations.map((evaluation) => {
                      const rules = evaluation.ruleResults ?? [];
                      const resultCount =
                        evaluation.rulePassedCount +
                        evaluation.ruleFailedCount +
                        evaluation.ruleWarningCount;
                      const checkSummary = [
                        evaluation.rulePassedCount > 0 && `${evaluation.rulePassedCount} passed`,
                        evaluation.rulePendingCount ? `${evaluation.rulePendingCount} pending` : false,
                        evaluation.ruleIncompleteCount ? `${evaluation.ruleIncompleteCount} incomplete` : false,
                        evaluation.ruleStaleCount ? `${evaluation.ruleStaleCount} stale` : false,
                        evaluation.ruleUnavailableCount ? `${evaluation.ruleUnavailableCount} unavailable` : false,
                        evaluation.ruleWarningCount > 0 && !evaluation.rulePendingCount && !evaluation.ruleIncompleteCount && !evaluation.ruleStaleCount && !evaluation.ruleUnavailableCount && `${evaluation.ruleWarningCount} unresolved`,
                        evaluation.ruleFailedCount > 0 && `${evaluation.ruleFailedCount} failed`,
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      return (
                        <article
                          key={evaluation.id}
                          className="rounded-xl border border-border bg-card p-4 sm:p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold text-foreground">
                                  {evaluation.rulesetName || "Evaluation"}
                                  {evaluation.rulesetVersion ? ` · v${evaluation.rulesetVersion}` : ""}
                                </h3>
                                <Badge variant={ruleBadgeVariant(
                                  evaluation.status === "IN_PROGRESS"
                                    ? "WARNING"
                                    : evaluation.status === "PASSED"
                                      ? "PASS"
                                      : evaluation.status === "FAILED"
                                        ? "FAIL"
                                        : "",
                                )}>
                                  {evaluation.status.replace(/_/g, " ")}
                                </Badge>
                              </div>
                              <p className="mt-1 font-mono text-xs text-muted-foreground">
                                ID {evaluation.id.slice(0, 8)}
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Rule checks
                              </p>
                              <p className="mt-1 text-sm font-medium text-foreground">
                                {resultCount > 0 ? checkSummary || `${resultCount} checked` : "No results yet"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-2">
                            <div className="flex items-start gap-2">
                              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                Started <span className="font-medium text-foreground">{formatDate(evaluation.startedAt)}</span>
                              </span>
                            </div>
                            <div className="flex items-start gap-2">
                              <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                P&L snapshot{" "}
                                <span className="font-medium text-foreground">
                                  {trader.role === "TRADER" && typeof evaluation.totalPnl === "number"
                                    ? formatNumber(evaluation.totalPnl)
                                    : "Unavailable"}
                                </span>
                              </span>
                            </div>
                          </div>

                          {evaluation.status === "IN_PROGRESS" && (
                            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
                              Target completion percentage is unavailable until the evaluation feed provides a verified target and current progress.
                            </p>
                          )}

                          {evaluation.account && (
                            <div className="mt-4 border-t border-border pt-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Linked trading account
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                <span className="font-mono font-medium text-foreground">
                                  {evaluation.account.accountNumber}
                                </span>
                                <span className="text-muted-foreground">
                                  {[evaluation.account.broker, evaluation.account.server]
                                    .filter(Boolean)
                                    .join(" · ") || "Broker details unavailable"}
                                </span>
                                <Badge variant={ruleBadgeVariant(
                                  evaluation.account.healthStatus === "HEALTHY"
                                    ? "PASS"
                                    : evaluation.account.healthStatus === "ERROR"
                                      ? "FAIL"
                                      : "",
                                )}>
                                  {evaluation.account.healthStatus.replace(/_/g, " ")}
                                </Badge>
                              </div>
                            </div>
                          )}

                          {rules.length > 0 && (
                            <div className="mt-4 border-t border-border pt-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Trading-rule checks and available limits
                              </p>
                              <ul className="mt-2 divide-y divide-border">
                                {rules.slice(0, 4).map((rule, index) => {
                                  const limit = formatRuleValue(rule.expectedValue ?? rule.ruleValue);
                                  const actual = formatRuleValue(rule.actualValue);
                                  const displayState = rule.state ?? rule.result;
                                  return (
                                    <li
                                      key={`${rule.ruleType}-${rule.ruleName}-${index}`}
                                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 text-sm"
                                    >
                                      <div className="min-w-0">
                                        <p className="font-medium text-foreground">{rule.ruleName || rule.ruleType}</p>
                                        {limit && (
                                          <p className="mt-0.5 text-xs text-muted-foreground">
                                            Limit / expected: {limit}
                                            {actual ? ` · Actual: ${actual}` : ""}
                                          </p>
                                        )}
                                        {rule.requiredFollowUp && (
                                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Next step: {rule.requiredFollowUp}</p>
                                        )}
                                        {(rule.sourceDataTimestamp || rule.evaluationTimestamp) && (
                                          <p className="mt-0.5 text-xs text-muted-foreground">
                                            {rule.sourceDataTimestamp ? `Data as of ${formatDate(rule.sourceDataTimestamp)}` : "Source time unavailable"}
                                            {rule.evaluationTimestamp ? ` · Checked ${formatDate(rule.evaluationTimestamp)}` : ""}
                                          </p>
                                        )}
                                        {rule.details && (
                                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{rule.details}</p>
                                        )}
                                      </div>
                                      <Badge variant={ruleBadgeVariant(displayState)} size="sm">
                                        {displayState.replace(/_/g, " ")}
                                      </Badge>
                                    </li>
                                  );
                                })}
                              </ul>
                              {rules.length > 4 && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Showing 4 of {rules.length} rule checks.
                                </p>
                              )}
                            </div>
                          )}
                          <div className="mt-4 border-t border-border pt-3">
                            <Link href={`/evaluations/${evaluation.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              View evaluation details <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <div className="space-y-6">
            <section aria-labelledby="accounts-heading">
              <Card>
                <CardHeader>
                  <CardTitle id="accounts-heading" className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" />
                    Trading accounts
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Account status and the latest available monitoring details.
                  </p>
                </CardHeader>
                <CardContent>
                  {fundedAccountsError ? (
                    <div className="rounded-xl border border-danger/20 bg-danger/5 p-4" role="alert">
                      <p className="text-sm font-medium text-foreground">Account data unavailable</p>
                      <p className="mt-1 text-sm text-muted-foreground">{fundedAccountsError}</p>
                    </div>
                  ) : fundedAccountsLoading === "loading" ? (
                    <LoadingState variant="skeleton" />
                  ) : fundedAccounts.length === 0 ? (
                    <EmptyState
                      title="No funded accounts yet"
                      description="Allocated or active accounts will appear here when available."
                      variant="default"
                    />
                  ) : (
                    <>
                      <ul className="space-y-3">
                        {fundedAccounts.slice(0, 4).map((account) => (
                          <li key={account.id} className="rounded-xl border border-border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-sm font-semibold text-foreground">
                                  {account.account?.accountNumber || "Allocation pending"}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {[
                                    account.account?.broker,
                                    account.account?.server,
                                    account.account?.accountSize != null
                                      ? `${formatNumericValue(account.account.accountSize, account.account.currency) ?? "Unavailable"} account size`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Account details unavailable"}
                                </p>
                              </div>
                              <StatusBadge status={account.status} />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
                              <span className="text-muted-foreground">
                                Platform status: {account.account?.status?.replace(/_/g, " ") || "Unavailable"}
                              </span>
                              {account.account?.lastMonitoringAt ? (
                                <span className="text-muted-foreground">
                                  Updated {formatDate(account.account.lastMonitoringAt)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Monitoring time unavailable</span>
                              )}
                            </div>
                            <div className="mt-3">
                              <Link href={`/accounts/${account.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                Account details <ArrowRight className="h-4 w-4" aria-hidden="true" />
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            <section aria-labelledby="activity-heading">
              <Card>
                <CardHeader>
                  <CardTitle id="activity-heading" className="flex items-center gap-2">
                    <Clock3 className="h-5 w-5 text-primary" />
                    Recent activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {Boolean(ordersError || evaluationsError || fundedAccountsError) &&
                  !(ordersError && evaluationsError && fundedAccountsError) ? (
                    <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground" role="status">
                      Some activity sources are unavailable. The items shown may be incomplete.
                    </div>
                  ) : null}
                  {ordersLoading === "loading" ||
                  evaluationsLoading === "loading" ||
                  fundedAccountsLoading === "loading" ? (
                    <LoadingState variant="skeleton" />
                  ) : recentActivity.length === 0 &&
                    (ordersError || evaluationsError || fundedAccountsError) ? (
                    <p className="text-sm text-muted-foreground">
                      Activity is unavailable. Refresh to try again.
                    </p>
                  ) : recentActivity.length === 0 ? (
                    <EmptyState
                      title="Nothing to show yet"
                      description="New orders, evaluations, and account updates will appear here."
                      variant="default"
                    />
                  ) : (
                    <ol className="space-y-4">
                      {recentActivity.map((item) => (
                        <li key={item.id}>
                          <Link href={item.href} className="group flex min-w-0 gap-3 rounded-xl p-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            {item.kind === "Order" ? (
                              <Banknote className="h-4 w-4" />
                            ) : item.kind === "Evaluation" ? (
                              <ShieldCheck className="h-4 w-4" />
                            ) : (
                              <Wallet className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{item.title}</p>
                              <Badge variant={ruleBadgeVariant(
                                item.status === "PASSED" || item.status === "ACTIVE" || item.status === "PAID"
                                  ? "PASS"
                                  : item.status === "FAILED" || item.status === "FAILED_EVAL"
                                    ? "FAIL"
                                    : item.status === "PENDING" || item.status === "PENDING_PAYMENT" || item.status === "IN_PROGRESS"
                                      ? "WARNING"
                                      : "",
                              )} size="sm">
                                {item.status.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.kind} · {formatDate(item.date)}
                            </p>
                          </div>
                          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                  <Link
                    href="/catalog"
                    className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Browse accounts
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>

        <section className="mt-6" aria-labelledby="orders-heading">
          <Card>
            <CardHeader>
              <CardTitle id="orders-heading" className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-primary" />
                Recent orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ordersError ? (
                <div className="rounded-xl border border-danger/20 bg-danger/5 p-4" role="alert">
                  <p className="text-sm text-muted-foreground">{ordersError}</p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-medium text-primary hover:underline"
                    onClick={() => setRefreshKey((key) => key + 1)}
                  >
                    Try again
                  </button>
                </div>
              ) : ordersLoading === "loading" ? (
                <LoadingState variant="skeleton" />
              ) : orders.length === 0 ? (
                <EmptyState
                  title="No orders yet"
                  description="Browse accounts to find your first evaluation."
                  variant="default"
                  action={{
                    label: "Browse accounts",
                    onClick: () => router.push("/catalog"),
                  }}
                />
              ) : (
                <div className="divide-y divide-border">
                  {orders.slice(0, 5).map((order) => (
                    <div
                      key={order.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <Link href={`/orders/${order.id}`} className="inline-flex min-h-8 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {order.orderNumber}<ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">
                          {formatNumericValue(order.totalAmount, order.currency) ?? "Amount unavailable"}
                        </span>
                        <Badge
                          variant={ruleBadgeVariant(
                            order.status === "PAID"
                              ? "PASS"
                              : order.status === "FAILED"
                                ? "FAIL"
                                : order.status === "PENDING_PAYMENT"
                                  ? "WARNING"
                                  : "",
                          )}
                        >
                          {order.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <div className="mt-6">
          <NotificationsPanel sessionData={sessionData} showViewAll />
        </div>
      </main>
    </div>
  );
}
