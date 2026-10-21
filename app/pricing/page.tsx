import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleDollarSign, ClipboardCheck, ShieldCheck } from "lucide-react";
import PublicContentPage from "@/components/public-content-page";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Program Fees",
  description: "Review the prices attached to approved Funded Experts programs when they are available.",
};

export default function PricingPage() {
  return (
    <PublicContentPage currentPath="/pricing" eyebrow="Program fees" title="Fees are defined by the published offer." introduction="Each enrollment fee must be tied to an approved program, shown in its stated currency, and presented alongside the applicable evaluation terms.">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: CircleDollarSign, title: "Fee shown in context", text: "The listed fee belongs to a specific offer; draft commercial terms are not presented as final." },
          { icon: ClipboardCheck, title: "Rules before enrollment", text: "Stage objectives and applicable risk parameters should be reviewable before enrollment opens." },
          { icon: ShieldCheck, title: "Catalog is informational", text: "Viewing an offer does not create an order, confirm payment, or allocate an account." },
        ].map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-border bg-card p-5"><Icon className="h-5 w-5 text-primary" aria-hidden="true" /><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>)}
      </div>
      <section className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-7" aria-labelledby="pricing-catalog-title">
        <p className="site-kicker">Current offers</p>
        <h2 id="pricing-catalog-title" className="mt-3 text-xl font-semibold">Review current evaluation offers.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The catalog distinguishes approved offers from unavailable or unpublished terms. Enrollment remains closed.</p>
        <div className="mt-5 flex flex-wrap gap-3"><ButtonLink href="/catalog">View program catalog <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink><Link href="/refund-policy" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-primary underline-offset-4 hover:underline">Refund policy status</Link></div>
      </section>
    </PublicContentPage>
  );
}
