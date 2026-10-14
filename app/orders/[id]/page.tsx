"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CircleHelp } from "lucide-react";
import TraderPageShell from "@/components/trader-page-shell";
import TraderLoadError from "@/components/trader-load-error";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, LoadingState, StatusBadge } from "@/components/ui";
import { formatAmount, formatDate } from "@/components/trader-format";

interface SnapshotStage {
  displayName?: string;
  order?: number;
  rules?: Array<{ id?: string | null; name?: string; type?: string; disposition?: string }>;
}

interface ProductSnapshot {
  name?: string;
  code?: string | null;
  category?: string | null;
  evaluationStructure?: string | null;
  accountSize?: string | number | null;
  denominationCurrency?: string | null;
  stages?: SnapshotStage[];
}

interface OrderItem {
  id: string;
  unitPrice: string | number;
  currency: string;
  quantity: number;
  status: string;
  productSnapshot: unknown;
  product?: { name: string; accountSize: string | number | null } | null;
}

interface OrderRecord {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  subtotal: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  orderItems: OrderItem[];
}

function getSnapshot(value: unknown): ProductSnapshot | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ProductSnapshot : null;
}

export default function OrderDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadOrder() {
      setLoading(true);
      setError("");
      setSignInRequired(false);
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setSignInRequired(true);
          throw new Error("Sign in to view this order.");
        }
        if (response.status === 404) {
          setOrder(null);
          return;
        }
        if (!response.ok || !data.success || !data.order) throw new Error("Order details are unavailable right now.");
        setOrder(data.order);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Order details are unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadOrder();
    return () => controller.abort();
  }, [id, retryKey]);

  return (
    <TraderPageShell currentPath="/orders" title="Order details" description="The order record and its captured product terms." actions={<Link href="/orders" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All orders</Link>}>
      {error ? (
        <TraderLoadError title="Order details unavailable" message={error} signInRequired={signInRequired} onRetry={() => setRetryKey((key) => key + 1)} />
      ) : loading ? (
        <LoadingState variant="skeleton" text="Loading order details" />
      ) : !order ? (
        <EmptyState title="Order not found" description="This order is not available in your order history." variant="card" action={{ label: "View orders", onClick: () => router.push("/orders") }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="font-mono">{order.orderNumber}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Placed {formatDate(order.createdAt)}</p></div><StatusBadge status={order.status} /></CardHeader>
            <CardContent>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Captured product terms</h2>
              {order.orderItems.length === 0 ? <p className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">No order items are present in this record.</p> : <div className="space-y-4">{order.orderItems.map((item) => {
                const snapshot = getSnapshot(item.productSnapshot);
                const name = snapshot?.name || item.product?.name || "Product details unavailable";
                return <article key={item.id} className="rounded-xl border border-border p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-foreground">{name}</h3><p className="mt-1 text-sm text-muted-foreground">{snapshot?.category || "Category unavailable"}{snapshot?.code ? ` · ${snapshot.code}` : ""}</p></div><Badge variant="outline">{item.status.replace(/_/g, " ")}</Badge></div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2"><Detail label="Account size" value={formatAmount(snapshot?.accountSize, snapshot?.denominationCurrency) ?? "Unavailable"} /><Detail label="Evaluation structure" value={snapshot?.evaluationStructure?.replace(/_/g, " ") || "Unavailable"} /><Detail label="Unit price" value={formatAmount(item.unitPrice, item.currency) ?? "Unavailable"} /><Detail label="Quantity" value={String(item.quantity)} /></div>
                  {snapshot?.stages && snapshot.stages.length > 0 && <div className="mt-5"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Captured stages and rule names</h4><ol className="mt-2 space-y-3">{snapshot.stages.map((stage, index) => <li key={`${stage.order ?? index}-${stage.displayName ?? "stage"}`} className="rounded-lg bg-muted/50 p-3"><p className="text-sm font-medium text-foreground">{stage.order ?? index + 1}. {stage.displayName || "Evaluation stage"}</p>{stage.rules?.length ? <ul className="mt-2 flex flex-wrap gap-2">{stage.rules.map((rule, ruleIndex) => <li key={rule.id ?? `${rule.type}-${ruleIndex}`}><Badge variant="outline" size="sm">{rule.name || rule.type || "Rule"}{rule.disposition ? ` · ${rule.disposition.toLowerCase()}` : ""}</Badge></li>)}</ul> : <p className="mt-1 text-xs text-muted-foreground">No rule names were captured for this stage.</p>}</li>)}</ol></div>}
                </article>;
              })}</div>}
              {order.notes && <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order note</p><p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{order.notes}</p></div>}
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Order total</CardTitle></CardHeader>
              <CardContent className="space-y-3"><Detail label="Subtotal" value={formatAmount(order.subtotal, order.currency) ?? "Unavailable"} /><Detail label="Tax" value={formatAmount(order.taxAmount, order.currency) ?? "Unavailable"} /><div className="border-t border-border pt-3"><Detail label="Total recorded" value={formatAmount(order.totalAmount, order.currency) ?? "Unavailable"} /></div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Payment and activity</CardTitle></CardHeader>
              <CardContent>
                {order.status === "PENDING_PAYMENT" && <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4" role="status"><CircleHelp className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" /><p className="text-sm leading-6 text-muted-foreground">This order is still pending. This screen does not initiate payment, confirm a transaction, or activate an evaluation.</p></div>}
                <p className="text-sm leading-6 text-muted-foreground">The order API does not expose transaction history. Current status: <span className="font-semibold text-foreground">{order.status.replace(/_/g, " ")}</span>.</p>
                <p className="mt-3 text-xs text-muted-foreground">Last order record update: {formatDate(order.updatedAt)}</p>
              </CardContent>
            </Card>
            <div className="flex flex-wrap gap-3"><Link href="/catalog" className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Browse products</Link><Link href="/dashboard" className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted">Dashboard</Link></div>
          </div>
        </div>
      )}
    </TraderPageShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border px-3 py-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p></div>;
}
