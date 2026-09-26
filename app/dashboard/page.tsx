"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/header";
import NotificationsPanel from "@/components/notifications-panel";

interface Trader {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
}

interface SessionData {
  authenticated: boolean;
  trader: Trader | null;
}

interface Order {
  id: string;
  orderNumber: string;
  traderId: string;
  rulesetVersionId: string | null;
  status: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  idempotencyKey: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  accountSize: number | null;
  price: number | null;
  currency: string;
  ruleset: { name: string } | null;
  isActive: boolean;
  displayOrder: number;
}

interface FundedAccount {
  id: string;
  traderId: string;
  evaluationId: string | null;
  accountId: string | null;
  rulesetVersionId: string | null;
  status: string;
  allocatedAt: string | null;
  activatedAt: string | null;
  closedAt: string | null;
  totalPnl: number | null;
  createdAt: string;
  updatedAt: string;
}

type LoadingState = "idle" | "loading";

export default function DashboardPage() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<LoadingState>("idle");
  const [ordersError, setOrdersError] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState<LoadingState>("idle");

  const [fundedAccounts, setFundedAccounts] = useState<FundedAccount[]>([]);
  const [fundedAccountsLoading, setFundedAccountsLoading] = useState<LoadingState>("idle");
  const [fundedAccountsError, setFundedAccountsError] = useState("");

  const [evaluations, setEvaluations] = useState<Array<{
    id: string;
    rulesetName: string | null;
    rulesetVersion: string | null;
    status: string;
    account: { accountNumber: string; broker: string | null; server: string | null; status: string; healthStatus: string } | null;
    startedAt: string;
    completedAt: string | null;
    totalPnl: number | null;
    rulePassedCount: number;
    ruleFailedCount: number;
    ruleWarningCount: number;
  }>>([]);
  const [evaluationsLoading, setEvaluationsLoading] = useState<LoadingState>("idle");
  const [evaluationsError, setEvaluationsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSessionLoading(true);
      try {
        const res = await fetch("/api/auth/session");
        const data = (await res.json()) as SessionData;
        if (!cancelled) setSessionData(data);
      } catch {
        if (!cancelled) setSessionError("Network error. Please try again.");
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionData?.authenticated) return;
    let cancelled = false;
    (async () => {
      async function loadOrders() {
        setOrdersLoading("loading");
        setOrdersError("");
        try {
          const res = await fetch("/api/orders");
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) setOrders(data.orders || []);
          } else {
            const body = await res.json().catch(() => ({}));
            if (!cancelled) setOrdersError((body as { error?: string }).error || "Failed to load orders");
          }
        } catch {
          if (!cancelled) setOrdersError("Network error. Please try again.");
        } finally {
          if (!cancelled) setOrdersLoading("idle");
        }
      }

      async function loadProducts() {
        setProductsLoading("loading");
        try {
          const res = await fetch("/api/products");
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) setProducts((data as { products?: Product[] }).products || []);
          }
        } catch {
          // Products are informational; ignore errors
        } finally {
          if (!cancelled) setProductsLoading("idle");
        }
      }

      async function loadFundedAccounts() {
        setFundedAccountsLoading("loading");
        setFundedAccountsError("");
        try {
          const res = await fetch("/api/funded-accounts");
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) {
              setFundedAccounts((data as { accounts: FundedAccount[] }).accounts || []);
            }
          } else {
            const body = await res.json().catch(() => ({}));
            if (!cancelled) {
              setFundedAccountsError((body as { error?: string }).error || "Failed to load funded accounts");
            }
          }
        } catch {
          if (!cancelled) {
            setFundedAccountsError("Network error. Please try again.");
          }
        } finally {
          if (!cancelled) setFundedAccountsLoading("idle");
        }
      }

      async function loadEvaluations() {
        setEvaluationsLoading("loading");
        setEvaluationsError("");
        try {
          const res = await fetch("/api/evaluations");
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) setEvaluations((data as { evaluations?: Array<{ id: string; rulesetName: string | null; rulesetVersion: string | null; status: string; account: { accountNumber: string; broker: string | null; server: string | null; status: string; healthStatus: string } | null; startedAt: string; completedAt: string | null; totalPnl: number | null; rulePassedCount: number; ruleFailedCount: number; ruleWarningCount: number }> }).evaluations || []);
          } else {
            const body = await res.json().catch(() => ({}));
            if (!cancelled) setEvaluationsError((body as { error?: string }).error || "Failed to load evaluations");
          }
        } catch {
          if (!cancelled) setEvaluationsError("Network error. Please try again.");
        } finally {
          if (!cancelled) setEvaluationsLoading("idle");
        }
      }

      await Promise.all([loadOrders(), loadProducts(), loadFundedAccounts(), loadEvaluations()]);
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionData]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header currentPath="/dashboard" />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <p className="text-gray-500">Loading dashboard…</p>
        </main>
      </div>
    );
  }

  if (!sessionData?.authenticated || !sessionData.trader) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header currentPath="/dashboard" />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6">
            <h2 className="text-lg font-semibold text-red-800">
              Authentication Required
            </h2>
            <p className="mt-1 text-red-600">
              {sessionError || "You must be logged in to access the dashboard."}
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Go to Login
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const trader = sessionData.trader;
  const displayName =
    `${trader.firstName ?? ""} ${trader.lastName ?? ""}`.trim() ||
    trader.email;

  const statusStyles: Record<string, string> = {
    CREATED: "bg-gray-100 text-gray-700",
    PENDING_PAYMENT: "bg-yellow-100 text-yellow-700",
    PAID: "bg-blue-100 text-blue-700",
    FAILED: "bg-red-100 text-red-700",
    CANCELLED: "bg-gray-100 text-gray-500",
    EXPIRED: "bg-gray-100 text-gray-500",
    PENDING: "bg-yellow-100 text-yellow-700",
    ELIGIBLE: "bg-blue-100 text-blue-700",
    APPROVED: "bg-green-100 text-green-700",
    ACTIVE: "bg-green-100 text-green-700",
    SUSPENDED: "bg-red-100 text-red-700",
    TERMINATED: "bg-gray-100 text-gray-500",
    COMPLETED: "bg-green-100 text-green-700",
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPath="/dashboard" />

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            Welcome back, {displayName}
          </h1>
          <p className="mt-1 text-gray-600">
            {trader.role} · Account{" "}
            <span className="font-medium">
              {trader.status === "ACTIVE" ? "Active" : trader.status}
            </span>
          </p>
        </div>

        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Orders</h2>
            <Link
              href="/catalog"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              New Order
            </Link>
          </div>

          {ordersError && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {ordersError}
            </div>
          )}

          {ordersLoading === "loading" ? (
            <p className="text-gray-500">Loading orders…</p>
          ) : orders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-600">No orders yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Visit the catalog to purchase a challenge
              </p>
              <Link
                href="/catalog"
                className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Browse Catalog
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Order #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono">
                        {order.orderNumber}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            statusStyles[order.status] ??
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {order.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        ${order.totalAmount.toLocaleString()}{" "}
                        {order.currency}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold">Order & Activation Status</h2>
          {orders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
              <p className="text-gray-600">No orders yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Purchase an order from the catalog, complete payment, then
                activate it to start an evaluation
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const canActivate = order.status === "PAID";
                return (
                  <div
                    key={order.id}
                    className="rounded-lg border bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-mono font-medium">
                          {order.orderNumber}
                        </span>
                        <span className="ml-3 text-sm text-gray-500">
                          ${order.totalAmount.toLocaleString()}{" "}
                          {order.currency}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            statusStyles[order.status] ??
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {order.status.replace("_", " ")}
                        </span>
                        {canActivate && (
                          <ActivateButton orderId={order.id} />
                        )}
                      </div>
                    </div>
                    {order.status !== "PAID" && (
                      <p className="mt-2 text-xs text-gray-500">
                        {order.status === "CREATED"
                          ? "Awaiting payment to begin evaluation"
                          : order.status === "PENDING_PAYMENT"
                            ? "Payment in progress — activate after confirmation"
                            : order.status === "FAILED"
                              ? "Payment failed — place a new order"
                              : order.status === "CANCELLED"
                                ? "This order was cancelled"
                                : "Order awaiting processing"}
                      </p>
                    )}
                    {order.status === "PAID" && (
                      <p className="mt-2 text-xs text-green-600">
                        Payment confirmed — ready for evaluation activation
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold">Evaluations</h2>

          {evaluationsError ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {evaluationsError}
            </div>
          ) : evaluationsLoading === "loading" ? (
            <p className="text-gray-500">Loading evaluations…</p>
          ) : evaluations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
              <p className="text-gray-600">No evaluations yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Activate a paid order to start an evaluation
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {evaluations.map((evalItem) => (
                <div
                  key={evalItem.id}
                  className="rounded-lg border bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-mono font-medium">
                        {evalItem.id.slice(0, 8)}…
                      </span>
                      <span className="ml-3 text-sm text-gray-500">
                        {evalItem.rulesetName} v{evalItem.rulesetVersion}
                      </span>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        statusStyles[evalItem.status] ??
                        "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {evalItem.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>
                      Rules:{" "}
                      <span className="font-medium text-green-600">
                        {evalItem.rulePassedCount} passed
                      </span>
                      {" · "}
                      <span className="font-medium text-red-600">
                        {evalItem.ruleFailedCount} failed
                      </span>
                      {" · "}
                      <span className="font-medium text-yellow-600">
                        {evalItem.ruleWarningCount} warnings
                      </span>
                    </span>
                    {evalItem.account && (
                      <span>
                        Account:{" "}
                        <span className="font-medium">
                          {evalItem.account.accountNumber}
                        </span>{" "}
                        ({evalItem.account.status})
                        {evalItem.account.broker ? ` · ${evalItem.account.broker}` : ""}
                        {evalItem.account.server ? ` · ${evalItem.account.server}` : ""}
                      </span>
                    )}
                    {evalItem.totalPnl !== null && evalItem.totalPnl !== undefined && (
                      <span>
                        PnL:{" "}
                        <span className="font-medium">
                          ${evalItem.totalPnl.toLocaleString()}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    Started{" "}
                    {new Date(evalItem.startedAt).toLocaleString()}
                    {evalItem.completedAt
                      ? ` · Completed ${new Date(evalItem.completedAt).toLocaleString()}`
                      : " · In progress"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold">Funded Accounts</h2>

          {fundedAccountsError ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {fundedAccountsError}
            </div>
          ) : fundedAccountsLoading === "loading" ? (
            <p className="text-gray-500">Loading funded accounts…</p>
          ) : fundedAccounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
              <p className="text-gray-600">No funded accounts yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Pass your evaluation to receive a funded account
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Account ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Allocated
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      PnL
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {fundedAccounts.map((fa) => (
                    <tr key={fa.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono">
                        {fa.id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            statusStyles[fa.status] ??
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {fa.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {fa.allocatedAt
                          ? new Date(fa.allocatedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {fa.totalPnl !== null && fa.totalPnl !== undefined
                          ? `$${fa.totalPnl.toLocaleString()}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold">Available Products</h2>
          {productsLoading === "loading" ? (
            <p className="text-gray-500">Loading products…</p>
          ) : products.length === 0 ? (
            <p className="text-gray-500">No products available.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products
                .filter((p) => p.isActive)
                .map((product) => (
                  <div
                    key={product.id}
                    className="rounded-lg border bg-white p-4 shadow-sm"
                  >
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {product.description?.slice(0, 80) ??
                        "No description"}
                      {product.description &&
                      product.description.length > 80
                        ? "…"
                        : ""}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {product.price
                          ? `$${product.price.toLocaleString()} ${product.currency}`
                          : "Contact for pricing"}
                      </span>
                      <Link
                        href="/catalog"
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        <NotificationsPanel sessionData={sessionData} />
      </main>
    </div>
  );
}

function ActivateButton({ orderId }: { orderId: string }) {
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleActivate() {
    setActivating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentReference: "demo-payment" }),
      });
      const data = await res.json();
      if (res.ok) {
        const isDemo = (data as { isDemoPayment?: boolean }).isDemoPayment;
        setMessage({
          type: "success",
          text: isDemo
            ? "Evaluation activated (demo mode)"
            : "Evaluation activated successfully",
        });
      } else {
        setMessage({
          type: "error",
          text: data.error || "Activation failed",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleActivate}
        disabled={activating}
        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {activating ? "Activating…" : "Activate (Demo)"}
      </button>
      {message && (
        <span
          className={`text-xs ${
            message.type === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
