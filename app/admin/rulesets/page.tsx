'use client';

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { useCallback, useEffect, useState } from "react";

type RuleRecord = { id: string; name: string; ruleType: string; value: unknown; isRequired: boolean; disposition: string; calculation: unknown; effectiveDate: string | null };
type RulesetVersion = { id: string; version: string; status: string; effectiveDate: string | null; rules: RuleRecord[] };
type Ruleset = { id: string; name: string; description: string | null; isActive: boolean; versions: RulesetVersion[] };

const RULE_TYPE_OPTIONS = [
  ["PROFIT_TARGET", "Profit target"],
  ["DRAWDOWN_LIMIT", "Drawdown limit"],
  ["TRADING_HOURS", "Trading hours"],
  ["MIN_TRADES", "Minimum trades"],
  ["MIN_TRADING_DAYS", "Minimum trading days"],
  ["MAX_DAILY_LOSS", "Daily loss"],
  ["MAX_OPEN_TRADES", "Maximum open trades"],
  ["MAX_LEVERAGE", "Maximum leverage"],
  ["TRADING_SESSION", "Trading session"],
] as const;

async function fetchRulesets(): Promise<Ruleset[]> {
  const response = await fetch("/api/admin/rulesets");
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.rulesets)) throw new Error("Rulesets are unavailable. Confirm your admin access.");
  return data.rulesets;
}

function JsonText({ value }: { value: unknown }) {
  return <code className="block max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 text-xs">{value === null || value === undefined ? "Not configured" : JSON.stringify(value, null, 2)}</code>;
}

function formatJsonDraft(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed !== null && typeof parsed === "object") return JSON.stringify(parsed, null, 2) ?? "";
    } catch {
      // Keep ordinary string values as valid JSON text below.
    }
  }
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return "";
  }
}

