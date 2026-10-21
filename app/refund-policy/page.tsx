import type { Metadata } from "next";
import PolicyStatusPage from "@/components/policy-status-page";

export const metadata: Metadata = { title: "Refund and Cancellation Policy", description: "Publication status of Funded Experts refund and cancellation terms." };

export default function RefundPolicyPage() {
  return <PolicyStatusPage currentPath="/refund-policy" eyebrow="Refunds and cancellations" title="Refund terms must be clear before a purchase." introduction="Any refund, cancellation, reset, or chargeback conditions need to be approved and displayed before sales begin." status="Not published" statusDescription="Refund and cancellation terms have not been approved for customer use. Purchases remain unavailable, and this page does not create or imply a refund entitlement." nextLinks={[{ href: "/terms", label: "Terms publication status" }, { href: "/policies", label: "All policy statuses" }]}><p>The applicable policy must identify eligible purchases, conditions, exceptions required by law, request steps, and how an order or evaluation is treated after a refund.</p></PolicyStatusPage>;
}
