import Link from "next/link";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center">
        <section className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-8">
          <p className="site-kicker">404 · Page not found</p>
          <h1 className="site-display mt-4 text-foreground">This page could not be found.</h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-muted-foreground">The link may be outdated, or the page may no longer be available. Your order and account status have not been changed by viewing this page.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3"><ButtonLink href="/catalog">View programs</ButtonLink><ButtonLink href="/" variant="outline">Go home</ButtonLink></div>
          <Link href="/support" className="mt-5 inline-flex min-h-10 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">Open self-service support</Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
