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

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Funded Accounts</h1>
      <p className="text-gray-600 mb-8">
        Choose a challenge package that fits your goals.
      </p>

      {loading && <p>Loading products...</p>}

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
            </div>
            <button
              disabled={!product.isActive}
              className="mt-4 w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {product.isActive ? "Get Started" : "Unavailable"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
