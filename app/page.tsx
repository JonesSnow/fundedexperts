import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import Header from "@/components/header";
import ProductShowcase from "@/components/product-showcase";
import { HomeCatalogProvider } from "@/components/home-catalog-context";
import SiteFooter from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Funded Experts | Trading Evaluation Programs",
  description: "Review simulated trading evaluation programs, published objectives, risk limits, and rules before enrollment.",
  openGraph: {
    title: "Funded Experts | Trading Evaluation Programs",
    description: "Review simulated evaluation programs and their published rules.",
  },
};

const processSteps = [
  { title: "Program specification", description: "Confirm the simulated balance, enrollment fee, evaluation structure, and the rule version attached to the offer." },
  { title: "Stage objectives", description: "Review each stage's performance target, minimum activity requirement, and criteria for progression." },
  { title: "Risk parameters", description: "Understand how daily loss and maximum drawdown are calculated, including the reference balance and reset time." },
  { title: "Operating terms", description: "Check eligible instruments, trading hours, platform access, restrictions, and how decisions can be reviewed." },
];

const questions = [
  { question: "What is Funded Experts?", answer: "A platform for exploring simulated trading evaluations and their published rules." },
  { question: "Are evaluation accounts live?", answer: "No. Evaluation balances and trading activity are simulated. They are not deposits, live brokerage capital, or withdrawable funds." },
  { question: "How is an evaluation assessed?", answer: "Each published program identifies its stages and rules. Enrollment and evaluation access are not currently available." },
  { question: "How are rule breaches handled?", answer: "Outcomes depend on the applicable rule version. Evaluation monitoring and enforcement are not yet verified for customer use." },
  { question: "How can I verify my email?", answer: "Create an account and enter the six-digit code sent to your email. Delivery depends on email service availability." },
  { question: "Are payments and payouts available?", answer: "Purchases and payout requests are not available yet." },
];

