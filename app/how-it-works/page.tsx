import type { Metadata } from "next";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Evaluation Process",
  description: "Understand how evaluation programs, stage objectives, and published rules are presented.",
  openGraph: { title: "Evaluation Process | Funded Experts", description: "Review evaluation programs, requirements, and recorded account status." },
};

const steps = [
  {
    title: "Select a program",
    status: "Compare programs",
    description: "Compare simulated balance, enrollment fee, evaluation stages, and published terms.",
  },
  {
    title: "Review the rule set",
    status: "Read the rules",
    description: "Confirm each stage objective, daily loss limit, maximum drawdown, and applicable condition.",
  },
  {
    title: "Trade the evaluation",
    status: "Not available",
    description: "Enrollment and simulated trading access are not currently available.",
  },
  {
    title: "Review recorded status",
    status: "Trader workspace",
    description: "When available, review account status and evaluation progress in your workspace.",
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
              <h1 className="site-display mt-5 text-foreground">A clear, rules-led evaluation process.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Review the program terms first. Each evaluation should be measured against a defined, versioned rule set.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/catalog" size="lg">Compare programs <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
                <ButtonLink href="/rules" variant="outline" size="lg">Read the rules</ButtonLink>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-20">
          <div className="max-w-2xl">
            <p className="site-kicker">The process</p>
            <h2 className="site-section-title mt-4">The evaluation lifecycle</h2>
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
            <p className="text-sm font-semibold text-warning-foreground">Enrollment and simulated trading access are not currently available.</p>
          </div>
        </section>

        <section className="bg-primary-light">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between md:py-18">
            <div>
              <p className="site-kicker">Program specifications</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">Compare published program terms.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Review simulated balance, enrollment fee, stages, and applicable rules where published.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/catalog">View programs</ButtonLink>
              <ButtonLink href="/faq" variant="outline">Read FAQ <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
