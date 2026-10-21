import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import ProductShowcase from "@/components/product-showcase";
import WorkingPlanPreview from "@/components/working-plan-preview";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Evaluation Programs",
  description: "Compare published simulated trading programs, enrollment fees, stage objectives, and program rules.",
  openGraph: { title: "Evaluation Programs | Funded Experts", description: "Compare published simulated trading programs and their terms." },
};

export default function CatalogPage() {
  return (
    <div className="min-h-screen">
      <Header currentPath="/catalog" />
      <main className="flex-1">
        <section className="site-hero relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 site-dot-field opacity-40" aria-hidden="true" />
          <div className="absolute inset-0 -z-10">
            <div className="absolute -top-20 -right-20 w-[520px] h-[200px] rounded-full bg-emerald-600/15 blur-[80px]" aria-hidden="true" />
            <div className="absolute -bottom-20 -left-20 w-[440px] h-[200px] bg-emerald-700/10 blur-[80px]" aria-hidden="true" />
          </div>
          <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-24">
            <div className="max-w-3xl">
              <p className="site-kicker text-emerald-400">Program catalog</p>
              <h1 className="site-display mt-5 text-foreground">Compare evaluation programs</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Review each program&apos;s simulated balance, enrollment fee, evaluation stages, and published rules. Draft terms do not appear here. Historical proposals remain unpublished. Only an approved active offer can appear in the catalog.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="#configured-products" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2">
                  View available programs <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/rules" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  Read the rules
                </Link>
              </div>
            </div>
          </div>
        </section>

        <WorkingPlanPreview />

        <section id="configured-products" className="mx-auto max-w-7xl scroll-mt-24 px-5 pb-16 sm:px-8 md:pb-20" aria-label="Published evaluation programs">
          <ProductShowcase />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
