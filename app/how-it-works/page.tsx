import type { Metadata } from "next";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works",
  description: "See how to compare simulated trading plans and review their rules.",
  openGraph: { title: "How It Works | Funded Experts", description: "Compare plans, understand their rules, and view recorded progress." },
};

const steps = [
  {
    title: "Choose a plan",
    status: "Explore plans",
    description: "Compare account size, price, stages, and published rules.",
  },
  {
    title: "Understand the rules",
    status: "Read the rules",
    description: "Review the published targets, loss limits, and conditions for your plan.",
  },
  {
    title: "Complete an evaluation",
    status: "Not available yet",
    description: "Purchases and evaluation access are not open yet.",
  },
  {
    title: "Review your progress",
    status: "Sign in",
    description: "View the status recorded for your accounts and evaluations.",
  },
] as const;

const statusClasses = {
  available: "border-primary/30 bg-primary-light text-primary",
  unavailable: "border-warning/30 bg-warning-light text-warning-foreground",
};

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen">
      <Header currentPath="/how-it-works" />
      <main>
        <section className="site-hero">
          <div className="pointer-events-none absolute inset-0 site-dot-field opacity-50" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-20">
            <div className="relative z-10 max-w-3xl">
              <p className="site-kicker text-primary">How it works</p>
              <h1 className="site-display mt-5 text-foreground">A Clear Path to Evaluate Your Skills</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Compare a plan, understand its published rules, and review the status recorded for your account.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/catalog" size="lg">Browse plans <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
                <ButtonLink href="/rules" variant="outline" size="lg">Read the rules</ButtonLink>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-20">
          <div className="max-w-2xl">
            <p className="site-kicker">The process</p>
            <h2 className="site-section-title mt-4">Four simple steps</h2>
          </div>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-background font-mono text-sm font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold ${index === 2 ? statusClasses.unavailable : statusClasses.available}`}>{step.status}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-xl border border-warning/30 bg-warning-light p-4 sm:p-5" role="status">
            <p className="text-sm font-semibold text-warning-foreground">Purchases and simulated trading access are not available yet.</p>
          </div>
        </section>

        <section className="bg-primary-light">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between md:py-18">
            <div>
              <p className="site-kicker">Explore plans</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">Compare plans and their rules.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">See account sizes, prices, stages, and published requirements.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/catalog">Open catalog</ButtonLink>
              <ButtonLink href="/faq" variant="outline">Read FAQ <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
