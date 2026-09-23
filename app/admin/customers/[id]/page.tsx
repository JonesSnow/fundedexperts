"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Customer {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  createdAt: string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  createdAt: string;
  orderItems: Array<{
    product: { name: string; price: number | null; accountSize: number | null };
  }>;
}

interface Evaluation {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalPnl: unknown;
  maxDrawdown: unknown;
  rulesetName: string | null;
  rulesetVersion: string | null;
  account: { accountNumber: string; broker: string | null; server: string | null; status: string; healthStatus: string } | null;
  ruleResults: Array<{ ruleName: string; result: string }>;
}

interface FundedAccount {
  id: string;
  status: string;
  allocatedAt: string | null;
  activatedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

interface Assignment {
  id: string;
  account: {
    id: string;
    accountNumber: string;
    broker: string | null;
    server: string | null;
    status: string;
    healthStatus: string;
  };
  assignedAt: string;
}

interface LifecycleData {
  customer: Customer;
  orders: Order[];
  evaluations: Evaluation[];
  fundedAccounts: FundedAccount[];
  assignments: Assignment[];
}

export default function AdminCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<LifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/lifecycle?customerId=${encodeURIComponent(id as string)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setData(data);
        } else {
          setError(data.error || "Failed to load customer lifecycle");
        }
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 max-w-6xl mx-auto"><p className="text-gray-500">Loading customer lifecycle…</p></div>;
  if (error) return <div className="p-8 max-w-6xl mx-auto"><p className="text-red-600">{error}</p><Link href="/admin" className="mt-4 inline-block px-4 py-2 bg-gray-300 rounded">Back to Admin</Link></div>;
  if (!data) return <div className="p-8 max-w-6xl mx-auto"><p>No data</p></div>;

  const customer = data.customer;
  const displayName = `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || customer.email;

  const statusStyles: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    PENDING: "bg-yellow-100 text-yellow-700",
    SUSPENDED: "bg-red-100 text-red-700",
    INACTIVE: "bg-gray-100 text-gray-700",
    CREATED: "bg-gray-100 text-gray-700",
    PENDING_PAYMENT: "bg-yellow-100 text-yellow-700",
    PAID: "bg-blue-100 text-blue-700",
    FAILED: "bg-red-100 text-red-700",
    CANCELLED: "bg-gray-100 text-gray-500",
    EXPIRED: "bg-gray-100 text-gray-500",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    PASSED: "bg-green-100 text-green-700",
    FAILED_EVAL: "bg-red-100 text-red-700",
    ABANDONED: "bg-gray-100 text-gray-500",
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <p className="text-gray-600">{customer.email} · {customer.role} · {customer.status}</p>
        </div>
        <Link href="/admin" className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Back to Admin</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-3 border rounded"><p className="text-xs text-gray-500 uppercase">Customer ID</p><p className="font-medium font-mono text-sm">{customer.id.slice(0, 8)}…</p></div>
        <div className="p-3 border rounded"><p className="text-xs text-gray-500 uppercase">Status</p><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[customer.status] ?? "bg-gray-100 text-gray-700"}`}>{customer.status}</span></div>
        <div className="p-3 border rounded"><p className="text-xs text-gray-500 uppercase">Role</p><p className="font-medium">{customer.role}</p></div>
        <div className="p-3 border rounded"><p className="text-xs text-gray-500 uppercase">Created</p><p className="font-medium">{new Date(customer.createdAt).toLocaleDateString()}</p></div>
      </div>

      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Orders</h2>
        {data.orders.length === 0 ? (
          <p className="text-gray-500">No orders</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Order #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.orders.map((order: Order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">{order.orderNumber}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[order.status] ?? "bg-gray-100 text-gray-700"}`}>{order.status.replace("_", " ")}</span></td>
                    <td className="px-4 py-3 text-sm">${order.totalAmount.toLocaleString()} {order.currency}</td>
                    <td className="px-4 py-3 text-sm">{order.orderItems[0]?.product?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Evaluations</h2>
        {data.evaluations.length === 0 ? (
          <p className="text-gray-500">No evaluations</p>
        ) : (
          <div className="space-y-3">
            {data.evaluations.map((evalItem: Evaluation) => (
              <div key={evalItem.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-mono font-medium">{evalItem.id.slice(0, 8)}…</span>
                    <span className="ml-3 text-sm text-gray-500">{evalItem.rulesetName ?? "—"} {evalItem.rulesetVersion ? `v${evalItem.rulesetVersion}` : ""}</span>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[evalItem.status] ?? "bg-gray-100 text-gray-700"}`}>{evalItem.status.replace("_", " ")}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                  {evalItem.account && (
                    <span>Account: <span className="font-medium">{evalItem.account.accountNumber}</span> ({evalItem.account.status})</span>
                  )}
                  {evalItem.totalPnl !== null && evalItem.totalPnl !== undefined && (
                    <span>PnL: <span className="font-medium">${(evalItem.totalPnl as number).toLocaleString()}</span></span>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  Started {new Date(evalItem.startedAt).toLocaleString()}
                  {evalItem.completedAt ? ` · Completed ${new Date(evalItem.completedAt).toLocaleString()}` : " · In progress"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Funded Accounts</h2>
        {data.fundedAccounts.length === 0 ? (
          <p className="text-gray-500">No funded accounts</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Allocated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Activated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.fundedAccounts.map((fa: FundedAccount) => (
                  <tr key={fa.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">{fa.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[fa.status] ?? "bg-gray-100 text-gray-700"}`}>{fa.status}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fa.allocatedAt ? new Date(fa.allocatedAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fa.activatedAt ? new Date(fa.activatedAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(fa.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Assigned MT5 Accounts</h2>
        {data.assignments.length === 0 ? (
          <p className="text-gray-500">No active assignments</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Account #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Broker</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Server</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Health</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Assigned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.assignments.map((a: Assignment) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">{a.account.accountNumber}</td>
                    <td className="px-4 py-3 text-sm">{a.account.broker ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{a.account.server ?? "—"}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[a.account.status] ?? "bg-gray-100 text-gray-700"}`}>{a.account.status}</span></td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[a.account.healthStatus] ?? "bg-gray-100 text-gray-700"}`}>{a.account.healthStatus}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(a.assignedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
