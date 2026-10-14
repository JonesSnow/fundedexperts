import type { Metadata } from "next";
import Header from "@/components/header";
import ProductShowcase from "@/components/product-showcase";
import SiteFooter from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Plans and Pricing",
  description: "Compare simulated evaluation plan sizes, prices, stages, and published rules.",
  openGraph: { title: "Plans and Pricing | Funded Experts", description: "Compare configured evaluation plans and their published terms." },
};

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <Header currentPath="/pricing" />
      <main>
        <section className="site-hero">
          <div className="pointer-events-none absolute inset-0 site-dot-field opacity-50" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-20">
            <div className="max-w-3xl">
              <p className="site-kicker text-primary">Plans and pricing</p>
              <h1 className="site-display mt-5 text-foreground">Plans and Pricing</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Compare account sizes, evaluation stages, and trading rules before choosing a plan.
              </p>
          <p className="mt-4 text-sm text-muted-foreground">Each plan displays its published price and rules. We do not estimate missing terms.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 md:py-16" aria-labelledby="configured-plans-title">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="site-kicker">Available plans</p>
              <h2 id="configured-plans-title" className="mt-3 text-2xl font-semibold tracking-tight">Compare plan details</h2>
            </div>
            <ButtonLink href="/rules" variant="outline">Read the trading rules <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
          </div>
          <p className="mb-5 rounded-lg border border-warning/25 bg-warning-light px-4 py-3 text-sm leading-6 text-warning-foreground" role="status">
            Purchases and payout requests are not available yet. You can compare each plan&apos;s published terms here.
          </p>
          <ProductShowcase purchaseUnavailable />
        </section>

        <section className="border-y border-border bg-card" aria-labelledby="terms-title">
          <div className="mx-auto grid max-w-7xl gap-9 px-5 py-12 sm:px-8 md:grid-cols-[0.72fr_1.28fr] md:py-16">
            <div>
              <p className="site-kicker">Plan terms</p>
              <h2 id="terms-title" className="site-section-title mt-4">What to compare</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">Review the published rules for each stage before choosing a plan.</p>
            </div>
            <dl className="divide-y divide-border border-y border-border">
              <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                <dt className="font-semibold">Account size</dt>
                <dd className="text-sm leading-6 text-muted-foreground">The simulated account size and currency for the plan.</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                <dt className="font-semibold">Evaluation stages</dt>
                <dd className="text-sm leading-6 text-muted-foreground">The number and order of evaluation stages for the plan.</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                <dt className="font-semibold">Profit target</dt>
                <dd className="text-sm leading-6 text-muted-foreground">The target shown in the published rules for each stage.</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                <dt className="font-semibold">Loss limits</dt>
                <dd className="text-sm leading-6 text-muted-foreground">The daily and maximum loss limits shown in the plan rules. Reset timing and calculation details may vary.</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                <dt className="font-semibold">Profit split</dt>
                <dd className="text-sm leading-6 text-muted-foreground">A profit split has not been published for these plans.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 md:py-16">
          <div className="flex flex-col gap-5 rounded-xl border border-border bg-background p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Not sure what a rule means?</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">See how published limits are presented and what remains unconfirmed.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/rules" variant="outline">Trading rules</ButtonLink>
              <ButtonLink href="/faq">Frequently asked questions</ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
