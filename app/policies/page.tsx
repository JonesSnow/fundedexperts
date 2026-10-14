import type { Metadata } from "next";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Policies and Disclosures",
  description: "Publication status for Funded Experts legal, risk, refund, and support policies.",
  openGraph: { title: "Policies and Disclosures | Funded Experts", description: "Review which customer policies are published and which are awaiting approval." },
};

const documents = [
  { id: "terms", title: "Terms and conditions", status: "Not published", detail: "Approved customer terms have not been supplied in the application." },
  { id: "privacy", title: "Privacy notice", status: "Not published", detail: "A reviewed privacy notice and data-retention statement are not present in the customer-facing application." },
  { id: "refunds", title: "Refund and cancellation policy", status: "Awaiting product-owner and legal review", detail: "Refund, reset, cancellation, and chargeback terms are not established by the product configuration." },
  { id: "risk", title: "Risk and simulated-trading disclosure", status: "Disclosure present; full legal review pending", detail: "The interface identifies the platform as simulated. A complete reviewed risk disclosure has not been located." },
  { id: "support", title: "Support and evaluation appeals", status: "Not published", detail: "No verified customer support contact or dispute process is available in the application." },
] as const;

export default function PoliciesPage() {
  return (
    <div className="min-h-screen">
      <Header currentPath="/policies" />
      <main>
        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-24">
          <p className="site-kicker">Publication register</p>
          <h1 className="site-section-title mt-5 max-w-4xl">Policies and disclosures, with their status shown plainly.</h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground">This page records whether customer-facing policy documents are available. It does not substitute for legal terms or create an approved policy. Do not rely on a missing document as permission or a promise.</p>
          <div className="mt-10 divide-y divide-border border-y border-border">{documents.map((document, index) => <article id={document.id} key={document.id} className="grid scroll-mt-28 gap-3 py-6 sm:grid-cols-[3rem_0.55fr_0.65fr_1.2fr] sm:items-start"><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span><h2 className="font-semibold">{document.title}</h2><span className="w-fit rounded-full border border-warning/30 bg-warning-light px-2.5 py-1 text-xs font-semibold text-warning-foreground">{document.status}</span><p className="text-sm leading-6 text-muted-foreground">{document.detail}</p></article>)}</div>
          <div className="mt-8 rounded-2xl border border-warning/30 bg-warning-light p-5"><p className="text-sm font-semibold text-warning-foreground">Commercial terms are not complete for a public paid launch.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Pricing, payment settlement, refunds, customer data handling, risk terms, support, and payout eligibility require product-owner approval and appropriate review before publication.</p></div>
          <div className="mt-8 flex flex-wrap gap-3"><ButtonLink href="/pricing">View configured pricing</ButtonLink><ButtonLink href="/faq" variant="outline">Read FAQ</ButtonLink></div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}