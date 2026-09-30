import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TYPE_STYLES: Record<string, string> = {
  contradiction: "bg-rose-100 text-rose-800 border-rose-200",
  duplicate: "bg-indigo-100 text-indigo-800 border-indigo-200",
  stale: "bg-amber-100 text-amber-800 border-amber-200",
  unsupported: "bg-sky-100 text-sky-800 border-sky-200",
};

const ROUTE_STYLES: Record<string, string> = {
  auto: "bg-teal-100 text-teal-800 border-teal-200",
  human: "bg-amber-100 text-amber-900 border-amber-300",
  dismissed: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-white text-slate-700 border-slate-300",
  hold: "bg-amber-50 text-amber-800 border-amber-200",
  auto_applied: "bg-teal-600 text-white border-teal-600",
  accepted: "bg-emerald-600 text-white border-emerald-600",
  synthesized: "bg-indigo-600 text-white border-indigo-600",
  kept_both: "bg-sky-600 text-white border-sky-600",
  rejected: "bg-slate-600 text-white border-slate-600",
  rolled_back: "bg-rose-600 text-white border-rose-600",
  dismissed: "bg-slate-100 text-slate-500 border-slate-200",
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" data-testid={`badge-type-${type}`} className={cn("capitalize", TYPE_STYLES[type])}>
      {type}
    </Badge>
  );
}

export function RouteBadge({ route, tie }: { route: string; tie?: boolean }) {
  return (
    <Badge variant="outline" data-testid={`badge-route-${route}`} className={cn("capitalize", ROUTE_STYLES[route])}>
      {tie ? "tie → human" : route === "auto" ? "auto-apply" : route === "human" ? "human review" : route}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" data-testid={`badge-status-${status}`} className={cn("capitalize", STATUS_STYLES[status])}>
      {status.replace("_", " ")}
    </Badge>
  );
}

export function SourceBadge({ sourceType, trust, date }: { sourceType: string; trust: number; date: string }) {
  return (
    <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-normal">
      {sourceType} · trust {trust.toFixed(2)} · {date}
    </Badge>
  );
}
