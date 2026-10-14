import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Password Recovery",
  description: "Request account password recovery.",
  robots: { index: false, follow: false },
  openGraph: { title: "Password Recovery | Funded Experts", description: "Request account password recovery." },
};

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children;
}
