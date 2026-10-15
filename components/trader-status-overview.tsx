import { StatusBadge } from "@/components/ui";

export default function TraderStatusOverview({
  title,
  total,
  statuses,
  loading = false,
  unavailable = false,
}: {
  title: string;
  total: number;
  statuses: Array<{ status: string; count: number }>;
  loading?: boolean;
  unavailable?: boolean;
}) {
  return (
    <section
      aria-label={`${title} status overview`}
      className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">Counts reflect records in the current feed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <span className="rounded-lg bg-muted px-3 py-1.5 text-sm font-semibold text-foreground">
            {loading ? "Loading…" : unavailable ? "Unavailable" : `${total} ${total === 1 ? "record" : "records"}`}
          </span>
          {!loading && !unavailable && statuses.map(({ status, count }) => (
            <span key={status} className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
              <StatusBadge status={status} size="sm" />
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
