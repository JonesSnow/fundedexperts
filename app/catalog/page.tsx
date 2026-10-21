import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import ProductShowcase from "@/components/product-showcase";
import WorkingPlanPreview from "@/components/working-plan-preview";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Account Catalog",
  description: "Review approved simulated trading offers and their published terms when available.",
  openGraph: { title: "Account Catalog | Funded Experts", description: "Review approved simulated trading offers and their published terms." },
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
                Only offers approved in the product catalog appear here. Draft terms are never substituted for live offers.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="#configured-products" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  View published offers <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/rules" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  Read the rules
                </Link>
              </div>
            </div>
          </div>
        </section>

        <WorkingPlanPreview />

        <section id="configured-products" className="mx-auto max-w-7xl scroll-mt-24 px-5 pb-16 sm:px-8 md:pb-20" aria-label="Available plans">
          <ProductShowcase purchaseUnavailable />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
