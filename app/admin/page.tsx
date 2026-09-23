'use client';

import { useState } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"products" | "rulesets" | "customers">("products");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customers, setCustomers] = useState<Array<{ id: string; email: string; role: string; status: string }>>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  async function searchCustomers() {
    if (!customerEmail.trim()) return;
    setLoadingCustomers(true);
    try {
      const res = await fetch(`/api/admin/lifecycle?customerId=${encodeURIComponent(customerEmail)}`);
      const data = await res.json();
      if (data.success && data.customer) {
        setCustomers([data.customer]);
      } else {
        setCustomers([]);
      }
    } catch {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Admin Panel</h1>
      <p className="text-gray-600 mb-6">Manage products, rulesets, and customer lifecycles.</p>

      <div className="flex gap-4 mb-6 flex-wrap">
        <button
          onClick={() => setActiveTab("products")}
          className={`px-4 py-2 rounded ${activeTab === "products" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          Products
        </button>
        <button
          onClick={() => setActiveTab("rulesets")}
          className={`px-4 py-2 rounded ${activeTab === "rulesets" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          Rulesets
        </button>
        <button
          onClick={() => setActiveTab("customers")}
          className={`px-4 py-2 rounded ${activeTab === "customers" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          Customers
        </button>
      </div>

      {activeTab === "products" && (
        <div>
          <div className="mb-4">
            <Link
              href="/admin/products/new"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add Product
            </Link>
          </div>
          <p className="text-gray-500">Product management interface will be expanded in a future phase.</p>
        </div>
      )}

      {activeTab === "rulesets" && (
        <div>
          <div className="mb-4">
            <Link
              href="/admin/rulesets/new"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Create Ruleset
            </Link>
          </div>
          <p className="text-gray-500">Ruleset management interface will be expanded in a future phase.</p>
        </div>
      )}

      {activeTab === "customers" && (
        <div>
          <div className="mb-4 flex gap-2">
            <input
              type="email"
              placeholder="Customer email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="px-3 py-2 border rounded w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={searchCustomers}
              disabled={loadingCustomers}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingCustomers ? "Searching…" : "Find Customer"}
            </button>
          </div>
          {customers.length === 0 ? (
            <p className="text-gray-500">Search by email to find a customer and view their lifecycle.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{c.email}</td>
                      <td className="px-4 py-3 text-sm">{c.role}</td>
                      <td className="px-4 py-3 text-sm">{c.status}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/customers/${c.id}`}
                          className="px-2 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
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
