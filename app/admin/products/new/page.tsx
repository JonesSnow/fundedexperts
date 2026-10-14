'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminProductsNewPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [evaluationStructure, setEvaluationStructure] = useState("");
  const [accountSize, setAccountSize] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [denominationCurrency, setDenominationCurrency] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: code || undefined,
          description: description || null,
          category: category || undefined,
          evaluationStructure: evaluationStructure || undefined,
          accountSize: accountSize || null,
          price: price || null,
          currency: currency || undefined,
          denominationCurrency: denominationCurrency || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        setError(data.error || data.errors?.name || "Failed to create product");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Add Product Draft</h1>
      {error && (
        <div className="mb-4 p-3 text-sm text-danger bg-danger-light rounded">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="product-name" className="block text-sm font-medium mb-1">Product Name</label>
          <input
            id="product-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="product-code" className="block text-sm font-medium mb-1">Stable Product Code</label>
          <input id="product-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="pro-25k-v1" className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <p className="mt-1 text-xs text-muted-foreground">Use a new code for a new offer revision.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="product-category" className="block text-sm font-medium mb-1">Category</label>
            <select id="product-category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Unresolved</option><option value="BEGINNER">Beginner</option><option value="PRO">Pro</option><option value="EXPERT">Expert</option><option value="DIRECT_FUNDED">Direct Funded</option>
            </select>
          </div>
          <div>
            <label htmlFor="evaluation-structure" className="block text-sm font-medium mb-1">Evaluation Structure</label>
            <select id="evaluation-structure" value={evaluationStructure} onChange={(e) => setEvaluationStructure(e.target.value)} className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Unresolved</option><option value="THREE_STEP">Three step</option><option value="FOUR_STEP">Four step</option><option value="TWO_STEP">Two step</option><option value="ONE_STEP">One step</option><option value="DIRECT_FUNDED">Direct funded · no evaluation</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="product-description" className="block text-sm font-medium mb-1">Description</label>
          <textarea
            id="product-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={3}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="account-size" className="block text-sm font-medium mb-1">Account Size</label>
            <input id="account-size"
            type="number"
            step="0.01"
            min="0.01"
            value={accountSize}
            onChange={(e) => setAccountSize(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          </div>
          <div>
            <label htmlFor="denomination-currency" className="block text-sm font-medium mb-1">Account Denomination Currency</label>
            <input id="denomination-currency" value={denominationCurrency} onChange={(e) => setDenominationCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div>
            <label htmlFor="product-price" className="block text-sm font-medium mb-1">Price</label>
            <input id="product-price"
            type="number"
            step="0.01"
            min="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          </div>
          <div>
            <label htmlFor="price-currency" className="block text-sm font-medium mb-1">Price Currency</label>
            <input id="price-currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" className="w-full px-3 py-2 border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">New products always remain drafts. Stage rules and product publication must be completed and validated through the admin APIs.</p>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-primary text-primary-foreground rounded hover:bg-primary disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Draft"}
        </button>
      </form>
    </div>
  );
}
