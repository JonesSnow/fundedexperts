import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Trading Rules",
  description: "Review active published trading-rule values and product-specific policy details.",
  openGraph: { title: "Trading Rules | Funded Experts", description: "Review active published trading-rule values and product-specific policy details." },
};

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children;
}
