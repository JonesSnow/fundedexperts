import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a Funded Experts customer account.",
  robots: { index: false, follow: false },
  openGraph: { title: "Create Account | Funded Experts", description: "Create a Funded Experts customer account." },
};

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children;
}
