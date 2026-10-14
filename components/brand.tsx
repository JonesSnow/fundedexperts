import Link from "next/link";

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Funded Experts home"
      className="inline-flex w-fit items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/40 bg-card text-xs font-bold tracking-tight text-primary shadow-sm">
        FE
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-[0.12em] text-foreground">
            FUNDED
          </span>
          <span className="mt-1 text-[0.62rem] font-medium tracking-[0.24em] text-muted-foreground">
            EXPERTS
          </span>
        </span>
      )}
    </Link>
  );
}
