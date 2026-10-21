import type { Metadata } from "next";
import PolicyStatusPage from "@/components/policy-status-page";

export const metadata: Metadata = { title: "Accessibility Statement", description: "Funded Experts' accessibility goals and current review status." };

export default function AccessibilityPage() {
  return <PolicyStatusPage currentPath="/accessibility" eyebrow="Accessibility" title="Access is part of a usable product." introduction="We aim to make Funded Experts work with different assistive technologies, input methods, and display settings." status="Accessibility review not complete" statusDescription="The application has not completed a documented accessibility audit. This statement describes an aim, not a claim of WCAG conformance." nextLinks={[{ href: "/support", label: "Available self-service help" }]}><p>If you encounter a barrier, note the page and task where it occurred. A verified contact channel for reporting accessibility issues has not yet been published.</p></PolicyStatusPage>;
}
