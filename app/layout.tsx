import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Funded Experts | Simulated Trading Evaluations", template: "%s | Funded Experts" },
  description: "Compare configured simulated trading challenges, review published rules, and track your evaluation status.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
