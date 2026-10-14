import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Challenge Catalog",
  description: "Explore active simulated challenge products, configured sizes, prices, and published rule values.",
  openGraph: { title: "Challenge Catalog | Funded Experts", description: "Explore active simulated challenge products, configured sizes, prices, and published rule values." },
};

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children;
}
