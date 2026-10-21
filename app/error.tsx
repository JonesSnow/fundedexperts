"use client";

import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { Button, ButtonLink } from "@/components/ui/button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center">
        <section className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-8">
          <p className="site-kicker">Page unavailable</p>
          <h1 className="site-display mt-4 text-foreground">We couldn&apos;t load this page.</h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-muted-foreground">Something went wrong while loading this page. No purchase, payment, or account change should be assumed from this message.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3"><Button onClick={reset}>Try again</Button><ButtonLink href="/" variant="outline">Go home</ButtonLink></div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
