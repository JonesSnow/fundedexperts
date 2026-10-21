'use client';

import { useState } from "react";
import Link from "next/link";

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

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Admin Panel</h1>
      <p className="text-muted-foreground mb-6">Manage products, rulesets, and customer lifecycles.</p>

      <div className="mb-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/funded-accounts"
            className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Review funded accounts
          </Link>
          <Link
            href="/admin/audit-logs"
            className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Review audit history
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3" role="group" aria-label="Admin sections">
        <button
          type="button"
          aria-pressed={activeTab === "products"}
          onClick={() => setActiveTab("products")}
          className={`min-h-10 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${activeTab === "products" ? "border-secondary bg-secondary text-secondary-foreground" : "border-border bg-card text-foreground hover:bg-muted"}`}
        >
          Products
        </button>
        <button
          type="button"
          aria-pressed={activeTab === "rulesets"}
          onClick={() => setActiveTab("rulesets")}
          className={`min-h-10 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${activeTab === "rulesets" ? "border-secondary bg-secondary text-secondary-foreground" : "border-border bg-card text-foreground hover:bg-muted"}`}
        >
          Rulesets
        </button>
        <button
          type="button"
          aria-pressed={activeTab === "customers"}
          onClick={() => setActiveTab("customers")}
          className={`min-h-10 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${activeTab === "customers" ? "border-secondary bg-secondary text-secondary-foreground" : "border-border bg-card text-foreground hover:bg-muted"}`}
        >
          Customers
        </button>
      </div>

      {activeTab === "products" && (
        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            <Link href="/admin/products" className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary">Manage product drafts</Link>
            <Link
              href="/admin/products/new"
              className="px-4 py-2 bg-success text-primary-foreground rounded hover:bg-success-hover"
            >
              Add Product
            </Link>
          </div>
          <p className="text-muted-foreground">Products start as non-purchasable drafts. Server validation controls publication.</p>
        </div>
      )}

      {activeTab === "rulesets" && (
        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            <Link href="/admin/rulesets" className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary">Manage versions and rules</Link>
            <Link
              href="/admin/rulesets/new"
              className="px-4 py-2 bg-success text-primary-foreground rounded hover:bg-success-hover"
            >
              Create Ruleset
            </Link>
          </div>
          <p className="text-muted-foreground">Published versions are read-only. Rule changes require a new draft version.</p>
        </div>
      )}

      {activeTab === "customers" && (
        <div>
          <form
            onSubmit={(event) => { event.preventDefault(); void searchCustomers(); }}
            className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="w-full max-w-md">
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
                className="min-h-11 w-full rounded-lg border border-input-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p id="customer-search-hint" className="mt-1.5 text-xs leading-5 text-muted-foreground">Search for one customer by their account email.</p>
            </div>
            <button
              type="submit"
              disabled={loadingCustomers}
              aria-busy={loadingCustomers}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingCustomers ? "Searching…" : "Find customer"}
            </button>
          </form>
          {loadingCustomers ? (
            <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Searching for this customer…</p>
          ) : searchError ? (
            <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{searchError}</p>
          ) : customers.length === 0 ? (
            <p role={searchCompleted ? "status" : undefined} className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              {searchCompleted ? "No customer was found for that email address." : "Search by email to find a customer and view their lifecycle."}
            </p>
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
                    <tr key={c.id} className="hover:bg-background">
                      <td className="px-4 py-3 text-sm">{c.email}</td>
                      <td className="px-4 py-3 text-sm">{c.role}</td>
                      <td className="px-4 py-3 text-sm">{c.status}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/customers/${c.id}`}
                          className="rounded bg-info-light px-2 py-1 text-sm text-info hover:bg-info/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          View Lifecycle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
