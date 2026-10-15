"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LayoutDashboard, ListOrdered, Settings2, ShieldCheck, Wallet } from "lucide-react";

const workspaceLinks = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/evaluations", label: "Evaluations", icon: ShieldCheck },
  { href: "/orders", label: "Orders", icon: ListOrdered },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Profile & settings", icon: Settings2 },
];

export default function TraderWorkspaceNav({ currentPath }: { currentPath: string }) {
  const pathname = usePathname() || currentPath;

  return (
    <nav
      aria-label="Trader workspace"
      className="-mx-4 mb-7 overflow-x-auto border-y border-border bg-card/50 px-4 sm:mx-0 sm:rounded-2xl sm:border"
    >
      <ul className="mx-auto flex min-w-max gap-1 py-2 sm:w-full sm:min-w-0 sm:justify-between lg:justify-start lg:gap-2">
        {workspaceLinks.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard"
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
