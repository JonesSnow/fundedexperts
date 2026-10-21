import type { Metadata } from "next";
import PolicyStatusPage from "@/components/policy-status-page";

export const metadata: Metadata = { title: "Terms of Service", description: "Publication status of Funded Experts customer terms." };

export default function TermsPage() {
  return <PolicyStatusPage currentPath="/terms" eyebrow="Terms of service" title="Terms for participating in a program." introduction="Customer terms must describe the service, purchase, eligibility, evaluation, and account lifecycle accurately before participation is enabled." status="Not published" statusDescription="Approved Terms of Service and the verified legal entity details needed to issue them are not present in the application. This page is a publication-status notice, not a contract." nextLinks={[{ href: "/catalog", label: "Review configured programs" }, { href: "/risk-disclosure", label: "Read the simulation disclosure" }]}><p>Purchases are not available while the applicable customer terms remain unpublished. Do not treat general website descriptions as a substitute for program-specific terms.</p></PolicyStatusPage>;
}
