export default function WorkingPlanPreview() {
  return (
    <section
      id="plan-availability"
      aria-labelledby="plan-availability-title"
      className="mx-auto max-w-7xl px-5 py-5 sm:px-8 md:py-6"
    >
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5" role="status">
        <div className="flex min-w-0 items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="plan-availability-title" className="text-sm font-semibold tracking-tight text-foreground">
              Enrollment is not currently available
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Only approved offers and published terms appear below. Draft proposals are excluded.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border px-3 py-1.5 font-mono text-[0.65rem] font-medium tracking-wide text-muted-foreground">
          CATALOG · READ ONLY
        </span>
      </div>
    </section>
  );
}
