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
    product: { name: string } | null;
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

type LifecycleSection = "orders" | "evaluations" | "fundedAccounts" | "assignments";

interface LifecycleData {
  customer: Customer;
  orders: Order[];
  evaluations: Evaluation[];
  fundedAccounts: FundedAccount[];
  assignments: Assignment[];
  nextCursors: Record<LifecycleSection, string | null>;
}

const LIFECYCLE_PAGE_SIZE = 25;

export default function AdminCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<LifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState<LifecycleSection | null>(null);
  const [olderErrors, setOlderErrors] = useState<Record<LifecycleSection, string>>({
    orders: "",
    evaluations: "",
    fundedAccounts: "",
    assignments: "",
  });

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/lifecycle?customerId=${encodeURIComponent(id as string)}&limit=${LIFECYCLE_PAGE_SIZE}`)
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

  async function loadOlder(section: LifecycleSection) {
    const cursor = data?.nextCursors[section];
    if (!id || !cursor || loadingOlder) return;
    setLoadingOlder(section);
    setOlderErrors((current) => ({ ...current, [section]: "" }));
    try {
      const query = new URLSearchParams({
        customerId: id,
        section,
        limit: String(LIFECYCLE_PAGE_SIZE),
        before: cursor,
      });
      const response = await fetch(`/api/admin/lifecycle?${query.toString()}`);
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      const nextCursors = body.nextCursors;
      const items = body[section];
      const nextCursor = typeof nextCursors === "object" && nextCursors !== null && !Array.isArray(nextCursors)
        ? (nextCursors as Record<string, unknown>)[section]
        : undefined;

      if (!response.ok || body.success !== true || !Array.isArray(items) || (typeof nextCursor !== "string" && nextCursor !== null)) {
        const message = typeof body.error === "string" ? body.error : "Older history could not be loaded. Please try again.";
        setOlderErrors((current) => ({ ...current, [section]: message }));
        return;
      }

      setData((current) => {
        if (!current) return current;
        const updatedCursors = { ...current.nextCursors, [section]: nextCursor };
        if (section === "orders") return { ...current, orders: [...current.orders, ...(items as Order[])], nextCursors: updatedCursors };
        if (section === "evaluations") return { ...current, evaluations: [...current.evaluations, ...(items as Evaluation[])], nextCursors: updatedCursors };
        if (section === "fundedAccounts") return { ...current, fundedAccounts: [...current.fundedAccounts, ...(items as FundedAccount[])], nextCursors: updatedCursors };
        return { ...current, assignments: [...current.assignments, ...(items as Assignment[])], nextCursors: updatedCursors };
      });
    } catch {
      setOlderErrors((current) => ({ ...current, [section]: "Network error while loading older history." }));
    } finally {
      setLoadingOlder(null);
    }
  }

  function loadOlderControl(section: LifecycleSection, label: string) {
    if (!data) return null;
    const hasMore = Boolean(data.nextCursors[section]);
    const sectionError = olderErrors[section];
    if (!hasMore && !sectionError) return null;
    return (
      <div className="mt-4 space-y-2">
        {sectionError && <p className="text-sm text-danger" role="alert">{sectionError}</p>}
        {hasMore && (
          <button
            type="button"
            onClick={() => void loadOlder(section)}
            disabled={loadingOlder !== null}
            aria-busy={loadingOlder === section}
            className="min-h-10 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingOlder === section ? `Loading older ${label}…` : sectionError ? "Try again" : `Load older ${label}`}
          </button>
        )}
      </div>
    );
  }

  if (loading) return <div className="p-8 max-w-6xl mx-auto"><p className="text-muted-foreground">Loading customer lifecycle…</p></div>;
  if (error) return <div className="p-8 max-w-6xl mx-auto"><p className="text-danger">{error}</p><Link href="/admin" className="mt-4 inline-block px-4 py-2 bg-muted rounded">Back to Admin</Link></div>;
  if (!data) return <div className="p-8 max-w-6xl mx-auto"><p>No data</p></div>;

  const customer = data.customer;
  const displayName = `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || customer.email;

  const statusStyles: Record<string, string> = {
    ACTIVE: "bg-success-light text-success",
    PENDING: "bg-warning-light text-warning",
    SUSPENDED: "bg-danger-light text-danger",
    INACTIVE: "bg-muted text-muted-foreground",
    CREATED: "bg-muted text-muted-foreground",
    PENDING_PAYMENT: "bg-warning-light text-warning",
    PAID: "bg-info-light text-info",
    FAILED: "bg-danger-light text-danger",
    CANCELLED: "bg-muted text-muted-foreground",
    EXPIRED: "bg-muted text-muted-foreground",
    IN_PROGRESS: "bg-info-light text-info",
    PASSED: "bg-success-light text-success",
    FAILED_EVAL: "bg-danger-light text-danger",
    ABANDONED: "bg-muted text-muted-foreground",
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <p className="text-muted-foreground">{customer.email} · {customer.role} · {customer.status}</p>
        </div>
        <Link href="/admin" className="px-4 py-2 bg-muted rounded hover:bg-muted">Back to Admin</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-3 border rounded"><p className="text-xs text-muted-foreground uppercase">Customer ID</p><p className="font-medium font-mono text-sm">{customer.id.slice(0, 8)}…</p></div>
        <div className="p-3 border rounded"><p className="text-xs text-muted-foreground uppercase">Status</p><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[customer.status] ?? "bg-muted text-muted-foreground"}`}>{customer.status}</span></div>
        <div className="p-3 border rounded"><p className="text-xs text-muted-foreground uppercase">Role</p><p className="font-medium">{customer.role}</p></div>
        <div className="p-3 border rounded"><p className="text-xs text-muted-foreground uppercase">Created</p><p className="font-medium">{new Date(customer.createdAt).toLocaleDateString()}</p></div>
      </div>

      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Orders</h2>
        {data.orders.length === 0 ? (
          <p className="text-muted-foreground">No orders</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-background">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Order #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {data.orders.map((order: Order) => (
                  <tr key={order.id} className="hover:bg-background">
                    <td className="px-4 py-3 text-sm font-mono">{order.orderNumber}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[order.status] ?? "bg-muted text-muted-foreground"}`}>{order.status.replace("_", " ")}</span></td>
                    <td className="px-4 py-3 text-sm">${order.totalAmount.toLocaleString()} {order.currency}</td>
                    <td className="px-4 py-3 text-sm">{order.orderItems[0]?.product?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {loadOlderControl("orders", "orders")}
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Evaluations</h2>
        {data.evaluations.length === 0 ? (
          <p className="text-muted-foreground">No evaluations</p>
        ) : (
          <div className="space-y-3">
            {data.evaluations.map((evalItem: Evaluation) => (
              <div key={evalItem.id} className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-mono font-medium">{evalItem.id.slice(0, 8)}…</span>
                    <span className="ml-3 text-sm text-muted-foreground">{evalItem.rulesetName ?? "—"} {evalItem.rulesetVersion ? `v${evalItem.rulesetVersion}` : ""}</span>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[evalItem.status] ?? "bg-muted text-muted-foreground"}`}>{evalItem.status.replace("_", " ")}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {evalItem.account && (
                    <span>Account: <span className="font-medium">{evalItem.account.accountNumber}</span> ({evalItem.account.status})</span>
                  )}
                  {evalItem.totalPnl !== null && evalItem.totalPnl !== undefined && (
                    <span>PnL: <span className="font-medium">${(evalItem.totalPnl as number).toLocaleString()}</span></span>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Started {new Date(evalItem.startedAt).toLocaleString()}
                  {evalItem.completedAt ? ` · Completed ${new Date(evalItem.completedAt).toLocaleString()}` : " · In progress"}
                </div>
              </div>
            ))}
          </div>
        )}
        {loadOlderControl("evaluations", "evaluations")}
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Funded Accounts</h2>
        {data.fundedAccounts.length === 0 ? (
          <p className="text-muted-foreground">No funded accounts</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-background">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Allocated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Activated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {data.fundedAccounts.map((fa: FundedAccount) => (
                  <tr key={fa.id} className="hover:bg-background">
                    <td className="px-4 py-3 text-sm font-mono">{fa.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[fa.status] ?? "bg-muted text-muted-foreground"}`}>{fa.status}</span></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{fa.allocatedAt ? new Date(fa.allocatedAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{fa.activatedAt ? new Date(fa.activatedAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(fa.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {loadOlderControl("fundedAccounts", "funded accounts")}
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Assigned MT5 Accounts</h2>
        {data.assignments.length === 0 ? (
          <p className="text-muted-foreground">No active assignments</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-background">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Account #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Broker</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Server</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Health</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Assigned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {data.assignments.map((a: Assignment) => (
                  <tr key={a.id} className="hover:bg-background">
                    <td className="px-4 py-3 text-sm font-mono">{a.account.accountNumber}</td>
                    <td className="px-4 py-3 text-sm">{a.account.broker ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{a.account.server ?? "—"}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[a.account.status] ?? "bg-muted text-muted-foreground"}`}>{a.account.status}</span></td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[a.account.healthStatus] ?? "bg-muted text-muted-foreground"}`}>{a.account.healthStatus}</span></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(a.assignedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {loadOlderControl("assignments", "assignments")}
      </section>
    </div>
  );
}
