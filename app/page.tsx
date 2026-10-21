import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import Header from "@/components/header";
import ProductShowcase from "@/components/product-showcase";
import { HomeCatalogProvider } from "@/components/home-catalog-context";
import SiteFooter from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import SimulatedChartPreview from "@/components/simulated-chart-preview";

export const metadata: Metadata = {
  title: "Funded Experts | Simulated Trading Evaluations",
  description: "Choose a simulated trading evaluation, review its rules, and track your recorded progress.",
  openGraph: {
    title: "Funded Experts | Simulated Trading Evaluations",
    description: "Explore simulated evaluation plans and review their published rules.",
  },
};

const processSteps = [
  { title: "Review Available Offers", description: "Compare account sizes, prices, and rules when approved offers are published." },
  { title: "Understand the Rules", description: "Review the published targets and loss limits for your plan." },
  { title: "Complete the Evaluation", description: "When evaluation access is available, trade in the simulated environment and follow the plan's rules." },
  { title: "Review Your Progress", description: "See the status and progress recorded for your account." },
];

const questions = [
  { question: "What is Funded Experts?", answer: "A platform for exploring simulated trading evaluations and their published rules." },
  { question: "Are accounts simulated?", answer: "Yes. Account balances and evaluations are simulated. They are not deposits, live brokerage accounts, or withdrawable funds." },
  { question: "How does an evaluation work?", answer: "Each plan lists its stages and published rules. Evaluation access is not available yet." },
  { question: "What happens if I break a rule?", answer: "Rule results are still being validated. Do not rely on them for financial or account decisions." },
  { question: "How can I verify my email?", answer: "Create an account and enter the six-digit code sent to your email. Delivery depends on email service availability." },
  { question: "Are payments and payouts available?", answer: "Purchases and payout requests are not available yet." },
];

const reasons = [
  "Published plan requirements appear with each offer.",
  "Risk limits are shown when they are available.",
  "Account and evaluation status is recorded in one place.",
  "Trading and balances are simulated.",
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Header currentPath="/" />
      <HomeCatalogProvider>
        <main>
          <section className="site-hero">
            <div className="pointer-events-none absolute inset-0 site-dot-field opacity-60" aria-hidden="true" />
            <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-28">
              <div className="relative z-10">
                <p className="site-kicker text-primary">Simulated trading evaluations</p>
                <h1 className="site-display mt-6 max-w-3xl text-foreground">
                  Trade with a Plan.<br />Prove Your Skills.
                </h1>
                <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                  Choose an evaluation, understand your trading rules, and track your progress in a structured simulated trading environment.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <ButtonLink href="/catalog" size="lg">Explore Plans <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
                  <ButtonLink href="/how-it-works" variant="outline" size="lg">How It Works</ButtonLink>
                </div>
                <p className="mt-6 max-w-xl text-xs leading-5 text-muted-foreground">
                  Trading accounts and performance evaluations are simulated. Passing an evaluation does not guarantee earnings or access to a live brokerage account.
                </p>
              </div>
              <SimulatedChartPreview />
            </div>
          </section>

          <section id="how-it-works" className="scroll-mt-24 border-b border-border">
            <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-20">
              <div className="max-w-2xl">
                <p className="site-kicker">How it works</p>
                  <h2 className="site-section-title mt-4">A Clear Path to Evaluate Your Skills</h2>
              </div>
              <ol className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {processSteps.map((step, index) => (
                  <li key={step.title} className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
                    <span className="font-mono text-xs font-semibold tracking-widest text-primary">0{index + 1}</span>
                    <h3 className="mt-5 text-lg font-semibold tracking-tight">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                  </li>
                ))}
              </ol>
              <Link href="/how-it-works" className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary hover:underline">
                Read the full process <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section id="plans" className="scroll-mt-24">
            <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-20">
              <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-2xl">
                  <p className="site-kicker">Account plans</p>
                  <h2 className="site-section-title mt-4">Approved offers and terms</h2>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">Account sizes, prices, stages, and rules will be shown only when the catalog can verify approved product data.</p>
                </div>
                <ButtonLink href="/catalog#plan-availability" variant="outline">Check offer availability <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
              </div>
              <ProductShowcase compact purchaseUnavailable />
            </div>
          </section>

          <section className="border-y border-border bg-card">
            <div className="mx-auto grid max-w-7xl gap-9 px-5 py-16 sm:px-8 md:grid-cols-[0.85fr_1.15fr] md:py-20">
              <div>
                <p className="site-kicker">Why Funded Experts</p>
                <h2 className="site-section-title mt-4">Clear Rules. Clear Progress.</h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">Review each plan&apos;s published requirements and see the status recorded for your account.</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {reasons.map((reason) => (
                  <li key={reason} className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-background p-4 text-sm leading-6">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="rules" className="scroll-mt-24 border-b border-border">
            <div className="mx-auto grid max-w-7xl gap-9 px-5 py-16 sm:px-8 md:grid-cols-[0.8fr_1.2fr] md:items-center md:py-20">
              <div>
                <p className="site-kicker">Trading rules</p>
                <h2 className="site-section-title mt-4">Understand Your Limits</h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">Rule values and calculation details can differ by plan. Review the published terms for the exact account configuration.</p>
                <ButtonLink href="/rules" variant="outline" className="mt-6">Read all trading rules <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
              </div>
              <dl className="divide-y divide-border border-y border-border">
                <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                  <dt className="font-semibold">Profit target</dt>
                  <dd className="text-sm leading-6 text-muted-foreground">The gain required by a configured plan stage, where a target is published.</dd>
                </div>
                <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                  <dt className="font-semibold">Daily loss limit</dt>
                  <dd className="text-sm leading-6 text-muted-foreground">A plan&apos;s stated daily boundary. Its baseline and reset timing depend on the published calculation.</dd>
                </div>
                <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                  <dt className="font-semibold">Maximum loss limit</dt>
                  <dd className="text-sm leading-6 text-muted-foreground">The overall loss boundary stated for the selected plan and stage.</dd>
                </div>
              </dl>
            </div>
          </section>

          <section id="faq" className="scroll-mt-24 mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 md:grid-cols-[0.7fr_1.3fr] md:py-20">
            <div>
              <p className="site-kicker">Common questions</p>
              <h2 className="site-section-title mt-4">Clear answers about the platform.</h2>
              <Link href="/faq" className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary hover:underline">Browse all questions <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
            <div className="divide-y divide-border border-y border-border">
              {questions.map(({ question, answer }) => (
                <details key={question} className="group py-4">
                  <summary className="flex cursor-pointer items-start justify-between gap-4 rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {question}<span aria-hidden="true" className="shrink-0 text-primary transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="border-t border-border bg-primary-light">
            <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between md:py-14">
              <div>
                <p className="site-kicker"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Start with the terms</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">Explore the configured plans.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">All accounts are simulated. Catalog access does not create an order, payment, or trading account.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/catalog">Explore Plans</ButtonLink>
                <ButtonLink href="/rules" variant="outline">Review Rules</ButtonLink>
              </div>
            </div>
          </section>
        </main>
      </HomeCatalogProvider>
      <SiteFooter />
    </div>
  );
}