function RuleDraftEditor({
  rulesetId,
  version,
  rule,
  request,
  busy,
}: {
  rulesetId: string;
  version: string;
  rule: RuleRecord;
  request: (url: string, method: string, body?: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [name, setName] = useState(rule.name);
  const [ruleType, setRuleType] = useState(rule.ruleType);
  const [disposition, setDisposition] = useState(rule.disposition);
  const [valueText, setValueText] = useState(formatJsonDraft(rule.value));
  const [calculationText, setCalculationText] = useState(formatJsonDraft(rule.calculation));
  const [effectiveDate, setEffectiveDate] = useState(rule.effectiveDate?.slice(0, 10) ?? "");
  const [error, setError] = useState("");

  async function saveRule(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    let value: unknown = null;
    let calculation: unknown = null;
    try {
      if (disposition !== "OPTIONAL") {
        value = valueText.trim() ? JSON.parse(valueText) : null;
        calculation = calculationText.trim() ? JSON.parse(calculationText) : null;
      }
    } catch {
      setError("Rule value and calculation must each contain valid JSON.");
      return;
    }

    const saved = await request(
      `/api/rulesets/${rulesetId}/versions/${encodeURIComponent(version)}/rules/${rule.id}`,
      "PUT",
      { name, ruleType, disposition, value, calculation, effectiveDate: effectiveDate || null },
    );
    if (saved) setError("");
  }

  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-semibold">Edit draft rule</summary>
      <form onSubmit={(event) => void saveRule(event)} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">Rule name<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" /></label>
        <label className="text-xs font-medium">Rule type<select required value={ruleType} onChange={(event) => setRuleType(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm">{RULE_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-medium">Applicability<select value={disposition} onChange={(event) => setDisposition(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm"><option value="UNRESOLVED">Unresolved · blocks publication</option><option value="REQUIRED">Required</option><option value="OPTIONAL">Optional · no active threshold</option></select></label>
        <label className="text-xs font-medium">Effective date<input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" /></label>
        <label className="text-xs font-medium">Value JSON<textarea value={valueText} onChange={(event) => setValueText(event.target.value)} rows={4} disabled={disposition === "OPTIONAL"} placeholder="Enter approved rule data" className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs disabled:opacity-60" /></label>
        <label className="text-xs font-medium">Calculation definition JSON<textarea value={calculationText} onChange={(event) => setCalculationText(event.target.value)} rows={4} disabled={disposition === "OPTIONAL"} placeholder="Enter an explicit, supported calculation" className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs disabled:opacity-60" /></label>
        {disposition === "OPTIONAL" && <p className="text-xs text-muted-foreground sm:col-span-2">Optional rules are saved without an active threshold or calculation.</p>}
        {error && <p role="alert" className="rounded bg-danger-light p-3 text-sm text-danger sm:col-span-2">{error}</p>}
        <button disabled={busy} className="w-fit rounded border border-primary/40 px-4 py-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:col-span-2">{busy ? "Saving…" : "Save rule changes"}</button>
      </form>
    </details>
  );
}

function VersionEditor({ ruleset, version, onRefresh }: { ruleset: Ruleset; version: RulesetVersion; onRefresh: () => void }) {
  const [ruleName, setRuleName] = useState("");
  const [ruleType, setRuleType] = useState("");
  const [disposition, setDisposition] = useState("UNRESOLVED");
  const [valueText, setValueText] = useState("");
  const [calculationText, setCalculationText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(url: string, method: string, body?: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json();
      if (!response.ok) {
        setMessage([result.error, ...(Array.isArray(result.errors) ? result.errors : [])].filter(Boolean).join("\n"));
        return false;
      }
      setMessage("Saved.");
      onRefresh();
      return true;
    } catch {
      setMessage("Request failed. Check the connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function parseOptionalJson(text: string): unknown {
    return text.trim() ? JSON.parse(text) : null;
  }

  async function addRule(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    let value: unknown;
    let calculation: unknown;
    try {
      value = parseOptionalJson(valueText);
      calculation = parseOptionalJson(calculationText);
    } catch {
      setMessage("Rule value and calculation must each be valid JSON.");
      return;
    }
    const saved = await request(`/api/rulesets/${ruleset.id}/versions/${encodeURIComponent(version.version)}/rules`, "POST", { name: ruleName, ruleType, disposition, value, calculation });
    if (saved) { setRuleName(""); setRuleType(""); setDisposition("UNRESOLVED"); setValueText(""); setCalculationText(""); }
  }

  const base = `/api/rulesets/${ruleset.id}/versions/${encodeURIComponent(version.version)}`;
  return (
    <section className="mt-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">{ruleset.name} · version {version.version}</h4><p className="mt-1 text-xs text-muted-foreground">Version ID: {version.id} · status: {version.status}</p></div>{version.status === "DRAFT" && <button disabled={busy} onClick={() => void request(`${base}/publish`, "POST")} className="rounded bg-success px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">Validate and publish</button>}</div>
      {version.rules.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No rules configured yet.</p> : <div className="mt-4 space-y-3">{version.rules.map((rule) => <article key={rule.id} className="rounded border bg-card p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h5 className="font-medium">{rule.name} · {rule.ruleType}</h5><p className="text-xs text-muted-foreground">{rule.disposition} · rule ID {rule.id}</p></div>{version.status === "DRAFT" && <button type="button" disabled={busy} onClick={() => void request(`${base}/rules/${rule.id}`, "DELETE")} className="text-xs text-danger underline disabled:opacity-50">Remove draft rule</button>}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-xs font-semibold">Rule value</p><JsonText value={rule.value} /></div><div><p className="mb-1 text-xs font-semibold">Calculation definition</p><JsonText value={rule.calculation} /></div></div>{version.status === "DRAFT" && <RuleDraftEditor key={`${rule.id}:${version.status}`} rulesetId={ruleset.id} version={version.version} rule={rule} request={request} busy={busy} />}</article>)}</div>}
      {version.status === "DRAFT" && <form onSubmit={(event) => void addRule(event)} className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2">
        <h5 className="font-semibold sm:col-span-2">Add rule to this draft</h5>
        <label className="text-xs font-medium">Rule name<input required value={ruleName} onChange={(event) => setRuleName(event.target.value)} maxLength={100} className="mt-1 w-full rounded border px-3 py-2 text-sm" /></label>
        <label className="text-xs font-medium">Rule type<select required value={ruleType} onChange={(event) => setRuleType(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm"><option value="">Select a rule type</option>{RULE_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-medium">Applicability<select value={disposition} onChange={(event) => setDisposition(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm"><option value="UNRESOLVED">Unresolved · blocks publication</option><option value="REQUIRED">Required</option><option value="OPTIONAL">Optional · intentionally unused</option></select></label>
        <label className="text-xs font-medium">Value JSON<textarea value={valueText} onChange={(event) => setValueText(event.target.value)} rows={4} placeholder="Enter approved rule data" className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs" /></label>
        <label className="text-xs font-medium sm:col-span-2">Calculation definition JSON<textarea value={calculationText} onChange={(event) => setCalculationText(event.target.value)} rows={5} placeholder="metric, method, reference, breach comparison, evaluation timing, and required inputs" className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs" /></label>
        <button disabled={busy} className="w-fit rounded border border-primary/40 px-4 py-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">Add rule draft</button>
      </form>}
      {message && <p role="status" className="mt-4 whitespace-pre-wrap rounded bg-warning-light p-3 text-sm text-warning-foreground">{message}</p>}
    </section>
  );
}

export default function AdminRulesetsPage() {
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [newVersion, setNewVersion] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRulesets(await fetchRulesets());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rulesets are unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    fetchRulesets()
      .then((items) => { if (active) setRulesets(items); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Rulesets are unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(url: string, body: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) { setMessage([data.error, ...(Array.isArray(data.errors) ? data.errors : [])].filter(Boolean).join("\n")); return false; }
      setMessage("Saved."); await load(); return true;
    } catch { setMessage("Request failed. Check the connection and try again."); return false; }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header currentPath="/admin/rulesets" />
      <main className="mx-auto max-w-7xl p-6 sm:p-8 flex-1">
        <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="site-kicker text-emerald-400">Admin · rules configuration</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Ruleset versions</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Published versions are read-only. Changes require a new draft. Publication validates required fields and evaluator readiness; no customer terms are supplied by default.</p>
            </div>
            <Link href="/admin/rulesets/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2">
              Create ruleset <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground"><Link href="/admin" className="text-emerald-400 underline-offset-4 hover:underline">Admin home</Link> · <Link href="/admin/products" className="text-emerald-400 underline-offset-4 hover:underline">Product catalog</Link></p>
        </div>
        {error && <p role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger-light p-4 text-sm text-danger">{error}</p>}
        <form onSubmit={(event) => { event.preventDefault(); void submit("/api/rulesets", { name, description: description || null }).then((saved) => { if (saved) { setName(""); setDescription(""); } }); }} className="mt-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-medium">New ruleset name<input required value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="mt-1 w-full rounded-xl border border-input-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <label className="text-xs font-medium">Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} className="mt-1 w-full rounded-xl border border-input-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <button disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 disabled:opacity-60">Create ruleset</button>
        </form>
        {message && <p role="status" className="mt-4 whitespace-pre-wrap rounded-xl bg-warning-light p-3 text-sm text-warning-foreground">{message}</p>}
        {loading ? <p role="status" className="mt-8 text-center text-sm text-muted-foreground">Loading rulesets…</p> : rulesets.length === 0 ? <p className="mt-8 rounded-xl border border-border p-5 text-sm text-muted-foreground">No rulesets configured.</p> : <div className="mt-6 space-y-5">{rulesets.map((ruleset) => <article key={ruleset.id} className="rounded-2xl border border-border bg-card p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">{ruleset.name}</h2><p className="mt-1 text-xs font-mono text-muted-foreground">Ruleset ID: {ruleset.id}</p></div><form onSubmit={(event) => { event.preventDefault(); const version = newVersion[ruleset.id]?.trim(); if (version) void submit(`/api/rulesets/${ruleset.id}/versions`, { version }); }} className="flex flex-wrap gap-2 mt-3"><label className="sr-only" htmlFor={`new-version-${ruleset.id}`}>New version identifier</label><input id={`new-version-${ruleset.id}`} required value={newVersion[ruleset.id] ?? ""} onChange={(event) => setNewVersion((current) => ({ ...current, [ruleset.id]: event.target.value }))} placeholder="New version ID" className="rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /><button disabled={busy} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60">Create draft version</button></form></div>
          {ruleset.versions.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No versions created.</p>}
          {ruleset.versions.map((version) => <VersionEditor key={version.id} ruleset={ruleset} version={version} onRefresh={() => void load()} />)}
        </article>)}</div>}
      </main>
      <SiteFooter />
    </div>
  );
}
