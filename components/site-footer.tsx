import Link from "next/link";
import Brand from "@/components/brand";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border/20 bg-ink-950 text-paper-50">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Brand surface="dark" />
          <div className="h-px w-12 bg-gradient-to-r from-primary to-accent mb-5" />
          <p className="mt-5 max-w-md text-sm leading-6 text-paper-50/75">
            A simulated trading evaluation platform. Active offers and their terms depend on the product configuration shown in the catalog.
          </p>
          <p className="mt-3 max-w-md text-xs leading-5 text-paper-50/75">
            Simulated account balances are not customer deposits or withdrawable funds. A pending order does not confirm payment or account allocation.
          </p>
        </div>
        <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/about">About</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-teal-400" href="/catalog">Programs</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-teal-400" href="/pricing">Program fees</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/rules">Trading rules</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/how-it-works">How it works</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/faq">FAQ</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/platforms">Platforms</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/contact">Contact</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/terms">Terms</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/privacy">Privacy</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/risk-disclosure">Risk disclosure</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/refund-policy">Refund policy</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/cookies">Cookies</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/accessibility">Accessibility</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/policies">Policies and disclosures</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/support">Support</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/login">Sign in</Link>
          <Link className="text-paper-50/75 transition-colors hover:text-cyan-400" href="/register">Create account</Link>
        </nav>
        <p className="border-t border-border pt-5 text-xs text-paper-50/75 md:col-span-2">
          Funded Experts · Simulated accounts are for evaluation purposes. Legal and support documents are listed by publication status on the policies page.
        </p>
      </div>
    </footer>
  );
}
