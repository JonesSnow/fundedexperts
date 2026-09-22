"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

export default function Header({ currentPath }: HeaderProps) {
  const router = useRouter();
  const [trader, setTrader] = useState<Trader | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        setTrader(data.authenticated ? data.trader : null);
      })
      .catch(() => setTrader(null))
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    fetch("/api/auth/logout", { method: "POST" }).finally(() => {
      setTrader(null);
      router.push("/");
      router.refresh();
    });
  }

  const displayName = trader
    ? `${trader.firstName ?? ""} ${trader.lastName ?? ""}`.trim() || trader.email
    : "";

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Funded Experts
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink href="/" currentPath={currentPath}>
            Home
          </NavLink>
          <NavLink href="/catalog" currentPath={currentPath}>
            Catalog
          </NavLink>
          {trader && (
            <NavLink href="/dashboard" currentPath={currentPath}>
              Dashboard
            </NavLink>
          )}
          {trader?.role === "ADMIN" && (
            <NavLink href="/admin" currentPath={currentPath}>
              Admin
            </NavLink>
          )}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {loading ? (
            <span className="text-sm text-gray-500">Loading…</span>
          ) : trader ? (
            <>
              <span className="text-sm text-gray-600">
                {displayName}{" "}
                <span className="text-xs text-gray-400">({trader.role})</span>
              </span>
              <button
                onClick={handleLogout}
                className="rounded px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Register
              </Link>
            </>
          )}
        </div>

        <button
          className="rounded p-2 md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            <NavLink href="/" currentPath={currentPath}>
              Home
            </NavLink>
            <NavLink href="/catalog" currentPath={currentPath}>
              Catalog
            </NavLink>
            {trader && (
              <NavLink href="/dashboard" currentPath={currentPath}>
                Dashboard
              </NavLink>
            )}
            {trader?.role === "ADMIN" && (
              <NavLink href="/admin" currentPath={currentPath}>
                Admin
              </NavLink>
            )}
            <hr className="my-1" />
            {trader ? (
              <button
                onClick={handleLogout}
                className="rounded px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Logout
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Register
                </Link>
              </>
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
}: {
  href: string;
  children: React.ReactNode;
  currentPath?: string;
}) {
  const isActive = currentPath === href || (href !== "/" && currentPath?.startsWith(href));
  return (
    <Link
      href={href}
      className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "bg-blue-50 text-blue-700"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </Link>
  );
}
