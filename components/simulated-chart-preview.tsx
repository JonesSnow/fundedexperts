import { Activity, ShieldCheck } from "lucide-react";

export default function SimulatedChartPreview() {
  return (
    <figure className="site-terminal-scene relative mx-auto w-full max-w-xl" aria-labelledby="demo-chart-caption">
      <div className="site-hero-panel site-terminal-device relative p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden="true">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(59,10,107,.46),transparent_70%)]" />
        </div>
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Illustrative workspace</p>
              <p className="mt-1 text-lg font-semibold tracking-tight">Evaluation overview</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-light px-2.5 py-1 text-[0.65rem] font-bold tracking-wide text-primary">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" /> DEMO VIEW
            </span>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-background/80 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">Illustrative price movement</span>
              <span className="font-mono text-[0.65rem] text-muted-foreground">NO LIVE DATA</span>
            </div>
            <svg viewBox="0 0 520 190" className="h-auto w-full" role="img" aria-label="Decorative example chart with no live account or trading data">
              <defs>
                <linearGradient id="demo-chart-line" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="var(--amethyst)" />
                  <stop offset="100%" stopColor="var(--primary)" />
                </linearGradient>
                <linearGradient id="demo-chart-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity=".13" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[32, 72, 112, 152].map((y) => <line key={y} x1="8" x2="512" y1={y} y2={y} stroke="rgba(255,255,255,.07)" strokeWidth="1" />)}
              {[72, 168, 264, 360, 456].map((x) => <line key={x} x1={x} x2={x} y1="12" y2="172" stroke="rgba(255,255,255,.045)" strokeWidth="1" />)}
              <path d="M8 146 C42 142 49 113 82 120 S126 133 152 105 S195 90 218 100 S266 77 290 86 S328 110 350 74 S395 62 416 78 S465 44 512 35 L512 172 L8 172 Z" fill="url(#demo-chart-fill)" />
              <path d="M8 146 C42 142 49 113 82 120 S126 133 152 105 S195 90 218 100 S266 77 290 86 S328 110 350 74 S395 62 416 78 S465 44 512 35" fill="none" stroke="url(#demo-chart-line)" strokeLinecap="round" strokeWidth="3" />
              <circle cx="512" cy="35" r="4.5" fill="var(--primary)" />
            </svg>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-background/65 p-3">
              <p className="text-xs text-muted-foreground">Account status</p>
              <p className="mt-1 text-sm font-semibold">Shown when recorded</p>
            </div>
            <div className="rounded-lg border border-border bg-background/65 p-3">
              <p className="text-xs text-muted-foreground">Rule progress</p>
              <p className="mt-1 text-sm font-semibold">Depends on plan data</p>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            This is a design illustration only. It does not show a real balance, evaluation, trade, or performance result.
          </p>
        </div>
      </div>
      <figcaption id="demo-chart-caption" className="sr-only">Illustrative trading workspace panel; no live or customer data is shown.</figcaption>
    </figure>
  );
}
