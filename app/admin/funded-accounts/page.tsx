"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { formatAmount, formatDate, humanizeStatus } from "@/components/trader-format";
import { matchingFundedInventory, type FundedInventoryCandidate } from "@/lib/funded-account-admin";

type EvaluationSummary = {
  id: string;
  status: string;
  traderId: string;
  startingBalance: string | number | null;
  denominationCurrency: string | null;
};

type LinkedAccountSummary = {
  id: string;
  accountNumber: string | number;
  status: string;
  accountSize: string | number | null;
  currency: string;
  purpose: string | null;
};

type FundedAccountRecord = {
  id: string;
  traderId: string;
  evaluationId: string | null;
  status: string;
  createdAt: string;
  allocatedAt: string | null;
  activatedAt: string | null;
  closedAt: string | null;
  evaluation: EvaluationSummary | null;
  account: LinkedAccountSummary | null;
  rulesetVersion: { id: string; version: string } | null;
};

class RequestFailure extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAmount(value: unknown): value is string | number | null {
  return value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function isEvaluation(value: unknown): value is EvaluationSummary {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.status === "string"
    && typeof value.traderId === "string"
    && isAmount(value.startingBalance)
    && (typeof value.denominationCurrency === "string" || value.denominationCurrency === null);
}

function isLinkedAccount(value: unknown): value is LinkedAccountSummary {
  return isRecord(value)
    && typeof value.id === "string"
    && (typeof value.accountNumber === "string" || typeof value.accountNumber === "number")
    && typeof value.status === "string"
    && isAmount(value.accountSize)
    && typeof value.currency === "string"
    && (typeof value.purpose === "string" || value.purpose === null);
}

function isFundedAccount(value: unknown): value is FundedAccountRecord {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.traderId === "string"
    && (typeof value.evaluationId === "string" || value.evaluationId === null)
    && typeof value.status === "string"
    && typeof value.createdAt === "string"
    && !Number.isNaN(Date.parse(value.createdAt))
    && (typeof value.allocatedAt === "string" || value.allocatedAt === null)
    && (typeof value.activatedAt === "string" || value.activatedAt === null)
    && (typeof value.closedAt === "string" || value.closedAt === null)
    && (value.evaluation === null || isEvaluation(value.evaluation))
    && (value.account === null || isLinkedAccount(value.account))
    && (value.rulesetVersion === null
      || (isRecord(value.rulesetVersion) && typeof value.rulesetVersion.id === "string" && typeof value.rulesetVersion.version === "string"));
}

function isInventoryCandidate(value: unknown): value is FundedInventoryCandidate {
  return isRecord(value)
    && typeof value.id === "string"
    && (typeof value.accountNumber === "string" || typeof value.accountNumber === "number")
    && isAmount(value.accountSize)
    && typeof value.currency === "string"
    && (typeof value.purpose === "string" || value.purpose === null)
    && typeof value.status === "string";
}

function requestError(status: number): RequestFailure {
  if (status === 401) return new RequestFailure("Sign in with an administrator account to manage funded accounts.", status);
  if (status === 403) return new RequestFailure("Administrator access is required to manage funded accounts.", status);
  if (status === 404) return new RequestFailure("This funded account no longer exists. Refresh the list.", status);
  if (status === 409) return new RequestFailure("The account or inventory changed before this action completed. Refresh and review the latest state.", status);
  if (status === 429) return new RequestFailure("Too many changes were attempted. Wait briefly, then try again.", status);
  return new RequestFailure("The funded-account service is unavailable. Try again.", status);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function loadFundedAccounts(): Promise<FundedAccountRecord[]> {
  const response = await fetch("/api/funded-accounts", { cache: "no-store" });
  const body: unknown = await readJson(response);
  if (!response.ok) throw requestError(response.status);
  if (!isRecord(body) || body.success !== true || !Array.isArray(body.accounts) || !body.accounts.every(isFundedAccount)) {
    throw new Error("The funded-account service returned an unexpected response. Retry the request.");
  }
  return body.accounts;
}

function StatusBadge({ status }: { status: string }) {
  const style = status === "ACTIVE" || status === "COMPLETED"
    ? "bg-success-light text-success"
    : status === "PENDING" || status === "ELIGIBLE" || status === "APPROVED"
      ? "bg-warning-light text-warning"
      : status === "SUSPENDED" || status === "TERMINATED"
        ? "bg-danger-light text-danger"
        : "bg-muted text-muted-foreground";
  return <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + style}>{humanizeStatus(status)}</span>;
}

function SummaryCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{count}</p>
    </div>
  );
}

