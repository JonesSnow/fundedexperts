import type { Metadata } from "next";
import { AlertCircle, LockKeyhole } from "lucide-react";
import PublicContentPage from "@/components/public-content-page";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Supported Trading Platforms",
  description: "Check which trading platform services have been verified for customer use.",
};

export default function PlatformsPage() {
  return (
    <PublicContentPage currentPath="/platforms" eyebrow="Platform availability" title="The tools you use should be clearly explained." introduction="Platform availability depends on a program and on verified account provisioning, connection, monitoring, and support. We only describe a platform as available when those customer-facing steps are confirmed.">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-warning/30 bg-warning-light p-5 sm:p-7" aria-labelledby="platform-status-title">
          <div className="flex items-center gap-3"><AlertCircle className="h-5 w-5 text-warning-foreground" aria-hidden="true" /><span className="text-xs font-bold uppercase tracking-[0.14em] text-warning-foreground">Not confirmed for customer access</span></div>
          <h2 id="platform-status-title" className="mt-4 text-xl font-semibold text-foreground">No trading platform is currently advertised as available.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">The application contains monitoring and MetaTrader-related code, but a customer-ready platform connection, account provisioning flow, and support process have not been verified together. No platform login or trading access is offered from this page.</p>
        </section>
        <aside className="rounded-2xl border border-border bg-card p-5 sm:p-7">
          <LockKeyhole className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Protect your account details</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Never share passwords, verification codes, wallet recovery phrases, or private keys with anyone claiming to provide support.</p>
        </aside>
      </div>
      <div className="mt-8 flex flex-wrap gap-3"><ButtonLink href="/catalog">View evaluation programs</ButtonLink><ButtonLink href="/support" variant="outline">Self-service support</ButtonLink></div>
    </PublicContentPage>
  );
}
