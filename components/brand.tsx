import Link from "next/link";

export default function Brand({ compact = false, surface = "light" }: { compact?: boolean; surface?: "light" | "dark" }) {
  const dark = surface === "dark";
  return (
    <Link
      href="/"
      aria-label="Funded Experts home"
      className="inline-flex w-fit items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-xs font-bold tracking-tight shadow-sm ${dark ? "border-teal-400/35 bg-white/5 text-teal-400" : "border-primary/30 bg-primary-light text-primary"}`}>
        FE
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className={`text-sm font-semibold tracking-[0.12em] ${dark ? "text-paper-50" : "text-foreground"}`}>
            FUNDED
          </span>
          <span className={`mt-1 text-[0.62rem] font-medium tracking-[0.24em] ${dark ? "text-paper-50/60" : "text-muted-foreground"}`}>
            EXPERTS
          </span>
        </span>
      )}
    </Link>
  );
}
