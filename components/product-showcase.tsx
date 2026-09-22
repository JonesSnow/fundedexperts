"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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

export default function ProductShowcase() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || []);
      })
      .catch(() => {
        setProducts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="py-8 text-center text-gray-500">Loading products…</p>;
  }

  if (products.length === 0) {
    return <p className="py-8 text-center text-gray-500">No products available at this time.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <div
          key={product.id}
          className="rounded-lg border bg-white p-6 shadow-sm"
        >
          <h3 className="text-lg font-semibold">
            {product.name}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {product.description || "No description available"}
          </p>
          <div className="mt-4 space-y-1 text-sm">
            {product.accountSize && (
              <div className="flex justify-between">
                <span className="text-gray-500">Account Size</span>
                <span className="font-medium">
                  ${product.accountSize.toLocaleString()}
                </span>
              </div>
            )}
            {product.price && (
              <div className="flex justify-between">
                <span className="text-gray-500">Price</span>
                <span className="font-medium">
                  ${product.price.toLocaleString()} {product.currency}
                </span>
              </div>
            )}
            {product.ruleset && (
              <div className="flex justify-between">
                <span className="text-gray-500">Ruleset</span>
                <span className="font-medium">{product.ruleset.name}</span>
              </div>
            )}
          </div>
          <Link
            href="/catalog"
            className="mt-4 block rounded bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
          >
            {product.isActive ? "View Details" : "Unavailable"}
          </Link>
        </div>
      ))}
    </div>
  );
}
