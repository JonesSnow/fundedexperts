import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Customer Dashboard",
  description: "Review recorded order, account, and evaluation statuses.",
  robots: { index: false, follow: false },
  openGraph: { title: "Customer Dashboard | Funded Experts", description: "Review recorded order, account, and evaluation statuses." },
};

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children;
}
