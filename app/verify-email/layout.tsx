import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Verify Email",
  description: "Verify the email address associated with your Funded Experts account.",
  robots: { index: false, follow: false },
  openGraph: { title: "Verify Email | Funded Experts", description: "Verify the email address associated with your Funded Experts account." },
};

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children;
}
