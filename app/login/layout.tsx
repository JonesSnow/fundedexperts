import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Funded Experts customer account.",
  robots: { index: false, follow: false },
  openGraph: { title: "Sign In | Funded Experts", description: "Sign in to your Funded Experts customer account." },
};

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children;
}
