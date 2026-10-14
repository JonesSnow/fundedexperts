import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Search answers about simulated account paths, pricing, rules, orders, and platform status.",
  openGraph: { title: "FAQ | Funded Experts", description: "Search answers about simulated account paths, pricing, rules, orders, and platform status." },
};

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children;
}
