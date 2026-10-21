import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import PublicContentPage from "@/components/public-content-page";

export const metadata: Metadata = {
  title: "Contact and Support",
  description: "Find verified self-service resources and current support availability for Funded Experts.",
};

export default function ContactPage() {
  return (
    <PublicContentPage currentPath="/contact" eyebrow="Contact and support" title="Get help with a clear next step." introduction="Use the published self-service resources below. A direct support channel and request form are not configured, so this page will not claim that a message or appeal has been submitted.">
      <div className="max-w-4xl">
        <div className="rounded-2xl border border-warning/30 bg-warning-light p-5 sm:p-7" role="status">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-warning-foreground">Human support unavailable</p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">No verified contact or appeal channel is published yet.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">A support address, ticket service, and evaluation appeal process have not been configured in the application. Do not send credentials or payment secrets through an unverified channel.</p>
        </div>
        <section className="mt-8" aria-labelledby="self-service-title">
          <h2 id="self-service-title" className="text-xl font-semibold">Self-service resources</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[["Programs and terms", "/catalog"], ["Rules center", "/rules"], ["Frequently asked questions", "/faq"], ["Account access", "/login"]].map(([label, href]) => <Link key={href} href={href} className="group flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-colors hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span>{label}</span><ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></Link>)}
          </div>
        </section>
        <p className="mt-8 flex items-start gap-3 border-t border-border pt-6 text-sm leading-6 text-muted-foreground"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Never include a password, one-time verification code, wallet seed phrase, or private key in a support request.</span></p>
      </div>
    </PublicContentPage>
  );
}
