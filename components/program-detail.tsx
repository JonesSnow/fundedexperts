"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, RotateCw } from "lucide-react";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { publicApiCorrelationId } from "@/lib/public-api-error";
import {
  formatAccountSize,
  formatMoney,
  formatRuleCalculation,
  formatRuleValue,
  isPublicProductsResponse,
  ruleGroup,
  type CatalogProduct,
} from "@/lib/product-experience";

interface Props { productId: string }

export default function ProgramDetail({ productId }: Props) {
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProduct() {
      setLoading(true);
      setProduct(null);
      setError("");
      setReference(null);
      setNotFound(false);
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, { cache: "no-store", signal: controller.signal });
        const data: unknown = await response.json();
        if (response.status === 404) {
          if (!controller.signal.aborted) setNotFound(true);
          return;
        }
        if (!response.ok || data === null || typeof data !== "object" || !("product" in data) || !isPublicProductsResponse({ success: true, products: [data.product] })) {
          if (data !== null && typeof data === "object") setReference(publicApiCorrelationId(data));
          throw new Error("Program details unavailable");
        }
        if (!controller.signal.aborted) setProduct(data.product as CatalogProduct);
      } catch {
        if (!controller.signal.aborted) setError("Program details could not be loaded. Try again in a moment.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadProduct();
    return () => controller.abort();
  }, [productId, retryCount]);

  const title = loading ? "Loading program" : notFound ? "Program unavailable" : product?.name ?? "Program details";

  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPath="/catalog" />
      <main className="flex-1">
        <section className="site-hero">
          <div className="relative mx-auto max-w-7xl px-5 py-12 sm:px-8 md:py-16">
            <Link href="/catalog" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to programs</Link>
            <p className="site-kicker mt-6">Published program</p>
            <h1 className="site-display mt-3 text-foreground">{title}</h1>
          </div>
        </section>
        <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 md:py-14">
          {loading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">{[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl border border-border bg-card" />)}<p className="sr-only" role="status">Loading program details</p></div>}
          {error && <div className="max-w-2xl rounded-xl border border-danger/30 bg-danger-light p-5 text-sm text-danger" role="alert"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{error}</p></div>{reference && <p className="mt-2 text-xs text-muted-foreground">Request reference: <code>{reference}</code></p>}<Button type="button" variant="ghost" className="mt-3" onClick={() => setRetryCount((count) => count + 1)}><RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />Try again</Button></div>}
          {!loading && !error && notFound && <section className="max-w-2xl rounded-2xl border border-border bg-card p-6" role="status"><h2 className="text-lg font-semibold">This program is not currently available.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">It may be unpublished, incomplete, or no longer offered. Only currently published programs can be displayed here.</p><ButtonLink href="/catalog" className="mt-5">Return to the catalog</ButtonLink></section>}
          {!loading && !error && product && <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Program summary">
              {[
                ["Simulated account size", `${formatAccountSize(product.accountSize)} ${product.denominationCurrency}`],
                ["Program fee", product.price === null ? "Not published" : formatMoney(product.price, product.currency)],
                ["Evaluation structure", product.evaluationStructure.replace(/_/g, " ").toLocaleLowerCase()],
                ["Stage count", `${product.stages.length} published stage${product.stages.length === 1 ? "" : "s"}`],
              ].map(([label, value]) => <article key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 break-words font-mono text-lg font-semibold tabular-nums text-foreground">{value}</p></article>)}
            </section>
            {product.description && <p className="mt-6 max-w-3xl text-sm leading-7 text-muted-foreground">{product.description}</p>}
            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <section aria-labelledby="stage-rules-title">
                <p className="site-kicker">Applicable terms</p>
                <h2 id="stage-rules-title" className="mt-3 text-2xl font-semibold">Published stages and rules</h2>
                <div className="mt-5 space-y-4">
                  {product.stages.map((stage) => <article key={stage.id} className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stage {stage.stageOrder}</p><h3 className="mt-1 text-lg font-semibold">{stage.displayName}</h3></div><Badge variant="outline">Rules v{stage.rulesetVersion.version}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{stage.rulesetVersion.ruleset.name}</p>{stage.rulesetVersion.rules.length ? <ul className="mt-4 divide-y divide-border border-y border-border">{stage.rulesetVersion.rules.map((rule) => <li key={rule.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(9rem,0.45fr)_1fr] sm:gap-5"><div><h4 className="text-sm font-semibold">{rule.name}</h4><p className="mt-1 text-xs text-muted-foreground">{ruleGroup(rule.ruleType)} · {rule.disposition === "OPTIONAL" ? "Optional" : rule.disposition === "UNRESOLVED" ? "Details incomplete" : "Required"}</p></div><div><p className="break-words rounded-lg bg-muted/60 p-3 font-mono text-xs">{formatRuleValue(rule.value)}</p>{rule.calculation !== null && rule.calculation !== undefined && <p className="mt-2 break-words text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Calculation:</span> {formatRuleCalculation(rule.calculation)}</p>}<p className="mt-2 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Enforcement:</span> {rule.enforcement.details}</p></div></li>)}</ul> : <p className="mt-4 text-sm text-warning-foreground" role="status">No rule values are published for this stage.</p>}</article>)}
                  {product.operatingRulesetVersion && <article className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h3 className="text-lg font-semibold">Ongoing rules</h3><p className="mt-1 text-xs text-muted-foreground">{product.operatingRulesetVersion.ruleset.name} · version {product.operatingRulesetVersion.version}</p><ul className="mt-4 divide-y divide-border border-y border-border">{product.operatingRulesetVersion.rules.map((rule) => <li key={rule.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(9rem,0.45fr)_1fr] sm:gap-5"><div><h4 className="text-sm font-semibold">{rule.name}</h4><p className="mt-1 text-xs text-muted-foreground">{ruleGroup(rule.ruleType)}</p></div><div><p className="break-words rounded-lg bg-muted/60 p-3 font-mono text-xs">{formatRuleValue(rule.value)}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{rule.enforcement.details}</p></div></li>)}</ul></article>}
                </div>
              </section>
              <aside className="h-fit space-y-4 lg:sticky lg:top-28">
                <section className="rounded-2xl border border-warning/30 bg-warning-light p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-warning-foreground">Purchase unavailable</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Viewing these terms does not create an order, confirm payment, or allocate an account. Checkout is not currently enabled.</p></section>
                <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Before you begin</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Trading and account balances are simulated. Some calculations and additional conditions may remain unavailable or under review.</p><Link href="/risk-disclosure" className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">Read the simulation disclosure</Link></section>
                <ButtonLink href="/rules" variant="outline" fullWidth>Open the rules center</ButtonLink>
              </aside>
            </div>
          </>}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
