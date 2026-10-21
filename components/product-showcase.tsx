"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, RotateCw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useHomeCatalogPublisher } from "@/components/home-catalog-context";
import {
  ACCOUNT_PATHWAYS,
  type AccountPathwayId,
  type CatalogProduct,
  type ConfiguredRule,
  type ProductRules,
  formatAccountSize,
  formatMoney,
  formatRuleValue,
  isPublicProductsResponse,
  pathwayIdForCategory,
  structureKey,
  ruleGroup,
} from "@/lib/product-experience";
import { categoryLabel, structureLabel } from "@/lib/product-domain";
import { publicApiCorrelationId } from "@/lib/public-api-error";

interface Props {
  compact?: boolean;

  purchaseUnavailable?: boolean;
}

const UNAVAILABLE_TERMS = [
  "Daily loss reset time and calculation method",
  "Drawdown reference point and treatment of open trades and fees",
  "Minimum trading days and inactivity policy",
  "News, weekend, and strategy restrictions",
  "Trading instruments, platform, and execution terms",
  "Refund, reset, retry, and payout terms",
];

function StageRules({ stageName, rulesetId, rules }: {
  stageName: string;
  rulesetId: string;
  rules: ConfiguredRule[];
}) {
  const groups = rules.reduce<Record<string, ConfiguredRule[]>>((result, rule) => {
    const group = ruleGroup(rule.ruleType);
    result[group] = [...(result[group] ?? []), rule];
    return result;
  }, {});
  return (
    <section className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{stageName}</h4>
        <Badge variant="success">Rules published</Badge>
      </div>
      <Link href={`/rules#ruleset-${encodeURIComponent(rulesetId)}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline">Open rules center <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
              {rules.length === 0 ? <p className="mt-2 text-xs text-warning-foreground">No rules are published for this stage.</p> : <div className="mt-3 space-y-3">{Object.entries(groups).map(([group, groupedRules]) => <section key={group}><h5 className="text-sm font-semibold">{group}</h5><dl className="mt-2 divide-y divide-border border-y border-border">{groupedRules.map((rule) => <div key={rule.id} className="grid gap-1 py-2 sm:grid-cols-[1fr_1fr] sm:gap-4"><div><dt className="text-muted-foreground">{rule.name}{rule.disposition === "OPTIONAL" && <span className="ml-2 text-xs text-muted-foreground">Optional</span>}{rule.disposition === "UNRESOLVED" && <span className="ml-2 text-xs text-warning-foreground">Details incomplete</span>}</dt><dd className="mt-1 break-words font-medium"><code className="whitespace-pre-wrap break-all font-mono text-xs">{formatRuleValue(rule.value)}</code></dd></div><dd className="text-xs text-muted-foreground sm:text-right"><span className={`font-semibold ${rule.enforcement.status === "UNSUPPORTED" ? "text-warning-foreground" : "text-foreground"}`}>{rule.enforcement.status === "UNSUPPORTED" ? "Not enforced" : rule.enforcement.status === "LIMITED" ? "Limited enforcement" : "Enforcement conditions"}</span><span className="mt-1 block">{rule.enforcement.details}</span></dd></div>)}</dl></section>)}</div>}
    </section>
  );
}

function getProductCategoryName(product: CatalogProduct): string {
  return categoryLabel(product.category);
}

function summarizeStageRules(match: ProductRules | undefined, ruleType: string): string {
  if (!match) return "Details unavailable";
  const values = match.stages.flatMap((stage) =>
    stage.rulesetVersion.rules
      .filter((rule) => rule.ruleType === ruleType)
      .map((rule) => `${stage.displayName}: ${formatRuleValue(rule.value)}`),
  );
  return values.length > 0 ? values.join(" · ") : "Not published";
}

export default function ProductShowcase({ compact = false, purchaseUnavailable = false }: Props) {
  const publishHomeCatalog = useHomeCatalogPublisher();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productRules, setProductRules] = useState<Record<string, ProductRules>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorReference, setErrorReference] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [category, setCategory] = useState<"all" | AccountPathwayId | "other">("all");
  const [size, setSize] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [structure, setStructure] = useState("all");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("catalog");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      setLoading(true);
      setError("");
      setErrorReference(null);
      let responseReference: string | null = null;
      try {
        const productsResponse = await fetch("/api/products", { cache: "no-store", signal: controller.signal });
        const productsData: unknown = await productsResponse.json();
        if (!productsResponse.ok || !isPublicProductsResponse(productsData)) {
          responseReference = publicApiCorrelationId(productsData);
          throw new Error("Product list unavailable");
        }
        const activeProducts = productsData.products.filter((product) => product.isActive && product.status === "ACTIVE");
        if (!controller.signal.aborted) {
          setProducts(activeProducts);
          const byProductId: Record<string, ProductRules> = {};
          for (const product of activeProducts) {
            byProductId[product.id] = {
              productId: product.id,
              stages: product.stages,
              operatingRulesetVersion: product.operatingRulesetVersion,
              unavailable: product.stages.some((stage) => stage.rulesetVersion.status !== "PUBLISHED" || stage.rulesetVersion.rules.length === 0),
            };
          }
          setProductRules(byProductId);
          publishHomeCatalog({
            products: activeProducts,
            rulesByProductId: byProductId,
            loading: false,
            productUnavailable: false,
            rulesUnavailable: Object.values(byProductId).some((rules) => rules.unavailable),
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("We couldn't load plan details. Please try again.");
          setErrorReference(responseReference);
          publishHomeCatalog({
            products: [],
            rulesByProductId: {},
            loading: false,
            productUnavailable: true,
            rulesUnavailable: true,
          });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadCatalog();
    return () => controller.abort();
  }, [publishHomeCatalog, retryCount]);

  const sizes = useMemo(() => {
    const values = new Set(products.flatMap((product) => product.accountSize === null ? [] : [String(product.accountSize)]));
    return [...values].sort((left, right) => Number(left) - Number(right));
  }, [products]);
  const currencies = useMemo(() => [...new Set(products.map((product) => product.currency).filter(Boolean))].sort(), [products]);
  const activePriceCurrency = currencyFilter !== "all" ? currencyFilter : currencies.length === 1 ? currencies[0] : "all";

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const minimum = minimumPrice === "" ? null : Number(minimumPrice);
    const maximum = maximumPrice === "" ? null : Number(maximumPrice);
    const result = products.filter((product) => {
      const productCategory = pathwayIdForCategory(product.category);
      if (category === "other" ? productCategory !== "other" : category !== "all" && productCategory !== category) return false;
      if (size !== "all" && String(product.accountSize) !== size) return false;
      if (currencyFilter !== "all" && product.currency !== currencyFilter) return false;
      if (structure !== "all" && structureKey(product.evaluationStructure) !== structure) return false;
      const price = product.price === null ? null : Number(product.price);
      if ((minimum !== null || maximum !== null) && activePriceCurrency === "all") return false;
      if (minimum !== null && (price === null || !Number.isFinite(price) || price < minimum)) return false;
      if (maximum !== null && (price === null || !Number.isFinite(price) || price > maximum)) return false;
      const rulesetNames = [...product.stages.map((stage) => stage.rulesetVersion.ruleset.name), ...(product.operatingRulesetVersion ? [product.operatingRulesetVersion.ruleset.name] : [])].join(" ");
      if (query && !`${product.name} ${product.description ?? ""} ${rulesetNames}`.toLocaleLowerCase().includes(query)) return false;
      return true;
    });
    if (sort === "price" && activePriceCurrency !== "all") result.sort((left, right) => Number(left.price ?? Infinity) - Number(right.price ?? Infinity));
    if (sort === "size") result.sort((left, right) => Number(left.accountSize ?? Infinity) - Number(right.accountSize ?? Infinity));
    return result;
  }, [products, category, size, currencyFilter, activePriceCurrency, structure, minimumPrice, maximumPrice, search, sort]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
        {[0, 1].slice(0, compact ? 2 : 2).map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl border border-border bg-card" />)}
        <span className="sr-only" role="status" aria-live="polite">Loading plans…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger-light p-5 text-sm text-danger" role="alert">
        <p>{error}</p>
        {errorReference && <p className="mt-2 text-xs text-muted-foreground">Request reference: <code>{errorReference}</code></p>}
        <Button type="button" variant="ghost" className="mt-3" onClick={() => setRetryCount((count) => count + 1)}><RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />Try again</Button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm font-medium text-card-foreground">No plans are available right now.</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Published plan details will appear here when they are available.</p>
      </div>
    );
  }

  const shownProducts = compact ? products.slice(0, 2) : visibleProducts;

  return (
    <div>
      {!compact && (
        <div id="catalog" className="mb-7 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="catalog-category" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Account pathway</label>
              <select id="catalog-category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="all">All configured products</option>
                {ACCOUNT_PATHWAYS.map((pathway) => <option key={pathway.id} value={pathway.id}>{pathway.name}</option>)}
                <option value="other">Other or unclassified</option>
              </select>
            </div>
            <div>
              <label htmlFor="catalog-size" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Account size</label>
              <select id="catalog-size" value={size} onChange={(event) => setSize(event.target.value)} className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="all">All sizes</option>
                {sizes.map((value) => <option key={value} value={value}>{formatAccountSize(value)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="catalog-structure" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Evaluation structure</label>
              <select id="catalog-structure" value={structure} onChange={(event) => setStructure(event.target.value)} className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="all">Any stated structure</option>
                <option value="none">No evaluation stated</option>
                <option value="1">1 stage</option><option value="2">2 stages</option><option value="3">3 stages</option><option value="4">4 stages</option><option value="unknown">Not stated</option>
              </select>
            </div>
            <div>
              <label htmlFor="catalog-currency" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Price currency</label>
              <select id="catalog-currency" value={currencyFilter} onChange={(event) => { setCurrencyFilter(event.target.value); if (event.target.value === "all" && currencies.length > 1) { setMinimumPrice(""); setMaximumPrice(""); setSort("catalog"); } }} className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="all">{currencies.length > 1 ? "All currencies" : currencies[0] || "Currency not set"}</option>
                {currencies.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="catalog-search" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search catalog</label>
              <input id="catalog-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, description, ruleset" className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>
          <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="catalog-min-price" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Minimum price {activePriceCurrency !== "all" ? `(${activePriceCurrency})` : "(choose one currency)"}</label>
              <input id="catalog-min-price" type="number" min="0" step="0.01" inputMode="decimal" disabled={activePriceCurrency === "all"} value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} placeholder="No minimum" className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label htmlFor="catalog-max-price" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Maximum price {activePriceCurrency !== "all" ? `(${activePriceCurrency})` : "(choose one currency)"}</label>
              <input id="catalog-max-price" type="number" min="0" step="0.01" inputMode="decimal" disabled={activePriceCurrency === "all"} value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} placeholder="No maximum" className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label htmlFor="catalog-sort" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Sort</label>
              <select id="catalog-sort" value={sort} onChange={(event) => setSort(event.target.value)} className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="catalog">Catalog order</option><option value="price" disabled={activePriceCurrency === "all"}>Price, low to high</option><option value="size">Size, small to large</option>
              </select>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground" role="status">Showing {visibleProducts.length} of {products.length} plans. Price filters compare one currency at a time.</p>
        </div>
      )}

      <div className={compact ? (shownProducts.length === 1 ? "grid gap-3" : "grid gap-3 sm:grid-cols-2") : "grid gap-5 sm:grid-cols-2 xl:grid-cols-3"}>
        {shownProducts.map((product, index) => {
          const match = productRules[product.id];
          return (
            <article id={`product-${product.id}`} key={product.id} className="flex min-w-0 flex-col rounded-xl border border-card-border bg-card p-5 text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Plan details</p><p className="mt-1 text-xs text-muted-foreground">{getProductCategoryName(product)}</p></div>
                <Badge variant="outline">{String(index + 1).padStart(2, "0")}</Badge>
              </div>
              <h3 className="mt-5 break-words text-xl font-semibold leading-tight tracking-tight">{product.name}</h3>
              <p className="mt-2 min-h-10 break-words text-sm leading-5 text-muted-foreground">{product.description || "Plan details will be published here."}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-border py-4 text-sm">
                <div className="min-w-0"><dt className="text-xs text-muted-foreground">Account size · {product.denominationCurrency}</dt><dd className="mt-1 break-words font-semibold">{formatAccountSize(product.accountSize)} {product.denominationCurrency}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-muted-foreground">Price{product.currency ? ` · ${product.currency}` : ""}</dt><dd className="mt-1 break-words font-semibold">{formatMoney(product.price, product.currency)}</dd></div>
                <div className="col-span-2 min-w-0"><dt className="text-xs text-muted-foreground">Evaluation structure</dt><dd className="mt-1 break-words font-medium">{structureLabel(product.evaluationStructure)}</dd></div>
                <div className="col-span-2 min-w-0"><dt className="text-xs text-muted-foreground">Evaluation stages</dt><dd className="mt-1 break-words font-medium">{product.stages.map((stage) => stage.displayName).join(" · ") || "No stages published"}</dd></div>
              </dl>

              <dl className="mt-4 grid gap-x-4 gap-y-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-2">
                {[
                  ["Profit target", "PROFIT_TARGET"],
                  ["Daily loss limit", "MAX_DAILY_LOSS"],
                  ["Maximum loss limit", "DRAWDOWN_LIMIT"],
                ].map(([label, ruleType]) => (
                  <div key={ruleType} className="min-w-0">
                    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words text-sm leading-5 text-card-foreground">{summarizeStageRules(match, ruleType)}</dd>
                  </div>
                ))}
              </dl>
              {match?.unavailable && <p className="mt-3 text-xs leading-5 text-warning-foreground">One or more published rule details are unavailable for this plan.</p>}

              {!compact && (
                <details className="mt-4 rounded-xl border border-border bg-background p-4">
                  <summary className="cursor-pointer rounded-sm text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Full product terms and rule values</summary>
                  <div className="mt-4 space-y-5 text-sm">
                    <p className="text-xs leading-5 text-muted-foreground">Published rules and stage details for this plan.</p>
                    {match?.unavailable ? <p className="text-warning-foreground" role="status">Some rule details are missing. Review the published terms before relying on this plan.</p> : match ? (
                      <div className="space-y-5">
                        {match.stages.map((stage) => <StageRules key={stage.id} stageName={stage.displayName} rulesetId={stage.rulesetVersion.ruleset.id} rules={stage.rulesetVersion.rules} />)}
                        {match.operatingRulesetVersion && <StageRules stageName="Ongoing rules" rulesetId={match.operatingRulesetVersion.ruleset.id} rules={match.operatingRulesetVersion.rules} />}
                        <p className="text-xs leading-5 text-warning-foreground">Some rule calculations are still under review. Do not use this page as a final pass or fail decision.</p>
                      </div>
                    ) : <p className="text-warning-foreground">Plan rules are not available yet.</p>}
                    <div><h4 className="font-semibold">Other plan terms</h4><p className="mt-2 text-xs leading-5 text-muted-foreground">These details have not been published yet:</p><ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">{UNAVAILABLE_TERMS.map((term) => <li key={term}>{term}</li>)}</ul></div>
                  </div>
                </details>
              )}

              {!purchaseUnavailable && !compact && (
                <ButtonLink href={"/catalog#product-" + encodeURIComponent(product.id)} variant="outline" fullWidth className="mt-auto mt-5 justify-between">
                  View product terms <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </ButtonLink>
              )}
              {compact && <Link href="/catalog" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline">See all configured offers <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
            </article>
          );
        })}
      </div>
      {!compact && visibleProducts.length === 0 && <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No active products match these filters. Adjust the category, size, structure, price, or search terms.</p>}
      {compact && products.length > shownProducts.length && <p className="mt-4 text-xs text-muted-foreground">Showing the first {shownProducts.length} configured entries. View the catalog for all active plans.</p>}
    </div>
  );
}
