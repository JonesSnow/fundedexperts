"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, ButtonLink } from "@/components/ui";
import Brand from "@/components/brand";

interface Trader {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
}

interface HeaderProps {
  currentPath?: string;
}

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const first = firstName?.[0]?.toUpperCase() || "";
  const last = lastName?.[0]?.toUpperCase() || "";
  return first + last || "?";
}

export default function Header({ currentPath }: HeaderProps) {
  const router = useRouter();
  const [trader, setTrader] = useState<Trader | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/auth/session", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session unavailable");
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setTrader(data.authenticated ? data.trader : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTrader(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!userMenuOpen && !mobileOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
        setMobileOpen(false);
        if (mobileOpen) mobileMenuButtonRef.current?.focus();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen, userMenuOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const frame = window.requestAnimationFrame(() => {
      mobileNavRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobileOpen]);

  async function handleLogout() {
    setLogoutPending(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout could not be confirmed");
      setTrader(null);
      setUserMenuOpen(false);
      setMobileOpen(false);
      router.push("/");
      router.refresh();
    } catch {
      setLogoutError("We could not confirm sign out. Please try again.");
    } finally {
      setLogoutPending(false);
    }
  }

  const displayName = trader
    ? [trader.firstName ?? "", trader.lastName ?? ""].filter(Boolean).join(" ") || trader.email
    : "";

  return (
    <header className="sticky top-0 z-50 border-b border-border/20 bg-ink-950/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
        <Brand surface="dark" />

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
          <NavLink href="/catalog" currentPath={currentPath} tone="dark">Programs</NavLink>
          <NavLink href="/rules" currentPath={currentPath} tone="dark">Rules</NavLink>
          <NavLink href="/how-it-works" currentPath={currentPath} tone="dark">How it works</NavLink>
          <NavLink href="/platforms" currentPath={currentPath} tone="dark">Platforms</NavLink>
          <NavLink href="/faq" currentPath={currentPath} tone="dark">FAQ</NavLink>
          {trader && <NavLink href="/dashboard" currentPath={currentPath} tone="dark">Dashboard</NavLink>}
          {trader?.role === "ADMIN" && <NavLink href="/admin" currentPath={currentPath} tone="dark">Admin</NavLink>}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ButtonLink href="/catalog#configured-products" size="sm">Explore programs</ButtonLink>
          {loading ? (
            <span className="h-9 w-36 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
          ) : trader ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((open) => !open)}
                className="inline-flex max-w-56 items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={userMenuOpen ? "Close account menu" : "Open account menu"}
                aria-expanded={userMenuOpen}
                aria-controls="account-navigation"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {getInitials(trader.firstName, trader.lastName)}
                </span>
                <span className="max-w-36 truncate pr-2">{displayName}</span>
              </button>

              {userMenuOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default border-0 bg-transparent p-0"
                    onClick={() => setUserMenuOpen(false)}
                    aria-label="Close account menu"
                  />
                  <div
                    id="account-navigation"
                    className="absolute right-0 z-50 mt-3 w-64 rounded-2xl border border-border bg-card p-2 shadow-xl"
                  >
                    <div className="border-b border-border px-3 pb-3 pt-2">
                      <p className="truncate text-sm font-semibold text-card-foreground">{displayName}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{trader.email}</p>
                      <Badge variant="outline" className="mt-2">{trader.role}</Badge>
                    </div>
                    <Link
                      href="/dashboard"
                      className="mt-2 block rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      Trader dashboard
                    </Link>
                    {trader.role === "TRADER" && (
                      <>
                        <Link href="/accounts" aria-current={currentPath?.startsWith("/accounts") ? "page" : undefined} className="block rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setUserMenuOpen(false)}>My accounts</Link>
                        <Link href="/evaluations" aria-current={currentPath?.startsWith("/evaluations") ? "page" : undefined} className="block rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setUserMenuOpen(false)}>Evaluations</Link>
                        <Link href="/orders" aria-current={currentPath?.startsWith("/orders") ? "page" : undefined} className="block rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setUserMenuOpen(false)}>Orders</Link>
                        <Link href="/payouts" aria-current={currentPath === "/payouts" ? "page" : undefined} className="block rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setUserMenuOpen(false)}>Payout status</Link>
                        <Link href="/notifications" aria-current={currentPath === "/notifications" ? "page" : undefined} className="block rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setUserMenuOpen(false)}>Notifications</Link>
                        <Link href="/settings" aria-current={currentPath === "/settings" ? "page" : undefined} className="block rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setUserMenuOpen(false)}>Profile and settings</Link>
                      </>
                    )}
                    {trader.role === "ADMIN" && (
                      <Link
                        href="/admin"
                        className="block rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Admin workspace
                      </Link>
                    )}
                    {logoutError && <p className="px-3 py-2 text-xs text-danger" role="alert">{logoutError}</p>}
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={logoutPending}
                      className="mt-1 w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      {logoutPending ? "Signing out…" : "Sign out"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <ButtonLink href="/login" variant="outline" size="sm" className="border-white/25 text-paper-50 hover:bg-white/10">Sign in</ButtonLink>
          )}
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-full border border-border text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
          ref={mobileMenuButtonRef}
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            {mobileOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 6l12 12M18 6L6 18" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div id="mobile-navigation" ref={mobileNavRef} className="border-t border-border bg-background px-5 pb-6 pt-4 sm:px-8 lg:hidden">
          <nav aria-label="Mobile navigation" className="mx-auto flex max-w-7xl flex-col gap-1">
            <NavLink href="/" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Home</NavLink>
            <NavLink href="/catalog" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Programs</NavLink>
            <NavLink href="/rules" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Trading rules</NavLink>
            <NavLink href="/how-it-works" currentPath={currentPath} onClick={() => setMobileOpen(false)}>How it works</NavLink>
            <NavLink href="/platforms" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Platforms</NavLink>
            <NavLink href="/faq" currentPath={currentPath} onClick={() => setMobileOpen(false)}>FAQ</NavLink>
            {trader && <NavLink href="/dashboard" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Dashboard</NavLink>}
            {trader?.role === "TRADER" && (
              <>
                <NavLink href="/accounts" currentPath={currentPath} onClick={() => setMobileOpen(false)}>My accounts</NavLink>
                <NavLink href="/evaluations" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Evaluations</NavLink>
                <NavLink href="/orders" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Orders</NavLink>
                <NavLink href="/payouts" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Payout status</NavLink>
                <NavLink href="/notifications" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Notifications</NavLink>
                <NavLink href="/settings" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Profile and settings</NavLink>
              </>
            )}
            {trader?.role === "ADMIN" && <NavLink href="/admin" currentPath={currentPath} onClick={() => setMobileOpen(false)}>Admin</NavLink>}
          </nav>
          <div className="mx-auto mt-4 max-w-7xl border-t border-border pt-4">
            {logoutError && <p className="mb-3 text-sm text-danger" role="alert">{logoutError}</p>}
            <ButtonLink href="/catalog#configured-products" fullWidth onClick={() => setMobileOpen(false)}>Compare programs</ButtonLink>
            {loading ? (
              <span className="block h-10 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />
            ) : trader ? (
              <button
                type="button"
                onClick={handleLogout}
                disabled={logoutPending}
                className="w-full rounded-xl border border-border px-4 py-3 text-left text-sm font-medium text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {logoutPending ? "Signing out…" : "Sign out"}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <ButtonLink href="/login" variant="outline" fullWidth className="mt-3" onClick={() => setMobileOpen(false)}>Login</ButtonLink>
                <ButtonLink href="/register" variant="outline" fullWidth className="mt-3" onClick={() => setMobileOpen(false)}>Create account</ButtonLink>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function NavLink({
  href,
  children,
  currentPath,
  onClick,
          tone,
}: {
  href: string;
  children: React.ReactNode;
  currentPath?: string;
  onClick?: () => void;
  tone?: "light" | "dark";
}) {
  const isActive = currentPath === href || (href !== "/" && currentPath?.startsWith(href));

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={
        "rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
        (tone === "dark"
          ? isActive
            ? "bg-white/10 text-paper-50"
            : "text-paper-50/65 hover:bg-white/5 hover:text-paper-50"
          : isActive
            ? "bg-primary-light text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground")
      }
    >
      {children}
    </Link>
  );
}
