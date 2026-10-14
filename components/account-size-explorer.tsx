"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { useHomeCatalogSnapshot } from "@/components/home-catalog-context";
import { formatAccountSize, formatMoney, formatRuleValue, ruleGroup } from "@/lib/product-experience";
import { categoryLabel, structureLabel } from "@/lib/product-domain";

export default function AccountSizeExplorer() {
  const [selectedId, setSelectedId] = useState("");
  const { products, rulesByProductId, loading, productUnavailable, rulesUnavailable } = useHomeCatalogSnapshot();
  const selected = products.find((product) => product.id === selectedId) ?? products[0];
  const selectedRules = selected ? rulesByProductId[selected.id] : undefined;

  return (
    <section aria-labelledby="account-size-explorer-title" className="relative overflow-hidden bg-primary-light">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 md:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <p className="site-kicker">Choose by configuration</p>
          <h2 id="account-size-explorer-title" className="site-section-title mt-5">See the size and terms attached to each offer.</h2>
          <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground">This selector uses the same active product, denomination currency, and stage-specific published rules as the offer cards.</p>
        </div>
        <div className="min-w-0 rounded-[1.5rem] border border-border bg-card p-5 shadow-sm sm:p-7">
          {loading ? <p role="status" className="text-sm text-muted-foreground">Loading active configurations…</p> : productUnavailable ? <div role="alert"><p className="text-sm text-danger">The active catalog could not be loaded.</p><Link href="/catalog" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold underline">Open catalog <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div> : products.length === 0 ? <div><p className="font-semibold">No active product sizes are configured.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Proposed size ladders are not shown as purchasable offers.</p><ButtonLink href="/catalog" variant="outline" className="mt-5">Check the catalog</ButtonLink></div> : (
            <>
              <label htmlFor="home-account-size" className="mb-2 block text-sm font-semibold">Select an active product</label>
              <select id="home-account-size" value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} className="w-full min-w-0 rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {formatAccountSize(product.accountSize)} · {formatMoney(product.price, product.currency)}</option>)}
              </select>
              {selected && <div className="mt-6">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{categoryLabel(selected.category)}</p><h3 className="mt-2 break-words text-2xl font-semibold tracking-tight">{selected.name}</h3></div>
                  <span className="max-w-full break-words rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{selected.code}</span>
                </div>
                <dl className="grid gap-4 py-5 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-muted-foreground">Configured account size</dt><dd className="mt-1 font-semibold">{formatAccountSize(selected.accountSize)} {selected.denominationCurrency}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Configured entry price</dt><dd className="mt-1 font-semibold">{formatMoney(selected.price, selected.currency)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Configured structure</dt><dd className="mt-1 font-semibold">{structureLabel(selected.evaluationStructure)}</dd></div>
                </dl>
                <section aria-labelledby="home-selected-rules-title" className="border-t border-border pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 id="home-selected-rules-title" className="font-semibold">Published rules for this offer</h4>
                    {selected.stages.length > 0 && <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">{selected.stages.length} stage-specific versions</span>}
                  </div>
                  {!selectedRules ? <p className="mt-3 text-sm text-warning-foreground">{rulesUnavailable ? "Published rule values could not be loaded. Product conditions remain incomplete." : "Product-specific rules are not available."}</p>
                    : selectedRules.unavailable ? <p className="mt-3 text-sm text-warning-foreground">Published rule values could not be loaded. Product conditions remain incomplete.</p>
                    : <div className="mt-3 space-y-4">{selectedRules.stages.map((stage) => <section key={stage.id}><h5 className="font-semibold">{stage.displayName} · {stage.rulesetVersion.ruleset.name} v{stage.rulesetVersion.version}</h5><dl className="mt-2 divide-y divide-border border-y border-border">{stage.rulesetVersion.rules.map((rule) => <div key={rule.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_1fr] sm:gap-4"><dt className="text-sm text-muted-foreground">{ruleGroup(rule.ruleType)} · {rule.name} <span className="text-xs">({rule.disposition.toLocaleLowerCase()})</span></dt><dd className="break-words font-medium sm:text-right"><code className="whitespace-pre-wrap break-all font-mono text-xs">{formatRuleValue(rule.value)}</code></dd></div>)}</dl></section>)}{selectedRules.operatingRulesetVersion && <section><h5 className="font-semibold">Operating rules · {selectedRules.operatingRulesetVersion.ruleset.name} v{selectedRules.operatingRulesetVersion.version}</h5>{selectedRules.operatingRulesetVersion.rules.map((rule) => <p key={rule.id} className="mt-2 text-xs">{rule.name}: {formatRuleValue(rule.value)}</p>)}</section>}</div>}
                </section>
                <p className="text-xs leading-5 text-muted-foreground">Calculation definitions accompany configured rules where available. Published configuration alone does not prove reliable enforcement.</p>
                <div className="mt-5 flex flex-wrap gap-3"><ButtonLink href={`/catalog#product-${encodeURIComponent(selected.id)}`}>Review full product <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink><ButtonLink href="/rules" variant="outline">Read rules</ButtonLink></div>
              </div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
