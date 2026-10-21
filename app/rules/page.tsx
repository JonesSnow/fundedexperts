"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight, RotateCw } from "lucide-react";
import {
  formatRuleCalculation,
  formatRuleValue,
  isPublicRulesResponse,
  ruleGroup,
  type ConfiguredRule,
  type PublicRuleset,
  type PublicRulesetsResponse,
} from "@/lib/product-experience";
import { publicApiCorrelationId } from "@/lib/public-api-error";

interface DisplayRuleset extends PublicRuleset { publishedVersion: string | null; rules: ConfiguredRule[]; loadError: boolean }

const topics = [
  { id: "overview", title: "How rules work", ruleTypes: [], description: "Each plan lists the rules for its evaluation stages. Open a plan to review its published requirements." },
  { id: "targets", title: "Profit targets", ruleTypes: ["PROFIT_TARGET"], description: "The target for each stage is shown when published. Its balance or equity reference may need clarification." },
  { id: "daily-loss", title: "Daily loss limit", ruleTypes: ["MAX_DAILY_LOSS"], description: "The daily limit is shown when published. Reset time and included trading costs may need clarification." },
  { id: "drawdown", title: "Max drawdown", ruleTypes: ["DRAWDOWN_LIMIT"], description: "The maximum loss limit is shown when published. Its reference point and whether it trails may need clarification." },
  { id: "activity", title: "Minimum trades", ruleTypes: ["MIN_TRADES"], description: "Some plans set a minimum number of trades. Check what counts and whether trading days also matter." },
  { id: "consistency", title: "Consistency & risk limits", ruleTypes: ["MAX_OPEN_TRADES"], namePattern: /consisten|risk per|exposure/i, description: "Open trade and exposure limits appear when published. Other consistency requirements may need clarification." },
  { id: "news", title: "News trading", ruleTypes: [], namePattern: /news|economic event/i, description: "News trading restrictions have not been published yet." },
  { id: "holding", title: "Overnight & weekend holding", ruleTypes: [], namePattern: /weekend|overnight|holding|market close/i, description: "Overnight and weekend holding terms have not been published yet." },
  { id: "strategies", title: "Strategies & automation", ruleTypes: [], namePattern: /copy|expert advisor|automated|arbitrage|hedg|martingale|grid|latency|scalp|signal/i, description: "Rules for copy trading, automated strategies, and other trading methods have not been published yet." },
  { id: "identity", title: "Identity & device rules", ruleTypes: [], namePattern: /identity|kyc|device|ip address|account sharing|ownership/i, description: "Email verification is part of sign-up. Other identity and device requirements have not been published yet." },
  { id: "execution", title: "Instruments & execution", ruleTypes: ["MAX_LEVERAGE", "TRADING_SESSION", "TRADING_HOURS"], description: "Instrument, leverage, trading-hour, and execution terms appear when published." },
  { id: "breaches", title: "Breaches & appeals", ruleTypes: [], namePattern: /breach|suspend|terminate|appeal|review/i, description: "A complete review and appeal policy has not been published yet." },
  { id: "glossary", title: "Glossary", ruleTypes: [], description: "Balance is account value before open trades. Equity includes open trade effects. Drawdown is a decline from a reference point." },
  { id: "applicability", title: "Rules for your plan", ruleTypes: [], description: "The rules shown with a plan apply to the stages listed for that offer." },
];

function ruleMatches(rule: ConfiguredRule, topic: (typeof topics)[number]) {
  return topic.ruleTypes.includes(rule.ruleType) || Boolean(topic.namePattern?.test(`${rule.name} ${rule.ruleType}`));
}

