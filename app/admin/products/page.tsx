'use client';

import Link from "next/link";
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

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json();
      if (!response.ok) {
        setMessage([result.error, ...(Array.isArray(result.errors) ? result.errors : [])].filter(Boolean).join("\n"));
        return false;
      }
      setMessage(result.success ? "Saved." : "Request completed.");
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
          {product.stages.length > 0 ? <ol className="mt-2 space-y-2 text-sm">{product.stages.map((stage) => <li key={stage.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-background px-3 py-2"><span>{stage.stageOrder}. {stage.displayName} · {stage.rulesetVersion.ruleset.name} v{stage.rulesetVersion.version} ({stage.rulesetVersion.status})</span><button type="button" disabled={busy} onClick={() => void send(`/api/products/${product.id}/stages/${stage.id}`, "DELETE")} className="text-xs text-danger underline disabled:opacity-50">Remove draft stage</button></li>)}</ol> : <p className="mt-2 text-xs text-muted-foreground">No evaluation stages configured.</p>}
          <form className="mt-3 grid gap-2 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void send(`/api/products/${product.id}/stages`, "POST", { stageKey, displayName: stageName, stageOrder: Number(stageOrder), rulesetVersionId: versionId }); }}>
            <label className="text-xs font-medium">Stage key<input required value={stageKey} onChange={(event) => setStageKey(event.target.value)} placeholder="stage-1" className="mt-1 w-full rounded border px-2 py-2 text-sm" /></label>
            <label className="text-xs font-medium">Display name<input required value={stageName} onChange={(event) => setStageName(event.target.value)} placeholder="Stage 1" className="mt-1 w-full rounded border px-2 py-2 text-sm" /></label>
            <label className="text-xs font-medium">Order<input required type="number" min="1" step="1" value={stageOrder} onChange={(event) => setStageOrder(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-sm" /></label>
            <label className="text-xs font-medium">Ruleset version<select required value={versionId} onChange={(event) => setVersionId(event.target.value)} className="mt-1 w-full rounded border px-2 py-2 text-sm"><option value="">Select version</option>{versions.map((version) => <option key={version.id} value={version.id}>{version.rulesetName} v{version.version} · {version.status}</option>)}</select></label>
            <button disabled={busy} className="w-fit rounded border border-primary/40 px-4 py-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:col-span-4">Add stage</button>
          </form>
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
    <main className="mx-auto max-w-6xl p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-info">Admin · product configuration</p><h1 className="mt-2 text-3xl font-bold">Product catalog</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Offers remain drafts until their terms, stage rules, and enforcement readiness pass server validation.</p></div><Link href="/admin/products/new" className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">New product draft</Link></div>
      <p className="mt-4"><Link href="/admin" className="text-sm text-info underline">Admin home</Link> · <Link href="/admin/rulesets" className="text-sm text-info underline">Manage rulesets</Link></p>
      {state.error && <p role="alert" className="mt-5 rounded bg-danger-light p-4 text-sm text-danger">{state.error}</p>}
      {state.loading ? <p role="status" className="mt-8 text-sm text-muted-foreground">Loading products…</p> : state.products.length === 0 ? <p className="mt-8 rounded border p-5 text-sm text-muted-foreground">No product records are available.</p> : <div className="mt-6 space-y-4">{state.products.map((product) => <DraftProductCard key={product.id} product={product} rulesets={state.rulesets} onRefresh={() => void load()} />)}</div>}
    </main>
  );
}