export default function AdminFundedAccountsPage() {
  const [accounts, setAccounts] = useState<FundedAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    const firstLoad = accounts.length === 0;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    setError("");
    setAuthError(false);
    try {
      setAccounts(await loadFundedAccounts());
    } catch (cause) {
      const failure = cause instanceof Error ? cause : new Error("The funded-account service is unavailable. Try again.");
      setError(failure.message);
      setAuthError(cause instanceof RequestFailure && (cause.status === 401 || cause.status === 403));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accounts.length]);

  useEffect(() => {
    let active = true;
    void loadFundedAccounts()
      .then((result) => { if (active) setAccounts(result); })
      .catch((cause: unknown) => {
        if (!active) return;
        const failure = cause instanceof Error ? cause : new Error("The funded-account service is unavailable. Try again.");
        setError(failure.message);
        setAuthError(cause instanceof RequestFailure && (cause.status === 401 || cause.status === 403));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesStatus = statusFilter === "ALL" || account.status === statusFilter;
      const matchesText = !query
        || account.id.toLowerCase().includes(query)
        || account.traderId.toLowerCase().includes(query)
        || (account.account?.accountNumber !== undefined && String(account.account.accountNumber).toLowerCase().includes(query))
        || (account.evaluationId?.toLowerCase().includes(query) ?? false);
      return matchesStatus && matchesText;
    });
  }, [accounts, search, statusFilter]);

  const waitingApproval = accounts.filter((account) => account.status === "PENDING" || account.status === "ELIGIBLE").length;
  const waitingAssignment = accounts.filter((account) => account.status === "APPROVED").length;
  const activeCount = accounts.filter((account) => account.status === "ACTIVE").length;

  if (authError) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header currentPath="/admin" />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
          <section className="rounded-2xl border border-danger/30 bg-danger-light/40 p-6" role="alert">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-danger">Administration</p>
            <h1 className="mt-2 text-2xl font-bold text-foreground">Administrator access required</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
            <Link href="/admin" className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Back to admin</Link>
          </section>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPath="/admin" />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
        <div className="mb-7 flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Administration</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Funded-account lifecycle</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review passed evaluations, approve accounts, and assign only available funded inventory of the matching size.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/accounts" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Account inventory</Link>
            <button type="button" onClick={() => void refresh()} disabled={loading || refreshing} aria-busy={refreshing} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard label="Awaiting approval" count={waitingApproval} />
          <SummaryCard label="Awaiting assignment" count={waitingAssignment} />
          <SummaryCard label="Active accounts" count={activeCount} />
        </div>

        <div className="mb-5 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
          This view contains the newest 100 records returned by the existing API. Counts above describe only those records. Approval does not activate an account; activation requires a matching inventory assignment.
        </div>

        {error && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger-light/40 p-4 text-sm text-danger sm:flex-row sm:items-center sm:justify-between" role="alert">
            <p>{error}{accounts.length > 0 ? " Showing the last successfully loaded records." : ""}</p>
            <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger/30 px-3 font-semibold hover:bg-danger/10 disabled:opacity-60">Try again</button>
          </div>
        )}

        <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <label className="text-sm font-medium text-foreground">
            Search account, evaluation, or trader ID
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-input-border bg-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <label className="text-sm font-medium text-foreground">
            Filter by status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-input-border bg-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="ELIGIBLE">Eligible</option>
              <option value="APPROVED">Approved</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="TERMINATED">Terminated</option>
              <option value="COMPLETED">Completed</option>
              <option value="CLOSED">Closed</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground" role="status" aria-live="polite">Loading funded-account records…</div>
        ) : visibleAccounts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground">{accounts.length === 0 ? "No funded accounts are available" : "No records match this view"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {accounts.length === 0 ? "Records appear here when the existing evaluation workflow creates funded accounts." : "Change the status filter or search term to see other records."}
            </p>
          </div>
        ) : (
          <section className="space-y-4" role="region" aria-label="Funded-account records">
            {visibleAccounts.map((account) => <FundedAccountCard key={account.id} account={account} onRefresh={refresh} />)}
          </section>
        )}
        <p className="mt-5 text-xs leading-5 text-muted-foreground" role="status">
          Showing {visibleAccounts.length} of {accounts.length} loaded record{accounts.length === 1 ? "" : "s"}.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