export default function RulesPage() {
  const [rulesets, setRulesets] = useState<DisplayRuleset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorReference, setErrorReference] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedRuleset, setSelectedRuleset] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadRules() {
      setLoading(true);
      setError("");
      setErrorReference(null);
      let responseReference: string | null = null;
      try {
        const response = await fetch("/api/rulesets", { signal: controller.signal });
        const data = (await response.json()) as Partial<PublicRulesetsResponse>;
        if (!response.ok || !data.success || !Array.isArray(data.rulesets)) {
          responseReference = publicApiCorrelationId(data);
          throw new Error("Rulesets unavailable");
        }
        const loaded = await Promise.all(data.rulesets.map(async (ruleset): Promise<DisplayRuleset> => {
          const version = ruleset.versions.find((item) => item.status === "PUBLISHED");
          if (!version) return { ...ruleset, publishedVersion: null, rules: [], loadError: false };
          try {
            const path = `/api/rulesets/${encodeURIComponent(ruleset.id)}/versions/${encodeURIComponent(version.version)}/rules`;
            const ruleResponse = await fetch(path, { signal: controller.signal });
            const ruleData: unknown = await ruleResponse.json();
            if (!ruleResponse.ok || !isPublicRulesResponse(ruleData)) throw new Error("Rules unavailable");
            return { ...ruleset, publishedVersion: version.version, rules: ruleData.rules, loadError: false };
          } catch {
            return { ...ruleset, publishedVersion: version.version, rules: [], loadError: !controller.signal.aborted };
          }
        }));
        if (!controller.signal.aborted) setRulesets(loaded);
      } catch {
        if (!controller.signal.aborted) {
          setError("Published rules could not be loaded. Please try again.");
          setErrorReference(responseReference);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadRules();
    return () => controller.abort();
  }, [retryCount]);

  const visibleRulesets = useMemo(() => rulesets.filter((ruleset) => {
    if (selectedRuleset !== "all" && selectedRuleset !== ruleset.id) return false;
    const term = search.trim().toLocaleLowerCase();
    return !term || `${ruleset.name} ${ruleset.description ?? ""} ${ruleset.rules.map((rule) => `${rule.name} ${rule.ruleType} ${formatRuleValue(rule.value)}`).join(" ")}`.toLocaleLowerCase().includes(term);
  }), [rulesets, selectedRuleset, search]);

  return (
    <div className="min-h-screen">
      <Header currentPath="/rules" />
      <main>
        <section className="site-hero">
          <div className="pointer-events-none absolute inset-0 site-dot-field opacity-50" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-20">
            <div className="relative z-10 max-w-3xl">
              <p className="site-kicker text-primary">Trading rules center</p>
              <h1 className="site-display mt-5 text-foreground">Trading Rules</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Review the published limits for each plan. Some calculations are still under review, so this page does not determine evaluation outcomes.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink href="/catalog" size="lg">Browse accounts <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
                <ButtonLink href="/how-it-works" variant="outline" size="lg">See the process</ButtonLink>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card py-8 text-foreground md:py-10">
          <div className="mx-auto grid max-w-7xl gap-6 px-5 sm:px-8 md:grid-cols-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Published rule</p><p className="mt-2 text-sm leading-6 text-muted-foreground">A value listed for a plan or stage.</p></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Details to confirm</p><p className="mt-2 text-sm leading-6 text-muted-foreground">A calculation or condition that needs more detail.</p></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Missing information</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Terms are left blank until they are published.</p></div>
          </div>
        </section>

        <div className="mx-auto grid w-full min-w-0 max-w-7xl grid-cols-1 gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-16">
          <nav aria-label="Rules sections" className="h-fit min-w-0 lg:sticky lg:top-28">
            <h2 className="text-sm font-semibold">On this page</h2>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">{topics.map((topic) => <a key={topic.id} href={`#${topic.id}`} className="shrink-0 rounded-full border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:rounded-lg">{topic.title}</a>)}</div>
            <div className="mt-6 hidden rounded-xl border border-border bg-card p-4 text-xs leading-5 text-muted-foreground lg:block">Open a plan in the catalog to review its published stage rules.</div>
          </nav>

          <div className="min-w-0">
            <section id="rulesets" aria-labelledby="rulesets-title" className="scroll-mt-28 rounded-2xl border border-border bg-card p-5 sm:p-7">
              <div className="grid gap-5 sm:grid-cols-2">
                <div><p className="site-kicker">Plan requirements</p><h2 id="rulesets-title" className="mt-3 text-2xl font-semibold tracking-tight">Published rules</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Review the requirements currently listed for each plan and stage.</p></div>
                <div className="grid gap-3"><div><label htmlFor="ruleset-filter" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Plan rules</label><select id="ruleset-filter" value={selectedRuleset} onChange={(event) => setSelectedRuleset(event.target.value)} className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="all">All plan rules</option>{rulesets.map((ruleset) => <option key={ruleset.id} value={ruleset.id}>{ruleset.name}</option>)}</select></div><div><label htmlFor="rules-search" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search rules</label><input id="rules-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Target, loss, hours…" className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div></div>
              </div>
              {loading && <p className="mt-5 text-sm text-muted-foreground" role="status" aria-live="polite">Loading published rules…</p>}
              {error && <div className="mt-5 rounded-xl border border-danger/30 bg-danger-light p-4 text-sm text-danger" role="alert"><p>{error}</p>{errorReference && <p className="mt-2 text-xs text-muted-foreground">Request reference: <code>{errorReference}</code></p>}<Button type="button" variant="ghost" className="mt-3" onClick={() => setRetryCount((count) => count + 1)}><RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />Try again</Button></div>}
              {!loading && !error && visibleRulesets.length === 0 && <p className="mt-5 rounded-xl border border-border p-4 text-sm text-muted-foreground">No published rules match this filter.</p>}
              {!loading && !error && visibleRulesets.length > 0 && <div className="mt-6 divide-y divide-border border-y border-border">{visibleRulesets.map((ruleset) => <article key={ruleset.id} id={`ruleset-${ruleset.id}`} className="scroll-mt-28 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="break-words text-lg font-semibold">{ruleset.name}</h3>{ruleset.description && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{ruleset.description}</p>}</div>{ruleset.publishedVersion ? <Badge variant="outline">Rules published</Badge> : <Badge variant="warning">Not published</Badge>}</div>
                {ruleset.loadError ? <p className="mt-3 text-sm text-danger" role="alert">The published rules could not be loaded.</p> : ruleset.rules.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">{ruleset.rules.map((rule) => <li key={rule.id} className="min-w-0 rounded-xl border border-border bg-background p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h4 className="break-words text-sm font-semibold">{rule.name}</h4><div className="flex flex-wrap gap-2"><Badge variant={rule.disposition === "UNRESOLVED" ? "warning" : "outline"}>{rule.disposition === "UNRESOLVED" ? "Details incomplete" : rule.disposition === "OPTIONAL" ? "Optional" : "Required"}</Badge><Badge variant={rule.enforcement.status === "UNSUPPORTED" ? "warning" : "outline"}>{rule.enforcement.status === "UNSUPPORTED" ? "Not verified" : rule.enforcement.status === "LIMITED" ? "Limited calculation" : "Supported calculation"}</Badge></div></div><p className="mt-1 text-xs text-muted-foreground">{ruleGroup(rule.ruleType)}</p><p className="mt-3 break-words rounded-lg bg-muted/60 p-3 font-mono text-xs">{formatRuleValue(rule.value)}</p>{rule.calculation !== null && rule.calculation !== undefined && <p className="mt-3 break-words text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">How it is measured:</span> {formatRuleCalculation(rule.calculation)}</p>}<p className="mt-3 break-words text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">{rule.enforcement.status === "UNSUPPORTED" ? "Not approved for enforcement:" : rule.enforcement.status === "LIMITED" ? "Limited enforcement:" : "Monitoring conditions:"}</span> {rule.enforcement.details}</p></li>)}</ul> : <p className="mt-3 text-sm text-warning-foreground">No rules are available for this plan yet.</p>}
              </article>)}</div>}
            </section>

            <section className="mt-10" aria-labelledby="topic-guide-title"><p className="site-kicker">Rule guide</p><h2 id="topic-guide-title" className="mt-3 text-2xl font-semibold">What each policy must make clear</h2><div className="mt-5 space-y-4">{topics.map((topic) => {
              const matching = visibleRulesets.flatMap((ruleset) => ruleset.rules.filter((rule) => ruleMatches(rule, topic)).map((rule) => ({ ruleset, rule })));
              return <article id={topic.id} key={topic.id} className="scroll-mt-28 rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="grid gap-3 sm:grid-cols-[0.65fr_1.35fr]"><h3 className="text-lg font-semibold">{topic.title}</h3><p className="text-sm leading-6 text-muted-foreground">{topic.description}</p></div>{topic.id !== "overview" && topic.id !== "glossary" && topic.id !== "applicability" && <div className="mt-4 border-t border-border pt-4">{matching.length ? <ul className="grid gap-3 sm:grid-cols-2">{matching.map(({ ruleset, rule }) => <li key={`${ruleset.id}-${rule.id}`} className="min-w-0 rounded-lg bg-muted/50 p-3"><p className="text-xs font-semibold">{ruleset.name}</p><p className="mt-1 text-sm">{rule.name}</p><p className="mt-1 break-words font-mono text-xs">{formatRuleValue(rule.value)}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{rule.enforcement.details}</p></li>)}</ul> : <p className="text-xs leading-5 text-warning-foreground">No rule has been published for this topic yet.</p>}</div>}</article>;
            })}</div></section>

            <section className="mt-10 rounded-xl border border-border bg-card p-6 sm:p-8"><p className="site-kicker text-primary">Choose with confidence</p><h2 className="mt-3 text-2xl font-semibold">Review each plan&apos;s published rules.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Missing terms are clearly marked and are not assumed.</p><div className="mt-5 flex flex-wrap gap-3"><ButtonLink href="/catalog">Browse plans <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink><ButtonLink href="/faq" variant="outline">Common questions</ButtonLink><Link href="/how-it-works" className="inline-flex min-h-10 items-center px-3 text-sm font-semibold text-primary underline underline-offset-4">How the process works</Link></div></section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
