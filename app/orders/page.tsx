"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import TraderPageShell from "@/components/trader-page-shell";
import TraderLoadError from "@/components/trader-load-error";
import { ButtonLink, Card, EmptyState, LoadingState, StatusBadge } from "@/components/ui";
import { formatAmount, formatDate } from "@/components/trader-format";

interface ProductSnapshot {
  name?: string | null;
  category?: string | null;
  accountSize?: string | number | null;
  denominationCurrency?: string | null;
}

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: string | number;
  currency: string;
  status: string;
  productSnapshot: unknown;
}

interface OrderRecord {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  subtotal: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  createdAt: string;
  orderItems: OrderItem[];
}

function productName(snapshot: unknown): string {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && "name" in snapshot && typeof snapshot.name === "string") return snapshot.name;
  return "Product details unavailable";
}

function snapshotDetails(snapshot: unknown): ProductSnapshot | null {
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot as ProductSnapshot : null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadOrders() {
      setLoading(true);
      setError("");
      setSignInRequired(false);
      try {
        const response = await fetch("/api/orders", { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setSignInRequired(true);
          throw new Error("Sign in to view your orders.");
        }
        if (!response.ok || !data.success || !Array.isArray(data.orders)) throw new Error("Order history is unavailable right now.");
        setOrders(data.orders);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Order history is unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadOrders();
    return () => controller.abort();
  }, [retryKey]);

  const statuses = useMemo(() => [...new Set(orders.map((order) => order.status))].sort(), [orders]);
  const visibleOrders = statusFilter === "ALL" ? orders : orders.filter((order) => order.status === statusFilter);

  return (
    <TraderPageShell currentPath="/orders" title="Orders" description="Review order totals and the latest recorded status from your order history." actions={<><ButtonLink href="/catalog" variant="outline">Browse products</ButtonLink><ButtonLink href="/dashboard" variant="outline">Dashboard</ButtonLink></>}>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">{loading ? "Loading orders…" : `${visibleOrders.length} ${visibleOrders.length === 1 ? "order" : "orders"}`}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="order-status-filter" className="text-sm font-medium text-foreground">Filter by status
            <select id="order-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="ml-2 min-h-10 rounded-lg border border-input-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="ALL">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh</button>
        </div>
      </div>

      {error ? (
        <TraderLoadError title="Order history unavailable" message={error} signInRequired={signInRequired} onRetry={() => setRetryKey((key) => key + 1)} />
      ) : loading ? (
        <LoadingState variant="skeleton" text="Loading your orders" />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Orders will appear here after they are recorded by the order service." variant="card"><Link href="/catalog" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Browse products</Link></EmptyState>
      ) : visibleOrders.length === 0 ? (
        <EmptyState title="No orders match this status" description="Choose another status filter to see your orders." variant="bordered" />
      ) : (
        <div className="space-y-4">
          {visibleOrders.map((order) => (
            <Card key={order.id} className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order</p><h2 className="mt-1 font-mono text-lg font-semibold text-card-foreground">{order.orderNumber}</h2><p className="mt-1 text-sm text-muted-foreground">Placed {formatDate(order.createdAt)}</p></div>
                <StatusBadge status={order.status} />
              </div>
              <ul className="mt-4 divide-y divide-border rounded-xl border border-border px-4">
                {order.orderItems.slice(0, 3).map((item) => {
                  const snapshot = snapshotDetails(item.productSnapshot);
                  const accountSize = formatAmount(snapshot?.accountSize, snapshot?.denominationCurrency);
                  return <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium text-foreground">{productName(item.productSnapshot)}</p><p className="mt-1 text-xs text-muted-foreground">{snapshot?.category || "Product category unavailable"}{accountSize ? ` · ${accountSize} account size` : ""}</p></div><div className="text-right"><p className="text-sm font-semibold text-foreground">{formatAmount(item.unitPrice, item.currency) ?? "Amount unavailable"}</p><p className="mt-1 text-xs text-muted-foreground">Qty {item.quantity} · {item.status.replace(/_/g, " ")}</p></div></li>;
                })}
                {order.orderItems.length > 3 && <li className="py-3 text-xs text-muted-foreground">Showing 3 of {order.orderItems.length} items</li>}
              </ul>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <div><p className="text-xs text-muted-foreground">Order total</p><p className="mt-1 text-lg font-semibold text-foreground">{formatAmount(order.totalAmount, order.currency) ?? "Amount unavailable"}</p></div>
                <Link href={`/orders/${order.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Order details <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
              {order.status === "PENDING_PAYMENT" && <p className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-muted-foreground" role="status">This order remains pending. The order status does not confirm payment or evaluation activation.</p>}
            </Card>
          ))}
        </div>
      )}
    </TraderPageShell>
  );
}
