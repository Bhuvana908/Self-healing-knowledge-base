import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/lib/recharts";
import { Database, FileWarning, Gavel, History, UserCheck } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import type { Stats, User } from "@/lib/types";
import { formatError, RunScanButton } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FINDING_TYPES = ["contradiction", "duplicate", "stale", "unsupported"] as const;

function KpiCard({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: number; testId: string }) {
  return (
    <Card data-testid={testId} className="hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">{icon}</span>
        <div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">{value.toLocaleString()}</div>
          <div className="text-xs uppercase tracking-[0.15em] font-semibold text-slate-500">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const PIPELINE_STEPS: { key: keyof Stats["pipeline"]; label: string }[] = [
  { key: "ingested", label: "Ingested" },
  { key: "quarantined", label: "Quarantined" },
  { key: "claims_indexed", label: "Claims indexed" },
  { key: "candidate_pairs", label: "Candidate pairs" },
  { key: "auto_fixed", label: "Auto-fixed" },
  { key: "awaiting_human", label: "Awaiting human" },
];

export default function Dashboard() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<User>("/auth/me"), retry: false });
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => apiGet<Stats>("/stats"), retry: false });
  const role = me.data?.role ?? "viewer";
  const isAdmin = role === "admin";

  const demo = useMutation({
    mutationFn: () => apiPost<{ ingested: number; quarantined: number; labels: number }>("/admin/demo/load"),
    onSuccess: (r) => {
      toast.success(`Demo corpus loaded — ${r.ingested} docs ingested, ${r.quarantined} quarantined, ${r.labels} labels`);
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["ledger", "verify"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const s = stats.data;
  const chartData = FINDING_TYPES.map((t) => ({ type: t, count: s?.findings_by_type?.[t] ?? 0 }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Continuous audit for stale, duplicated, contradictory and unsupported knowledge.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              data-testid="btn-load-demo-corpus"
              disabled={demo.isPending}
              onClick={() => demo.mutate()}
            >
              Load demo corpus
            </Button>
          )}
          {role !== "viewer" && <RunScanButton disabled={false} />}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={<Database className="h-4 w-4" />} label="Documents" value={s?.documents ?? 0} testId="kpi-documents" />
        <KpiCard icon={<FileWarning className="h-4 w-4" />} label="Quarantined" value={s?.quarantined ?? 0} testId="kpi-quarantined" />
        <KpiCard icon={<Gavel className="h-4 w-4" />} label="Awaiting human" value={s?.awaiting_human ?? 0} testId="kpi-awaiting-human" />
        <KpiCard icon={<UserCheck className="h-4 w-4" />} label="Auto-resolved" value={s?.auto_resolved ?? 0} testId="kpi-auto-resolved" />
        <KpiCard icon={<History className="h-4 w-4" />} label="Ledger versions" value={s?.ledger_versions ?? 0} testId="kpi-ledger-versions" />
      </div>

      {/* pipeline strip */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div data-testid="pipeline-diagnostic-strip" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {PIPELINE_STEPS.map(({ key, label }, i) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                  {i + 1}. {label}
                </div>
                <div className="mt-1 text-xl font-semibold text-slate-900" data-testid={`pipeline-${key}`}>
                  {(s?.pipeline?.[key] ?? 0).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* findings-by-type chart */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Findings by type</CardTitle>
            <CardDescription>All recorded findings, including resolved ones.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="type" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* recent activity */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Hash-chained audit trail (latest first).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2" data-testid="recent-activity-list">
            {(s?.recent_activity ?? []).map((a) => (
              <div key={a.seq} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-800">
                    <span className="font-medium">{a.actor}</span> · {a.action} · {a.target.slice(0, 14)}
                  </div>
                  <div className="text-xs text-slate-400">{new Date(a.ts).toLocaleString()}</div>
                </div>
                <span className="font-mono text-[11px] text-slate-400">#{a.seq}</span>
              </div>
            ))}
            {(s?.recent_activity ?? []).length === 0 && (
              <p className="text-sm text-slate-400">No activity yet — ingest documents or load the demo corpus.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* empty-state CTA */}
      {s && s.documents === 0 && (
        <Card className="border-indigo-200 bg-indigo-50">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-indigo-900">
              The knowledge base is empty. {isAdmin ? "Load the demo corpus to explore all fault types, or ingest documents via the API." : "Ask an admin to load the demo corpus."}
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-slate-400">
        Offline mode: detection runs on rules + TF-IDF (no LLM key configured).{" "}
        <Link to="/eval" className="text-indigo-600 hover:underline">Run the evaluation</Link> to validate the engine.
      </p>
    </div>
  );
}
