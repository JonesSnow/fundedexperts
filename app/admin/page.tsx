'use client';

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, CheckCircle, ShieldCheck, Users } from "lucide-react";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"products" | "rulesets" | "customers">("products");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customers, setCustomers] = useState<Array<{ id: string; email: string; role: string; status: string }>>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchCompleted, setSearchCompleted] = useState(false);

  async function searchCustomers() {
    const email = customerEmail.trim();
    if (!email) return;
    setLoadingCustomers(true);
    setSearchError("");
    setSearchCompleted(false);
    setCustomers([]);
    try {
      const res = await fetch(`/api/admin/lifecycle?email=${encodeURIComponent(email)}&identityOnly=true`);
      const data = await res.json();
      if (res.status === 404) {
        setSearchCompleted(true);
        return;
      }
      if (!res.ok || !data.success || !data.customer) throw new Error("Customer lookup failed.");
      setCustomers([data.customer]);
      setSearchCompleted(true);
    } catch {
      setSearchError("Customer lookup is unavailable. Please try again.");
    } finally {
      setLoadingCustomers(false);
    }
  }

  const tabs = [
    { key: "products" as const, label: "Product configuration", href: "/admin/products", icon: ShieldCheck },
    { key: "rulesets" as const, label: "Ruleset versions", href: "/admin/rulesets", icon: CheckCircle },
    { key: "customers" as const, label: "Customer lifecycle", href: "/admin/customers", icon: Users },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header currentPath="/admin" />
      <main className="flex-1 relative z-0">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
          <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="site-kicker text-emerald-400">Admin workspace</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Operational control</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Manage product drafts, ruleset versions, and customer lifecycle records. Published versions are read-only.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/funded-accounts"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Review funded accounts
                </Link>
                <Link
                  href="/admin/audit-logs"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Review audit history
                </Link>
              </div>
            </div>
          </div>

          <nav aria-label="Admin sections" className="mb-8">
            <div className="flex flex-wrap gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    activeTab === tab.key
                      ? "bg-emerald-600 text-white"
                      : "border border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  <tab.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {activeTab === "products" && (
            <section aria-label="Product management">
              <div className="mb-4 flex flex-wrap gap-3">
                <Link href="/admin/products" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2">
                  Manage product drafts <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/admin/products/new"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-600/10 px-4 py-3 text-sm font-semibold text-emerald-400 transition-colors hover:bg-emerald-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
                >
                  Add product <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                Products start as non-purchasable drafts. Server validation controls publication.
              </p>
            </section>
          )}

          {activeTab === "rulesets" && (
            <section aria-label="Ruleset management">
              <div className="mb-4 flex flex-wrap gap-3">
                <Link href="/admin/rulesets" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2">
                  Manage versions and rules <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/admin/rulesets/new"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-600/10 px-4 py-3 text-sm font-semibold text-emerald-400 transition-colors hover:bg-emerald-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
                >
                  Create ruleset <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                Published versions are read-only. Rule changes require a new draft version.
              </p>
            </section>
          )}

          {activeTab === "customers" && (
            <section aria-label="Customer lookup">
              <form
                onSubmit={(event) => { event.preventDefault(); void searchCustomers(); }}
                className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <div className="flex-1 max-w-md">
                  <label htmlFor="customer-email" className="mb-1.5 block text-sm font-medium text-foreground">Customer email</label>
                  <input
                    id="customer-email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={320}
                    placeholder="name@example.com"
                    value={customerEmail}
                    onChange={(event) => { setCustomerEmail(event.target.value); setSearchError(""); setSearchCompleted(false); }}
                    aria-describedby="customer-search-hint"
                    className="w-full min-h-11 rounded-xl border border-input-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p id="customer-search-hint" className="mt-1.5 text-xs leading-5 text-muted-foreground">Search for one customer by their account email.</p>
                </div>
                <button
                  type="submit"
                  disabled={loadingCustomers}
                  aria-busy={loadingCustomers}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingCustomers ? "Searching…" : "Find customer"}
                </button>
              </form>
              {loadingCustomers ? (
                <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground" role="status">Searching for this customer…</div>
              ) : searchError ? (
                <div role="alert" className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{searchError}</div>
              ) : customers.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground" role={searchCompleted ? "status" : undefined}>
                  {searchCompleted ? "No customer was found for that email address." : "Search by email to find a customer and view their lifecycle."}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-background">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">View</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {customers.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3 text-sm">{c.email}</td>
                          <td className="px-4 py-3 text-sm">{c.role}</td>
                          <td className="px-4 py-3 text-sm">{c.status}</td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/customers/${c.id}`}
                              className="inline-flex min-h-8 items-center gap-1 rounded bg-emerald-600/10 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
                            >
                              View lifecycle <ArrowRight className="h-3 w-3" aria-hidden="true" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
