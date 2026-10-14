import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Email Verification Pending",
  description: "View next steps for email verification.",
  robots: { index: false, follow: false },
  openGraph: { title: "Email Verification Pending | Funded Experts", description: "View next steps for email verification." },
};

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children;
}
