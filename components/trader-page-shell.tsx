import type { ReactNode } from "react";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import TraderWorkspaceNav from "@/components/trader-workspace-nav";
import { PageHeader } from "@/components/ui";

export default function TraderPageShell({
  currentPath,
  title,
  description,
  actions,
  children,
}: {
  currentPath: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPath={currentPath} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
        <TraderWorkspaceNav currentPath={currentPath} />
        <div className="mb-7 flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-5 shadow-sm sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <PageHeader title={title} description={description} />
          {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
        </div>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
