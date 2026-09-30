import { cn } from "@/lib/utils";

// 0..1 confidence bar with fixed marker notches at 0.40 (human review) and 0.80 (auto-apply).
// Color bands: <0.40 rose (dismissed zone), 0.40-0.79 amber (human zone), >=0.80 teal (auto zone).
export function ConfidenceBar({ value, testId }: { value: number; testId?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const band = value >= 0.8 ? "bg-teal-600" : value >= 0.4 ? "bg-amber-500" : "bg-rose-600";
  return (
    <div
      data-testid={testId ?? "confidence-bar-indicator"}
      className="relative h-2.5 w-full rounded-full bg-slate-100"
      aria-label={`Confidence ${value.toFixed(2)}`}
    >
      <div className={cn("h-full rounded-full transition-all duration-200", band)} style={{ width: `${pct}%` }} />
      <span
        className="absolute -top-0.5 h-3.5 w-px bg-slate-400"
        style={{ left: "40%" }}
        title="0.40 — human review threshold"
      />
      <span
        className="absolute -top-0.5 h-3.5 w-px bg-slate-600"
        style={{ left: "80%" }}
        title="0.80 — auto-apply threshold"
      />
    </div>
  );
}