function FundedAccountCard({ account, onRefresh }: { account: FundedAccountRecord; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null);
  const [inventory, setInventory] = useState<FundedInventoryCandidate[]>([]);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [showInventory, setShowInventory] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [targetStatus, setTargetStatus] = useState("");
  const [reason, setReason] = useState("");

  const expectedSize = account.evaluation?.startingBalance;
  const expectedCurrency = account.evaluation?.denominationCurrency;
  const matchingInventory = useMemo(() => matchingFundedInventory(expectedSize, expectedCurrency, inventory), [expectedCurrency, expectedSize, inventory]);
  const evaluationPassed = account.evaluation?.status === "PASSED";

  async function loadInventory(forceRefresh = false) {
    setShowInventory(true);
    setInventoryError("");
    if (inventoryLoaded && !forceRefresh) return;
    setInventoryLoading(true);
    try {
      const params = new URLSearchParams({ status: "AVAILABLE", purpose: "FUNDED" });
      const response = await fetch("/api/admin/mt5-accounts?" + params.toString(), { cache: "no-store" });
      const body: unknown = await readJson(response);
      if (!response.ok) throw requestError(response.status);
      if (!isRecord(body) || body.success !== true || !Array.isArray(body.accounts) || !body.accounts.every(isInventoryCandidate)) {
        throw new Error("Account inventory returned an unexpected response. Retry the request.");
      }
      setInventory(body.accounts);
      setInventoryLoaded(true);
    } catch (cause) {
      setInventoryError(cause instanceof Error ? cause.message : "Account inventory is unavailable. Try again.");
    } finally {
      setInventoryLoading(false);
    }
  }

  async function submitAction(path: string, body: Record<string, unknown> | undefined, successMessage: string) {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const result: unknown = await readJson(response);
      if (!response.ok) throw requestError(response.status);
      if (!isRecord(result) || result.success !== true) throw new Error("The request did not complete. Review the record and try again.");
      setFeedback({ message: successMessage, success: true });
      setShowInventory(false);
      await onRefresh();
    } catch (cause) {
      setFeedback({ message: cause instanceof Error ? cause.message : "The request failed. Try again.", success: false });
    } finally {
      setBusy(false);
    }
  }

  function submitTransition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const needsReason = targetStatus === "SUSPENDED" || targetStatus === "TERMINATED";
    if (!targetStatus || (needsReason && !reason.trim())) {
      setFeedback({ message: "Enter a reason before suspending or terminating this account.", success: false });
      return;
    }
    void submitAction(
      "/api/funded-accounts/" + encodeURIComponent(account.id) + "/transition",
      { status: targetStatus, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      "The status change was recorded.",
    );
  }

  const availableTransitions = account.status === "ACTIVE"
    ? ["SUSPENDED", "TERMINATED", "COMPLETED"]
    : account.status === "SUSPENDED"
      ? ["TERMINATED"]
      : [];

  return (
    <article className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-sm font-semibold text-foreground">{account.id}</h2>
            <StatusBadge status={account.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Created {formatDate(account.createdAt)}
            {account.activatedAt ? " · Activated " + formatDate(account.activatedAt) : ""}
            {account.closedAt ? " · Closed " + formatDate(account.closedAt) : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={"/admin/customers/" + encodeURIComponent(account.traderId)} className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            View trader
          </Link>
          {account.account && <Link href={"/admin/accounts/" + encodeURIComponent(account.account.id)} className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View MT5 account</Link>}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evaluation</dt><dd className="mt-1 break-all text-sm text-foreground">{account.evaluationId ?? "Not linked"}</dd><dd className="mt-1 text-xs text-muted-foreground">Status: {account.evaluation ? humanizeStatus(account.evaluation.status) : "Unavailable"}</dd></div>
        <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required size and currency</dt><dd className="mt-1 text-sm text-foreground">{formatAmount(expectedSize, expectedCurrency) ?? "Not recorded"}</dd><dd className="mt-1 text-xs text-muted-foreground">From the immutable order snapshot</dd></div>
        <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assigned MT5 account</dt><dd className="mt-1 break-all text-sm text-foreground">{account.account ? String(account.account.accountNumber) : "Not assigned"}</dd><dd className="mt-1 text-xs text-muted-foreground">{account.account ? humanizeStatus(account.account.status) + " · " + (formatAmount(account.account.accountSize, account.account.currency) ?? "Size unavailable") : "Account remains inactive"}</dd></div>
        <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ruleset version</dt><dd className="mt-1 text-sm text-foreground">{account.rulesetVersion ? "Version " + account.rulesetVersion.version : "Unavailable"}</dd><dd className="mt-1 break-all text-xs text-muted-foreground">Trader ID: {account.traderId}</dd></div>
      </dl>

      {feedback && <p className={"mt-4 rounded-lg border p-3 text-sm " + (feedback.success ? "border-success/30 bg-success-light text-success" : "border-danger/30 bg-danger-light text-danger")} role={feedback.success ? "status" : "alert"}>{feedback.message}</p>}

      <div className="mt-5 border-t border-border pt-4">
        {account.status === "PENDING" || account.status === "ELIGIBLE" ? (
          evaluationPassed ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted-foreground">The evaluation passed. Approval keeps this account inactive until a matching funded account is assigned.</p>
              <button type="button" onClick={() => void submitAction("/api/funded-accounts/" + encodeURIComponent(account.id) + "/approve", undefined, "Approved. Assign matching inventory to activate the account.")} disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? "Saving…" : "Approve for assignment"}
              </button>
            </div>
          ) : (
            <p className="rounded-lg border border-warning/30 bg-warning-light px-3 py-2.5 text-sm leading-6 text-warning" role="status">
              Approval is unavailable because this record does not show a passed evaluation. Current evaluation status: {account.evaluation ? humanizeStatus(account.evaluation.status) : "unavailable"}.
            </p>
          )
        ) : null}

        {account.status === "APPROVED" && (
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted-foreground">Choose available FUNDED inventory whose size and currency match the passed evaluation. The server rechecks both before activation.</p>
              <button type="button" onClick={() => void loadInventory(inventoryLoaded)} disabled={busy || inventoryLoading || !evaluationPassed || expectedSize == null || !expectedCurrency} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
                {inventoryLoading ? "Checking inventory…" : showInventory ? "Refresh matching inventory" : "Find matching inventory"}
              </button>
            </div>
            {!evaluationPassed && <p className="mt-3 text-sm text-warning">Assignment is unavailable until the linked evaluation is confirmed as passed.</p>}
            {!expectedCurrency && <p className="mt-3 text-sm text-warning">Assignment is unavailable because the order snapshot does not contain a verifiable account-denomination currency.</p>}
            {showInventory && (
              <div className="mt-4 rounded-xl border border-border bg-background p-4">
                {inventoryLoading ? <p className="text-sm text-muted-foreground" role="status">Checking available funded inventory…</p> : null}
                {inventoryError && <div className="flex flex-col gap-3 text-sm text-danger sm:flex-row sm:items-center sm:justify-between" role="alert"><p>{inventoryError}</p><button type="button" onClick={() => void loadInventory(true)} className="min-h-10 rounded-lg border border-danger/30 px-3 font-semibold">Try again</button></div>}
                {!inventoryLoading && !inventoryError && matchingInventory.length === 0 && (
                  <p className="text-sm leading-6 text-muted-foreground" role="status">No available FUNDED account matches the required size and currency. No assignment was made.</p>
                )}
                {!inventoryLoading && !inventoryError && matchingInventory.length > 0 && (
                  <form onSubmit={(event) => { event.preventDefault(); if (!selectedAccountId) return; void submitAction("/api/funded-accounts/" + encodeURIComponent(account.id) + "/link-account", { accountId: selectedAccountId }, "Inventory was assigned and activation completed."); }}>
                    <label className="block text-sm font-medium text-foreground" htmlFor={"inventory-" + account.id}>Matching available account</label>
                    <select id={"inventory-" + account.id} value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} required className="mt-1.5 min-h-11 w-full rounded-lg border border-input-border bg-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select an account</option>
                      {matchingInventory.map((candidate) => <option key={candidate.id} value={candidate.id}>{String(candidate.accountNumber)} · {formatAmount(candidate.accountSize, candidate.currency) ?? "Size unavailable"} · {humanizeStatus(candidate.status)}</option>)}
                    </select>
                    <button type="submit" disabled={busy || !selectedAccountId} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
                      {busy ? "Assigning…" : "Assign and activate"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {account.status === "SUSPENDED" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-6 text-muted-foreground">Reactivation is checked against the original account assignment. If inventory or assignment history is inconsistent, the service will reject the change for review.</p>
            <button type="button" onClick={() => void submitAction("/api/funded-accounts/" + encodeURIComponent(account.id) + "/transition", { status: "ACTIVE" }, "The account was reactivated after server-side assignment checks.")} disabled={busy} className="inline-flex min-h-11 w-fit items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? "Saving…" : "Reactivate account"}
            </button>
          </div>
        )}

        {availableTransitions.length > 0 && (
          <form onSubmit={submitTransition} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_auto] sm:items-end">
            <label className="text-sm font-medium text-foreground" htmlFor={"transition-" + account.id}>
              Change status
              <select id={"transition-" + account.id} value={targetStatus} onChange={(event) => setTargetStatus(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-input-border bg-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Choose a status</option>
                {availableTransitions.map((status) => <option key={status} value={status}>{humanizeStatus(status)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-foreground">
              Reason for suspension or termination
              <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Required for suspension or termination" className="mt-1.5 min-h-11 w-full rounded-lg border border-input-border bg-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            <button type="submit" disabled={busy || !targetStatus} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? "Saving…" : "Record status"}
            </button>
          </form>
        )}

        {account.status === "ACTIVE" && <p className="mt-4 text-xs leading-5 text-muted-foreground">Completion and termination release the assignment and deactivate the inventory in the same transaction. Suspension keeps the account reserved.</p>}
      </div>
    </article>
  );
}
