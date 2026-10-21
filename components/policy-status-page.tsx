import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import PublicContentPage from "@/components/public-content-page";

interface PolicyStatusPageProps {
  currentPath: string;
  eyebrow: string;
  title: string;
  introduction: string;
  status: string;
  statusDescription: string;
  children?: ReactNode;
  nextLinks?: Array<{ href: string; label: string }>;
}

export default function PolicyStatusPage({
  currentPath,
  eyebrow,
  title,
  introduction,
  status,
  statusDescription,
  children,
  nextLinks = [],
}: PolicyStatusPageProps) {
  return (
    <PublicContentPage currentPath={currentPath} eyebrow={eyebrow} title={title} introduction={introduction}>
      <div className="max-w-4xl">
        <section className="rounded-2xl border border-warning/30 bg-warning-light p-5 sm:p-7" aria-labelledby="document-status-title">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-warning-foreground">{status}</p>
              <h2 id="document-status-title" className="mt-2 text-lg font-semibold text-foreground">This document is not an approved customer policy.</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{statusDescription}</p>
            </div>
          </div>
        </section>
        {children && <div className="reading-column mt-8 space-y-6 text-sm leading-7 text-muted-foreground">{children}</div>}
        <nav aria-label="Related information" className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-6">
          {nextLinks.map((item) => (
            <Link key={item.href} href={item.href} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {item.label}<ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ))}
          <Link href="/policies" className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            View publication status
          </Link>
        </nav>
      </div>
    </PublicContentPage>
  );
}
