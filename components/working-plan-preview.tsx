import { Badge } from "@/components/ui/badge";

export default function WorkingPlanPreview() {
  return (
    <section
      id="plan-availability"
      aria-labelledby="plan-availability-title"
      className="mx-auto max-w-7xl px-5 py-8 sm:px-8 md:py-10"
    >
      <div className="rounded-2xl border border-warning/30 bg-card p-5 sm:p-7" role="status">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">Published offers only</Badge>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Catalog publication standard
          </p>
        </div>
        <h2 id="plan-availability-title" className="mt-3 text-2xl font-semibold tracking-tight">
          Product terms come from approved catalog data
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
          The catalog displays account sizes, prices, stages, and rules only when the product API
          returns an approved active offer. Historical proposals remain unpublished. If live offer
          data cannot be verified, the catalog shows a retryable error instead of substituting draft
          values.
        </p>
      </div>
    </section>
  );
}
