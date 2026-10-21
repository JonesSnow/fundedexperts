import type { ReactNode } from "react";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";

interface PublicContentPageProps {
  currentPath: string;
  eyebrow: string;
  title: string;
  introduction: string;
  children: ReactNode;
}

export default function PublicContentPage({
  currentPath,
  eyebrow,
  title,
  introduction,
  children,
}: PublicContentPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPath={currentPath} />
      <main className="flex-1">
        <section className="site-hero">
          <div className="pointer-events-none absolute inset-0 site-dot-field opacity-40" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-20">
            <div className="max-w-3xl">
              <p className="site-kicker text-primary">{eyebrow}</p>
              <h1 className="site-display mt-5 text-foreground">{title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                {introduction}
              </p>
            </div>
          </div>
        </section>
        <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 md:py-16">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
