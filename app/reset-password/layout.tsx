import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your Funded Experts account.",
  robots: { index: false, follow: false },
  openGraph: { title: "Reset Password | Funded Experts", description: "Set a new password for your Funded Experts account." },
};

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children;
}
