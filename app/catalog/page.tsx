import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import ProductShowcase from "@/components/product-showcase";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Account Catalog",
  description: "Compare simulated evaluation plans, prices, stages, and published rules.",
  openGraph: { title: "Account Catalog | Funded Experts", description: "Compare active accounts and their rules." },
};

export default function CatalogPage() {
  return (
    <div className="min-h-screen">
      <Header currentPath="/catalog" />
      <main>
        <section className="site-hero">
          <div className="pointer-events-none absolute inset-0 site-dot-field opacity-50" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-20">
            <div className="max-w-3xl">
              <p className="site-kicker text-primary">Account catalog</p>
              <h1 className="site-display mt-5 text-foreground">Explore Trading Plans</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Compare account sizes, prices, evaluation stages, and published rules before you choose a plan.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/pricing" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  Plans and pricing <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/rules" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  Read the rules
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-8 sm:px-8" aria-label="Purchase availability">
          <div className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning-light p-5 sm:flex-row sm:items-start sm:p-6" role="status">
            <Badge variant="warning">Purchases are not open yet</Badge>
            <p className="max-w-4xl text-sm leading-6 text-warning-foreground">
              Review each plan&apos;s terms. Purchasing and simulated account access are not available yet.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 md:pb-20" aria-label="Configured products">
          <ProductShowcase purchaseUnavailable />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
