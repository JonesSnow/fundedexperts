import type { Metadata } from "next";
import PolicyStatusPage from "@/components/policy-status-page";

export const metadata: Metadata = { title: "Privacy Notice", description: "Publication status of the Funded Experts privacy notice." };

export default function PrivacyPage() {
  return <PolicyStatusPage currentPath="/privacy" eyebrow="Privacy" title="How personal information is handled." introduction="A customer privacy notice should identify the data collected, purposes, retention, processors, user choices, and contact route." status="Not published" statusDescription="A reviewed, customer-facing privacy notice and complete data-retention statement have not been published. This page does not replace that notice." nextLinks={[{ href: "/support", label: "View available self-service help" }]}><p>The application includes account and authentication features. Before registration or purchases are enabled broadly, the operator must publish an accurate notice covering actual data flows and the verified privacy contact.</p></PolicyStatusPage>;
}
