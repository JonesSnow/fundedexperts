import Link from "next/link";
import Header from "@/components/header";
import ProductShowcase from "@/components/product-showcase";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPath="/" />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              Funded Trading Challenges
              <br />
              <span className="text-blue-600">For Serious Traders</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
              Funded Experts provides structured trading evaluations with clear
              rules. Pass your evaluation and receive capital to trade with —
              keeping a share of the profits.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/catalog"
                className="rounded bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700"
              >
                Browse Challenges
              </Link>
              <Link
                href="/register"
                className="rounded border border-gray-300 px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
              >
                Create Account
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight">
                How It Works
              </h2>
              <p className="mt-3 text-gray-600">
                Three steps to funded capital
              </p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <div className="rounded-lg bg-white p-6 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  1
                </div>
                <h3 className="mt-4 font-semibold">Choose a Challenge</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Select a product that matches your trading goals and account
                  size preferences.
                </p>
              </div>
              <div className="rounded-lg bg-white p-6 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  2
                </div>
                <h3 className="mt-4 font-semibold">Complete Evaluation</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Pass the evaluation phase by meeting the ruleset objectives
                  within the given parameters.
                </p>
              </div>
              <div className="rounded-lg bg-white p-6 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  3
                </div>
                <h3 className="mt-4 font-semibold">Get Funded</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Pass all phases and receive a funded account to trade with
                  real capital.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight">
                Challenge Types
              </h2>
              <p className="mt-3 text-gray-600">
                Different evaluation structures for different trading styles
              </p>
            </div>
            <div className="mt-10">
              <ProductShowcase />
            </div>
            <div className="mt-10 text-center">
              <Link
                href="/catalog"
                className="rounded bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700"
              >
                View All Challenges
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h2 className="text-2xl font-bold">Built on Clear Rules</h2>
                <p className="mt-3 text-gray-600">
                  Every challenge is governed by a published ruleset that
                  defines profit targets, drawdown limits, and trading
                  requirements. There are no hidden conditions.
                </p>
                <ul className="mt-4 space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600" />
                    Transparent ruleset versions with historical tracking
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600" />
                    Defined profit targets and drawdown boundaries
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600" />
                    Trading hours and position limits per ruleset
                  </li>
                </ul>
              </div>
              <div>
                <h2 className="text-2xl font-bold">Funding, Not Rent</h2>
                <p className="mt-3 text-gray-600">
                  Purchase a challenge to receive evaluation access. When you
                  pass, you receive a funded account — not just a subscription.
                  You keep a share of the profits you generate.
                </p>
                <ul className="mt-4 space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600" />
                    One-time purchase per challenge product
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600" />
                    Funded accounts allocated after evaluation pass
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600" />
                    Profit splits on funded account performance
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-gray-500">
          <p>Funded Experts — Simulated prop-firm platform</p>
          <p className="mt-1">
            <Link href="/catalog" className="text-blue-600 hover:underline">
              Catalog
            </Link>
            {" · "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Login
            </Link>
            {" · "}
            <Link href="/register" className="text-blue-600 hover:underline">
              Register
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