const standards = [
  { title: "One governing rule version", description: "An evaluation offer should identify the exact rules that govern its stages, so requirements are not left to interpretation." },
  { title: "Risk limits with a method", description: "A percentage alone is not enough. The terms should define the loss baseline, reset schedule, and treatment of open positions and costs." },
  { title: "Status tied to recorded events", description: "Progress should reflect verifiable account activity and the rules in effect, not an unconfirmed message or estimate." },
  { title: "Simulation stated clearly", description: "Evaluation balances and activity are simulated. They are not customer deposits, live brokerage capital, or guaranteed earnings." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Header currentPath="/" />
      <HomeCatalogProvider>
        <main>
          <section className="site-hero-dark grid-pattern-dark relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 site-dot-field opacity-50" aria-hidden="true" />
            <div className="absolute inset-0 -z-10">
              <div className="absolute -top-24 -right-24 w-[560px] h-[220px] rounded-full bg-emerald-600/15 blur-[80px]" aria-hidden="true" />
              <div className="absolute -bottom-24 -left-24 w-[480px] h-[220px] bg-emerald-700/10 blur-[80px]" aria-hidden="true" />
            </div>
            <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-32">
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-400 text-xs font-semibold tracking-tighter uppercase mb-6">
                  <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                  Evaluation programs · Simulated trading
                </div>
                <h1 className="site-display mt-6 max-w-3xl text-paper-50">
                  A disciplined evaluation, with rules defined up front.
                </h1>
                <p className="mt-7 max-w-xl text-base leading-7 text-paper-50/70 sm:text-lg sm:leading-8">
                  A professional evaluation framework starts with clear stage objectives, defined risk limits, and terms you can review before enrollment.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <ButtonLink href="/catalog" size="lg">View evaluation programs <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
                  <ButtonLink href="/how-it-works" variant="outline" size="lg">How It Works</ButtonLink>
                </div>
                <Link href="/risk-disclosure" className="mt-4 inline-flex min-h-9 items-center text-sm font-medium text-paper-50/75 underline decoration-paper-50/35 underline-offset-4 transition-colors hover:text-emerald-400 hover:decoration-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                  What simulated trading means
                </Link>
                <p className="mt-6 max-w-xl text-xs leading-5 text-paper-50/75">
                  Evaluation activity uses simulated funds. A result does not guarantee a reward or access to a live brokerage account.
                </p>
              </div>
              {/* Signature 3D visual: emerald glass sphere + interlocking rings */}
              <div className="hero-visual relative z-20">
                <div className="glass-sphere" aria-label="Growth visual identity" />
                <div className="ring-system" aria-hidden="true">
                  <div className="ring ring-inner" />
                  <div className="ring ring-middle" />
                  <div className="ring ring-outer" />
                  <div className="orbital-dot" aria-hidden="true" />
                </div>
                <div className="glow-plane" aria-hidden="true" />
              </div>
            </div>
          </section>

          <section id="how-it-works" className="scroll-mt-24 border-b border-border">
            <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-20">
              <div className="max-w-2xl">
                <p className="site-kicker">How it works</p>
                  <h2 className="site-section-title mt-4">The terms every trader should review</h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">An evaluation is more than a target. Compare the complete specification before deciding whether a program fits your trading approach.</p>
              </div>
              <ol className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {processSteps.map((step, index) => (
                  <li key={step.title} className="group min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-md sm:p-6">
                    <span className="font-mono text-xs font-semibold tracking-widest text-emerald-400">0{index + 1} <span className="ml-2 text-muted-foreground">/ SPECIFICATION</span></span>
                    <h3 className="mt-5 text-lg font-semibold tracking-tight">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-4 sm:px-5">
                <p className="text-sm font-medium text-paper-50">Enrollment and simulated trading access are not currently available.</p>
                <Link href="/how-it-works" className="inline-flex min-h-10 shrink-0 items-center gap-2 text-sm font-semibold text-emerald-400 hover:underline">
                  See the evaluation process <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>

          <section id="plans" className="scroll-mt-24">
            <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-20">
              <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-2xl">
                  <p className="site-kicker">Evaluation programs</p>
                  <h2 className="site-section-title mt-4">Program specifications, published clearly</h2>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">Only programs with approved balances, fees, stages, and applicable rules appear in the catalog.</p>
                </div>
                <ButtonLink href="/catalog#configured-products" variant="outline">Check offer availability <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
              </div>
              <ProductShowcase compact />
            </div>
          </section>

          <section className="border-y border-border bg-card">
            <div className="mx-auto grid max-w-7xl gap-9 px-5 py-16 sm:px-8 md:grid-cols-[0.85fr_1.15fr] md:py-20">
              <div>
                <p className="site-kicker">Evaluation standards</p>
                <h2 className="site-section-title mt-4">Clear terms are part of risk management.</h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">Before enrollment, a trader should be able to understand what is measured, how limits are calculated, and what happens when a rule is reached.</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {standards.map((standard) => (
                  <li key={standard.title} className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-background p-4 text-sm leading-6">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span><strong className="font-semibold text-foreground">{standard.title}</strong><span className="mt-1 block text-muted-foreground">{standard.description}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="rules" className="scroll-mt-24 border-b border-border">
            <div className="mx-auto grid max-w-7xl gap-9 px-5 py-16 sm:px-8 md:grid-cols-[0.8fr_1.2fr] md:items-center md:py-20">
              <div>
                <p className="site-kicker">Trading rules</p>
                <h2 className="site-section-title mt-4">Understand the risk limits</h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">Loss limits and calculation methods can vary by program and stage. Review the exact published rule version before enrollment.</p>
                <ButtonLink href="/rules" variant="outline" className="mt-6">Read all trading rules <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Profit target", "The stage performance objective. Confirm the calculation basis, eligible activity, and when the target is assessed."],
                  ["Daily loss limit", "The maximum loss allowed during a trading day. The baseline, reset time, and treatment of open P&L and costs should be explicit."],
                  ["Maximum drawdown", "The overall loss boundary. Check whether it is static or trailing and whether it follows balance or equity."],
                  ["Trading activity", "Minimum trading days, trade counts, or consistency requirements apply only when they are stated in the published rules."],
                ].map(([title, description], index) => (
                  <article key={title} className="rounded-xl border border-border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md">
                    <span className="font-mono text-xs font-semibold tracking-widest text-emerald-400">RISK PARAMETER 0{index + 1}</span>
                    <h3 className="mt-3 font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="surface-dark-muted border-y border-white/5">
            <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 md:grid-cols-[0.8fr_1.2fr] md:items-start md:py-20">
              <div>
                <p className="site-kicker text-emerald-400">Beyond the headline numbers</p>
                <h2 className="site-section-title mt-4 text-paper-50">Operational details matter in practice.</h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-paper-50/65">Risk is shaped by the details around execution. A complete rulebook should answer these questions before a trader starts.</p>
                <ButtonLink href="/rules" variant="outline" className="mt-6 border-white/20 text-paper-50 hover:bg-white/10">Review the rulebook <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Execution", "Which instruments, trading sessions, platform, and server times apply?"],
                  ["Restrictions", "Are news events, overnight holding, automation, or copy trading addressed?"],
                  ["Review process", "What evidence supports a breach decision, and how can it be reviewed?"],
                ].map(([title, description], index) => (
                  <article key={title} className="rounded-xl border border-white/10 bg-white/[0.035] p-5 shadow-xl shadow-black/10 transition duration-200 hover:-translate-y-1 hover:border-emerald-400/40">
                    <span className="font-mono text-xs tracking-widest text-emerald-400">0{index + 1} / RULEBOOK</span>
                    <h3 className="mt-4 font-semibold text-paper-50">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-paper-50/60">{description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="faq" className="scroll-mt-24 mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 md:grid-cols-[0.7fr_1.3fr] md:py-20">
            <div>
              <p className="site-kicker">Common questions</p>
              <h2 className="site-section-title mt-4">Straight answers for traders.</h2>
              <Link href="/faq" className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-emerald-400 hover:underline">Browse all questions <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
            <div className="divide-y divide-border border-y border-border">
              {questions.map(({ question, answer }) => (
                <details key={question} className="group py-4">
                  <summary className="flex cursor-pointer items-start justify-between gap-4 rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {question}<span aria-hidden="true" className="shrink-0 text-emerald-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="border-t border-border bg-emerald-400/10">
            <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between md:py-14">
              <div>
                <p className="site-kicker"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Start with the terms</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">Review the published program terms.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Evaluation activity is simulated. Viewing a program does not create an order, confirm payment, or provision an account.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/catalog" size="md">View programs</ButtonLink>
                <ButtonLink href="/rules" variant="outline" size="md">Review program rules</ButtonLink>
              </div>
            </div>
          </section>
        </main>
      </HomeCatalogProvider>
      <SiteFooter />
    </div>
  );
}
