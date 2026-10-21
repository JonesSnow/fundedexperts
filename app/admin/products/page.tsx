'use client';

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProductStage = { id: string; stageKey: string; displayName: string; stageOrder: number; rulesetVersion: { id: string; version: string; status: string; ruleset: { id: string; name: string } } };
type AdminProduct = {
  id: string; code: string | null; name: string; description: string | null; category: string | null;
  evaluationStructure: string | null; status: string; isActive: boolean; accountSize: string | number | null;
  denominationCurrency: string | null; price: string | number | null; currency: string; rulesetId: string | null;
  operatingRulesetVersionId: string | null; displayOrder: number; stages: ProductStage[];
};
type AdminRuleset = { id: string; name: string; versions: Array<{ id: string; version: string; status: string }> };
type ApiState = { loading: boolean; error: string; products: AdminProduct[]; rulesets: AdminRuleset[] };

type RulesetVersionOption = { id: string; version: string; status: string; rulesetName: string };

function StageDraftEditor({
  productId,
  stage,
  versions,
  busy,
  send,
}: {
  productId: string;
  stage: ProductStage;
  versions: RulesetVersionOption[];
  busy: boolean;
  send: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const [stageKey, setStageKey] = useState(stage.stageKey);
  const [displayName, setDisplayName] = useState(stage.displayName);
  const [stageOrder, setStageOrder] = useState(String(stage.stageOrder));
  const [rulesetVersionId, setRulesetVersionId] = useState(stage.rulesetVersion.id);

  return (
    <li className="rounded border bg-background px-3 py-2">
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {stage.stageOrder}. {stage.displayName} · {stage.rulesetVersion.ruleset.name} v{stage.rulesetVersion.version} ({stage.rulesetVersion.status})
        </summary>
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          void send(`/api/products/${productId}/stages/${stage.id}`, "PUT", {
            stageKey,
            displayName,
            stageOrder: Number(stageOrder),
            rulesetVersionId,
          });
        }}>
          <label className="text-xs font-medium">Stage key<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={stageKey} onChange={(event) => setStageKey(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-sm" /></label>
          <label className="text-xs font-medium">Display name<input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-sm" /></label>
          <label className="text-xs font-medium">Stage order<input required type="number" min="1" step="1" value={stageOrder} onChange={(event) => setStageOrder(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-sm" /></label>
          <label className="text-xs font-medium">Ruleset version<select required value={rulesetVersionId} onChange={(event) => setRulesetVersionId(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-sm"><option value="">Select version</option>{versions.map((version) => <option key={version.id} value={version.id}>{version.rulesetName} v{version.version} · {version.status}</option>)}</select></label>
          <p className="text-xs text-muted-foreground sm:col-span-2">If another stage already uses this order, move that stage to an unused order first. Publication requires contiguous stage numbering.</p>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button disabled={busy} className="rounded border border-primary/40 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">Save stage</button>
            <button type="button" disabled={busy} onClick={() => void send(`/api/products/${productId}/stages/${stage.id}`, "DELETE")} className="text-xs text-danger underline disabled:opacity-50">Remove draft stage</button>
          </div>
        </form>
      </details>
    </li>
  );
}

function DraftProductCard({ product, rulesets, onRefresh }: { product: AdminProduct; rulesets: AdminRuleset[]; onRefresh: () => void }) {
  const [name, setName] = useState(product.name);
  const [code, setCode] = useState(product.code ?? "");
  const [category, setCategory] = useState(product.category ?? "");
  const [structure, setStructure] = useState(product.evaluationStructure ?? "");
  const [size, setSize] = useState(product.accountSize === null ? "" : String(product.accountSize));
  const [denominationCurrency, setDenominationCurrency] = useState(product.denominationCurrency ?? "");
  const [price, setPrice] = useState(product.price === null ? "" : String(product.price));
  const [currency, setCurrency] = useState(product.currency);
  const [description, setDescription] = useState(product.description ?? "");
  const [stageKey, setStageKey] = useState("");
  const [stageName, setStageName] = useState("");
  const [stageOrder, setStageOrder] = useState(String(product.stages.length + 1));
  const [versionId, setVersionId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const versions = useMemo(() => rulesets.flatMap((ruleset) => ruleset.versions.map((version) => ({ ...version, rulesetName: ruleset.name }))), [rulesets]);

  async function send(url: string, method: string, body?: unknown, successMessage = "Saved.") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json();
      if (!response.ok) {
        setMessage([result.error, ...(Array.isArray(result.errors) ? result.errors : [])].filter(Boolean).join("\n"));
        return false;
      }
      setMessage(result.success ? (typeof result.message === "string" ? result.message : successMessage) : "Request completed.");
      onRefresh();
      return true;
    } catch {
      setMessage("Request failed. Check the connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{product.name}</h2><p className="mt-1 text-xs text-muted-foreground">{product.code ?? "No product code"} · {product.category ?? "Category unresolved"} · {product.status}</p></div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{product.status}</span>
      </div>

      {product.status === "DRAFT" && <>
        <details className="mt-4" open>
          <summary className="cursor-pointer text-sm font-semibold">Draft product configuration</summary>
          <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void send(`/api/products/${product.id}`, "PUT", { name, code: code || null, description: description || null, category: category || undefined, evaluationStructure: structure || undefined, accountSize: size || null, denominationCurrency: denominationCurrency || undefined, price: price || null, currency, displayOrder: product.displayOrder }); }}>
            <label className="text-xs font-medium">Name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" required maxLength={100} /></label>
            <label className="text-xs font-medium">Stable code<input value={code} onChange={(event) => setCode(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" placeholder="lowercase-hyphen-code" /></label>
            <label className="text-xs font-medium">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm"><option value="">Unresolved</option><option value="BEGINNER">Beginner</option><option value="PRO">Pro</option><option value="EXPERT">Expert</option><option value="DIRECT_FUNDED">Direct Funded</option></select></label>
            <label className="text-xs font-medium">Evaluation structure<select value={structure} onChange={(event) => setStructure(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm"><option value="">Unresolved</option><option value="THREE_STEP">Three step</option><option value="FOUR_STEP">Four step</option><option value="TWO_STEP">Two step</option><option value="ONE_STEP">One step</option><option value="DIRECT_FUNDED">Direct funded · no evaluation</option></select></label>
            <label className="text-xs font-medium">Account size<input value={size} onChange={(event) => setSize(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" type="number" step="0.01" min="0.01" /></label>
            <label className="text-xs font-medium">Account denomination currency<input value={denominationCurrency} onChange={(event) => setDenominationCurrency(event.target.value.toUpperCase())} className="mt-1 w-full rounded border px-3 py-2 text-sm" maxLength={3} /></label>
            <label className="text-xs font-medium">Price<input value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" type="number" step="0.01" min="0.01" /></label>
            <label className="text-xs font-medium">Price currency<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1 w-full rounded border px-3 py-2 text-sm" maxLength={3} /></label>
            <label className="text-xs font-medium sm:col-span-2">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" rows={2} maxLength={2000} /></label>
            <button disabled={busy} className="w-fit rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save draft fields</button>
          </form>
        </details>

        <section className="mt-5 border-t pt-4">
          <h3 className="text-sm font-semibold">Evaluation stages</h3>
          {product.stages.length > 0 ? <ol className="mt-2 space-y-2">{product.stages.map((stage) => <StageDraftEditor key={stage.id} productId={product.id} stage={stage} versions={versions} busy={busy} send={send} />)}</ol> : <p className="mt-2 text-xs text-muted-foreground">No evaluation stages configured.</p>}
          <form className="mt-3 grid gap-2 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void send(`/api/products/${product.id}/stages`, "POST", { stageKey, displayName: stageName, stageOrder: Number(stageOrder), rulesetVersionId: versionId }); }}>
            <label className="text-xs font-medium">Stage key<input required value={stageKey} onChange={(event) => setStageKey(event.target.value)} placeholder="stage-1" className="mt-1 w-full rounded border px-2 py-2 text-sm" /></label>
            <label className="text-xs font-medium">Display name<input required value={stageName} onChange={(event) => setStageName(event.target.value)} placeholder="Stage 1" className="mt-1 w-full rounded border px-2 py-2 text-sm" /></label>
            <label className="text-xs font-medium">Order<input required type="number" min="1" step="1" value={stageOrder} onChange={(event) => setStageOrder(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-sm" /></label>
            <label className="text-xs font-medium">Ruleset version<select required value={versionId} onChange={(event) => setVersionId(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-sm"><option value="">Select version</option>{versions.map((version) => <option key={version.id} value={version.id}>{version.rulesetName} v{version.version} · {version.status}</option>)}</select></label>
            <button disabled={busy} className="w-fit rounded border border-primary/40 px-4 py-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:col-span-4">Add stage</button>
          </form>
        </section>
        <section className="mt-5 rounded-lg border border-info/30 bg-info/5 p-4">
          <h3 className="text-sm font-semibold">Owner approval</h3>
          <p className="mt-1 text-xs text-muted-foreground">The configured product owner must approve the saved price, offer details, stages, and rule versions. Any later draft edit requires a new approval.</p>
          <button type="button" disabled={busy} onClick={() => void send(`/api/products/${product.id}/approve`, "POST", undefined, "Owner approval recorded for the current saved terms.")} className="mt-3 rounded border border-info/40 px-4 py-2 text-sm font-semibold text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">Approve current saved terms</button>
        </section>
        <button type="button" disabled={busy} onClick={() => void send(`/api/products/${product.id}/publish`, "POST")} className="mt-5 rounded bg-success px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Validate and publish</button>
      </>}

      {(product.status === "ACTIVE" || product.status === "UNAVAILABLE" || product.status === "DRAFT") && <div className="mt-4 flex flex-wrap gap-3">{product.status === "ACTIVE" && <button disabled={busy} onClick={() => void send(`/api/products/${product.id}/status`, "PATCH", { status: "UNAVAILABLE" })} className="rounded border px-3 py-2 text-xs font-medium">Pause offer</button>}<button type="button" disabled={busy} onClick={() => void send(`/api/products/${product.id}/status`, "PATCH", { status: "RETIRED" })} className="rounded border border-danger/30 px-3 py-2 text-xs font-medium text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Retire product</button></div>}
      {message && <p role="status" className="mt-4 whitespace-pre-wrap rounded bg-warning-light p-3 text-sm text-warning-foreground">{message}</p>}
    </article>
  );
}

export default function AdminProductsPage() {
  const [state, setState] = useState<ApiState>({ loading: true, error: "", products: [], rulesets: [] });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [productResponse, rulesetResponse] = await Promise.all([fetch("/api/admin/products"), fetch("/api/admin/rulesets")]);
      const [productData, rulesetData] = await Promise.all([productResponse.json(), rulesetResponse.json()]);
      if (!productResponse.ok || !rulesetResponse.ok || !Array.isArray(productData.products) || !Array.isArray(rulesetData.rulesets)) throw new Error("Admin product data unavailable. Confirm your admin access.");
      setState({ loading: false, error: "", products: productData.products, rulesets: rulesetData.rulesets });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Admin product data unavailable." }));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header currentPath="/admin/products" />
      <main className="mx-auto max-w-7xl p-6 sm:p-8 flex-1">
        <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="site-kicker text-emerald-400">Admin · product configuration</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Product catalog</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Offers remain drafts until their terms, stage rules, and enforcement readiness pass server validation.</p>
            </div>
            <Link href="/admin/products/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2">
              New product draft <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground"><Link href="/admin" className="text-emerald-400 underline-offset-4 hover:underline">Admin home</Link> · <Link href="/admin/rulesets" className="text-emerald-400 underline-offset-4 hover:underline">Manage rulesets</Link></p>
        </div>
        {state.error && <p role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger-light p-4 text-sm text-danger">{state.error}</p>}
        {state.loading ? <div className="mt-8 text-center"><p className="text-sm text-muted-foreground" role="status">Loading products…</p></div> : state.products.length === 0 ? <p className="mt-8 rounded-xl border border-border p-5 text-sm text-muted-foreground">No product records are available.</p> : <div className="mt-6 space-y-4">{state.products.map((product) => <DraftProductCard key={product.id} product={product} rulesets={state.rulesets} onRefresh={() => void load()} />)}</div>}
      </main>
      <SiteFooter />
    </div>
  );
}
