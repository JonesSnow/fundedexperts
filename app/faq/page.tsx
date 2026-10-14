"use client";

import { useMemo, useState } from "react";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface FAQItem {
  category: string;
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  { category: "Getting started", question: "What is Funded Experts?", answer: "A platform for exploring simulated trading evaluations and their published rules." },
  { category: "Getting started", question: "How do I choose an account?", answer: "Compare plans by account size, price, stages, and published rules." },
  { category: "Account types and sizes", question: "What account types are offered?", answer: "Available plans appear in the catalog. Each plan shows its size, price, and published rules. Purchases are not open yet." },
  { category: "Account types and sizes", question: "What sizes can I choose?", answer: "The catalog shows the simulated size and currency for each available plan." },
  { category: "Pricing and payment", question: "Where does the price come from?", answer: "Prices shown in the catalog are set for each plan. Missing prices are not estimated." },
  { category: "Pricing and payment", question: "Can I buy an account now?", answer: "Not yet. Purchases are not available." },
  { category: "Pricing and payment", question: "What payment methods, taxes, or fees apply?", answer: "Payment methods, taxes, and fees have not been published." },
  { category: "Evaluation stages", question: "How many stages does each challenge have?", answer: "Stage count varies by plan. See the plan details for its published stages." },
  { category: "Evaluation stages", question: "What happens when I hit a profit target?", answer: "A profit target is one of the plan's rules. Review the other requirements for that stage as well." },
  { category: "Trading rules", question: "Which rules apply to my account?", answer: "Review the published rules for your plan and stage. Some calculations are still under review, so this page does not determine evaluation outcomes." },
  { category: "Trading rules", question: "Are news, weekend, copy-trading, or bot rules defined?", answer: "These restrictions have not been published. Do not assume they are allowed or restricted." },
  { category: "Drawdown and risk", question: "How is daily loss calculated and when does it reset?", answer: "The daily-loss reference and reset time have not been published yet." },
  { category: "Drawdown and risk", question: "Is drawdown static or trailing?", answer: "The reference point and whether the limit trails balance or equity are not defined in the plan terms." },
  { category: "Account access", question: "Does an order give me trading credentials?", answer: "Purchases and account assignment are not available yet." },
  { category: "Account access", question: "Is MetaTrader connected and monitoring live?", answer: "Live MetaTrader access and continuous monitoring are not available." },
  { category: "Verification and security", question: "How do I verify my email?", answer: "Enter the six-digit code sent to your email. Codes expire and can be resent. Check your spam folder if delivery is delayed." },
  { category: "Verification and security", question: "How do I reset my password?", answer: "Choose Forgot password on the sign-in page, then use the emailed code to set a new password." },
  { category: "Verification and security", question: "Can I change my email?", answer: "Email changes are not available in Settings yet." },
  { category: "Account access", question: "Where do I see my account and evaluation status?", answer: "Sign in to view the status recorded for your accounts and evaluations." },
  { category: "Failed evaluations", question: "What happens if I break a rule?", answer: "Rule outcomes are not yet reliable enough to make account or financial decisions." },
  { category: "Failed evaluations", question: "Can I reset or retry a challenge?", answer: "A reset or retry option has not been published." },
  { category: "Funded accounts", question: "Does 'funded' mean live capital?", answer: "No. All account balances are simulated and cannot be withdrawn." },
  { category: "Payouts", question: "Can I request a payout or profit split?", answer: "Payout requests are not available. Simulated balances are not cash." },
  { category: "Technical problems", question: "What if a page or status does not load?", answer: "Use the page's Try again button. The Support page lists current self-service resources." },
  { category: "Refunds", question: "Are orders refundable or cancellable?", answer: "Purchases are disabled. Refund and cancellation terms will be published before sales begin." },
  { category: "Support", question: "How do I contact support or dispute a result?", answer: "Direct support and appeals are not available yet. The Support page lists current self-service resources." },
];

const categories = ["All topics", ...Array.from(new Set(faqs.map((faq) => faq.category)))];

export default function FAQPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All topics");
  const visibleFaqs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return faqs.filter((faq) => (category === "All topics" || faq.category === category) && (!normalized || `${faq.question} ${faq.answer} ${faq.category}`.toLocaleLowerCase().includes(normalized)));
  }, [query, category]);

  return (
    <div className="min-h-screen">
      <Header currentPath="/faq" />
      <main>
        <section className="site-hero">
          <div className="pointer-events-none absolute inset-0 site-dot-field opacity-50" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 md:py-20">
            <div className="relative z-10 max-w-3xl">
              <p className="site-kicker text-primary">Questions answered</p>
              <h1 className="site-display mt-5 text-foreground">Frequently Asked Questions</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Search for answers about plans, rules, and account access.
              </p>
              <ButtonLink href="/catalog" variant="outline" size="lg" className="mt-7">Browse plans <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-14 pt-14 sm:px-8 md:pb-20 md:pt-20">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <p className="site-kicker">Search & filter</p>
              <div className="mt-5 rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
                <div>
                  <label htmlFor="faq-search" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search questions</label>
                  <input id="faq-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pricing, rules, accounts…" className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <div>
                  <label htmlFor="faq-category" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Topic</label>
                  <select id="faq-category" value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {categories.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground" role="status">{visibleFaqs.length} answer{visibleFaqs.length === 1 ? "" : "s"} shown</p>
              <ButtonLink href="/catalog" variant="outline" className="mt-6 w-full sm:w-auto">Browse accounts <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></ButtonLink>
            </div>

            <div>
              {visibleFaqs.length ? (
                <div className="divide-y divide-border border-y border-border">
                  {visibleFaqs.map((faq, index) => (
                    <details key={faq.question} className="group py-5">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-5 rounded-sm py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="flex min-w-0 gap-4">
                          <span className="pt-0.5 font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                          <span>
                            <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{faq.category}</span>
                            <span className="text-base font-semibold leading-6 text-foreground">{faq.question}</span>
                          </span>
                        </span>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                      </summary>
                      <p className="ml-9 mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No answers match those filters. Clear the search or choose another topic.</div>
              )}
              <div className="mt-8 rounded-xl border border-border bg-card p-6 sm:p-8">
                <p className="site-kicker text-primary">Before you compare</p>
                <h2 className="mt-3 text-xl font-semibold">Read the account terms first.</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">The catalog is read-only. Product details do not establish payment, account allocation, or payout terms.</p>
                <ButtonLink href="/rules" variant="outline" className="mt-5">Open rules center</ButtonLink>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
