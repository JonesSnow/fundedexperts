import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import PublicContentPage from "@/components/public-content-page";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About Funded Experts",
  description: "Learn about the principles behind Funded Experts' rules-first simulated evaluation experience.",
};

const principles = [
  ["Clear before checkout", "Program fees, objectives, restrictions, and applicable rules should be visible before a purchase is enabled."],
  ["Rules you can inspect", "Each offer should identify the rules version that governs it and explain how its requirements are measured."],
  ["Honest about simulation", "Evaluation activity uses virtual funds. Simulated results are not live-market performance."],
  ["Accountability in the product", "Recorded statuses, events, and available next steps should be understandable and traceable."],
] as const;

export default function AboutPage() {
  return (
    <PublicContentPage currentPath="/about" eyebrow="Our approach" title="Built around clarity, not guesswork." introduction="Funded Experts is being developed around a simple standard: people should be able to understand a program's objectives, limits, and terms before deciding whether to participate.">
      <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
        <aside className="h-fit rounded-2xl border border-border bg-card p-5 sm:p-6">
          <p className="site-kicker">What this service is</p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">A rules-first simulated trading evaluation experience. The platform is not a deposit account or a live brokerage account, and no evaluation outcome is guaranteed.</p>
          <Link href="/risk-disclosure" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">Read the simulation disclosure <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </aside>
        <section aria-labelledby="principles-heading">
          <p className="site-kicker">Operating principles</p>
          <h2 id="principles-heading" className="mt-3 text-2xl font-semibold tracking-tight">The experience should make important terms easy to inspect.</h2>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {principles.map(([title, text]) => <li key={title} className="flex gap-4 py-5"><Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div></li>)}
          </ul>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">Company identity, leadership, location, history, and legal entity details are not presented here because verified, approved public information has not been provided.</p>
          <div className="mt-6 flex flex-wrap gap-3"><ButtonLink href="/catalog">View published programs</ButtonLink><ButtonLink href="/rules" variant="outline">Read the rules</ButtonLink></div>
        </section>
      </div>
    </PublicContentPage>
  );
}
