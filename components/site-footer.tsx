import Link from "next/link";
import Brand from "@/components/brand";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Brand />
          <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">
            A simulated trading evaluation platform. Active offers and their terms depend on the product configuration shown in the catalog.
          </p>
          <p className="mt-3 max-w-md text-xs leading-5 text-muted-foreground">
            Simulated account balances are not customer deposits or withdrawable funds. A pending order does not confirm payment or account allocation.
          </p>
        </div>
        <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/catalog">Accounts</Link>
          <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/catalog#configured-products">Plans and pricing</Link>
          <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/rules">Trading rules</Link>
          <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/how-it-works">How it works</Link>
          <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/faq">FAQ</Link>
          <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/policies">Policies and disclosures</Link>
          <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/support">Support</Link>
          <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/login">Sign in</Link>
          <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/register">Create account</Link>
        </nav>
        <p className="border-t border-border pt-5 text-xs text-muted-foreground md:col-span-2">
          Funded Experts · Simulated accounts are for evaluation purposes. Legal and support documents are listed by publication status on the policies page.
        </p>
      </div>
    </footer>
  );
}
