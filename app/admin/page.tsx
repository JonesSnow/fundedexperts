'use client';

import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"products" | "rulesets">("products");

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Admin Panel</h1>
      <p className="text-gray-600 mb-6">
        Manage products and rulesets.
      </p>

      <div className="flex gap-4 mb-6">
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
    </div>
  );
}
