import type { ReactNode } from "react";
import Link from "next/link";
import Brand from "@/components/brand";

const accountSteps = [
  "Verify the email address on your account",
  "Review your saved account and evaluation status",
  "Keep in mind that all trading accounts are simulated",
];

export default function AuthShell({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(21rem,0.9fr)_1.1fr]">
      <aside className="relative hidden min-h-full overflow-hidden border-r border-border bg-card px-10 py-12 lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="pointer-events-none absolute inset-0 site-dot-field opacity-40" aria-hidden="true" />
        <div className="auth-accent-orb pointer-events-none absolute -right-28 top-1/4 h-80 w-80 rounded-full" aria-hidden="true" />
        <div className="relative z-10">
          <Brand />
          <p className="site-kicker mt-20 text-primary">Account access</p>
          <h1 className="mt-5 max-w-lg text-4xl font-semibold leading-tight tracking-[-0.045em] text-foreground xl:text-5xl">
            A clear path through every step.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
            Manage your account securely and review the information recorded by the platform.
          </p>
          <ul className="mt-8 space-y-4">
            {accountSteps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-background font-mono text-[0.65rem] text-primary">0{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
          Simulated evaluations are not live brokerage accounts and do not guarantee earnings.
        </p>
      </aside>

      <section className="flex min-w-0 flex-col justify-center px-5 py-8 sm:px-8 lg:px-12 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
            <Brand />
            <Link href="/" className="text-xs font-medium text-muted-foreground hover:text-foreground">Home</Link>
          </div>
          <Link
            href="/"
            className="hidden text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
          >
            ← Back to home
          </Link>
          <header className="mb-8 mt-4 lg:mt-8">
            <p className="site-kicker">Funded Experts account</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}
