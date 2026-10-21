import type { Metadata } from "next";
import PolicyStatusPage from "@/components/policy-status-page";

export const metadata: Metadata = { title: "Risk and Simulation Disclosure", description: "Read the current draft disclosure about simulated trading and evaluation outcomes." };

export default function RiskDisclosurePage() {
  return <PolicyStatusPage currentPath="/risk-disclosure" eyebrow="Risk and simulation" title="Understand what simulated trading means." introduction="The platform describes its evaluation activity as simulated and using virtual funds. This draft disclosure is shown for clarity while the complete customer-facing risk terms receive review." status="Draft disclosure · legal review pending" statusDescription="This text is informational and has not been approved as a complete legal disclosure. It does not establish reward eligibility or replace the terms for a specific program." nextLinks={[{ href: "/rules", label: "Review the rules center" }, { href: "/catalog", label: "View configured plans" }]}><p>Trading activity described by Funded Experts is simulated and uses virtual funds. Simulated results are not the same as executing trades with real capital and do not guarantee or predict results in live markets. Program progression and any reward eligibility depend on applicable published terms and review. Fees, time, and participation conditions may still involve risk.</p></PolicyStatusPage>;
}
