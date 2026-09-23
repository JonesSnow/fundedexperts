'use client';

import { useState, useEffect } from "react";

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

interface OrderResult {
  success: boolean;
  order?: { id: string; orderNumber: string; status: string; totalAmount: number; currency: string };
  error?: string;
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [purchaseSuccess, setPurchaseSuccess] = useState("");

  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function validateCoupon(code: string): Promise<void> {
    if (!code) {
      setCouponError("");
      setCouponDiscount(0);
      return;
    }
    setCouponValidating(true);
    setCouponError("");
    setCouponDiscount(0);
    try {
      const res = await fetch(`/api/coupons?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.success && data.coupon) {
        setCouponDiscount(data.coupon.discountPercent);
      } else {
        setCouponError(data.error || "Invalid coupon");
        setCouponDiscount(0);
      }
    } catch {
      setCouponError("Failed to validate coupon");
      setCouponDiscount(0);
    } finally {
      setCouponValidating(false);
    }
  }

  async function purchase(product: Product): Promise<OrderResult> {
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          couponCode: couponCode || undefined,
        }),
      });
      const data = (await res.json()) as OrderResult;
      return data;
    } catch {
      return { success: false, error: "Network error" };
    }
  }

  async function handlePurchase(product: Product): Promise<void> {
    setPurchasing(true);
    setPurchaseError("");
    setPurchaseSuccess("");

    const result = await purchase(product);

    setPurchasing(false);
    if (result.success && result.order) {
      setPurchaseSuccess(`Order ${result.order.orderNumber} created for $${result.order.totalAmount} ${result.order.currency}`);
      setCouponCode("");
      setCouponDiscount(0);
    } else {
      setPurchaseError(result.error || "Purchase failed");
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <p className="text-gray-500">Loading products...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Funded Accounts</h1>
      <p className="text-gray-600 mb-8">
        Choose a challenge package that fits your goals.
      </p>

      {purchaseSuccess && (
        <div className="mb-6 rounded border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {purchaseSuccess}
        </div>
      )}
      {purchaseError && (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {purchaseError}
        </div>
      )}

      {couponDiscount > 0 && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Coupon applied: {couponDiscount}% discount
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {products.map((product) => (
          <div
            key={product.id}
            className="border rounded-lg p-6 bg-white shadow hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-bold mb-1">{product.name}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {product.description || "No description available"}
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Account Size:</span>
                <span className="font-medium">
                  {product.accountSize
                    ? `$${product.accountSize.toLocaleString()}`
                    : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Price:</span>
                <span className="font-medium">
                  {product.price
                    ? `$${product.price} ${product.currency}`
                    : "N/A"}
                </span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount:</span>
                  <span className="font-medium">{couponDiscount}% off</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Ruleset:</span>
                <span className="font-medium">
                  {product.ruleset?.name || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status:</span>
                <span
                  className={`font-medium ${product.isActive ? "text-green-600" : "text-red-600"}`}
                >
                  {product.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Price after coupon:</span>
                <span className="font-medium">
                  {product.price && couponDiscount > 0
                    ? `$${(product.price * (1 - couponDiscount / 100)).toFixed(2)} ${product.currency}`
                    : product.price
                      ? `$${product.price} ${product.currency}`
                      : "N/A"}
                </span>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  onBlur={() => validateCoupon(couponCode)}
                  disabled={!product.isActive || couponValidating}
                  className="flex-1 rounded border px-3 py-1.5 text-sm"
                />
              </div>
              {couponValidating && (
                <p className="text-xs text-gray-500">Validating coupon...</p>
              )}
              {couponError && (
                <p className="text-xs text-red-600">{couponError}</p>
              )}
              <button
                disabled={!product.isActive || purchasing}
                onClick={() => handlePurchase(product)}
                className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {purchasing ? "Processing..." : product.isActive ? "Purchase" : "Unavailable"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
