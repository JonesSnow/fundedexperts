import type { Metadata } from "next";
import PolicyStatusPage from "@/components/policy-status-page";

export const metadata: Metadata = { title: "Cookie and Storage Notice", description: "Publication status of the Funded Experts cookie and browser-storage notice." };

export default function CookiesPage() {
  return <PolicyStatusPage currentPath="/cookies" eyebrow="Cookies and browser storage" title="Know what your browser stores." introduction="A complete notice should list actual cookie and storage categories, purposes, retention, providers, and available controls." status="Not published" statusDescription="A reviewed inventory of cookies, browser storage, analytics, and any consent controls has not been published. We do not claim that the site uses no tracking." nextLinks={[{ href: "/privacy", label: "Privacy notice status" }]}><p>Before launch, this notice must be checked against the deployed application and its actual third-party services. The information must be updated whenever that setup changes.</p></PolicyStatusPage>;
}
