import { ShieldCheck } from "lucide-react";

const specifications = [
  ["Evaluation stages", "Defined by published offer"],
  ["Risk parameters", "Listed for each stage"],
  ["Rule version", "Shown with the program"],
] as const;

export default function PrecisionInstrumentVisual() {
  return (
    <figure className="framework-scene relative mx-auto w-full max-w-[34rem] py-2 sm:py-5" aria-labelledby="program-framework-caption">
      <div className="framework-layer absolute inset-2 rounded-2xl border border-teal-400/20 bg-ink-800/80 shadow-2xl" aria-hidden="true" />
      <div className="absolute -inset-5 rounded-[2rem] bg-teal-500/10 blur-3xl" aria-hidden="true" />
      <div className="framework-card relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900/90 p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-7">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/75 to-transparent" aria-hidden="true" />
        <div className="framework-chip flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="font-mono text-[0.65rem] font-semibold tracking-[0.18em] text-teal-400">PROGRAM FRAMEWORK</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-paper-50 sm:text-2xl">A clear specification.</h2>
            <p className="mt-1 text-sm text-paper-50/60">Know what governs an evaluation.</p>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-teal-400/25 bg-teal-500/10 text-teal-400">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>

        <dl className="divide-y divide-white/10">
          {specifications.map(([label, value], index) => (
            <div key={label} className="grid grid-cols-[2.25rem_1fr] gap-3 py-4 sm:grid-cols-[2.75rem_1fr_auto] sm:items-center">
              <span className="font-mono text-xs text-paper-50/35">0{index + 1}</span>
              <div>
                <dt className="text-sm font-medium text-paper-50">{label}</dt>
                <dd className="mt-1 text-xs leading-5 text-paper-50/55 sm:hidden">{value}</dd>
              </div>
              <dd className="hidden items-center gap-2 text-right text-xs text-paper-50/60 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" aria-hidden="true" />{value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-paper-50">Simulated evaluation</p>
            <p className="mt-1 text-[0.7rem] text-paper-50/55">No live capital or performance data</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 font-mono text-[0.6rem] tracking-wide text-paper-50/55">READ ONLY</span>
        </div>
      </div>
      <figcaption id="program-framework-caption" className="mt-3 text-center text-xs text-paper-50/55">
        Illustrative framework only. No prices, account values, or results are represented.
      </figcaption>
    </figure>
  );
}
