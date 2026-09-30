import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, FlaskConical, Gauge } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import type { EvalResponse, EvalReport, ScanRun, User } from "@/lib/types";
import { formatError } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TYPE_ORDER = ["contradiction", "duplicate", "stale", "unsupported", "injection", "held_out_injection"];
const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function EvaluationPage() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<User>("/auth/me"), retry: false });
  const role = me.data?.role ?? "viewer";
  const isReviewer = role === "admin" || role === "reviewer";
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const evalQ = useQuery({ queryKey: ["evaluation"], queryFn: () => apiGet<EvalResponse>("/evaluation"), retry: false });
  const runs = useQuery({ queryKey: ["scan", "runs"], queryFn: () => apiGet<ScanRun[]>("/scan/runs"), retry: false });

  const runEval = useMutation({
    mutationFn: () => apiPost<EvalReport>("/evaluation/run"),
    onSuccess: (r) => {
      toast.success("Evaluation complete");
      qc.invalidateQueries({ queryKey: ["evaluation"] });
      void r;
    },
    onError: (e) => toast.error(formatError(e)),
  });
  const runBench = useMutation({
    mutationFn: () => apiPost<EvalReport["benchmark"]>("/evaluation/benchmark"),
    onSuccess: (r) => {
      toast.success(`Benchmark: ${r?.docs} docs in ${r?.seconds}s`);
      qc.invalidateQueries({ queryKey: ["evaluation"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const report = evalQ.data?.report ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Evaluation</h1>
          <p className="text-sm text-slate-500">Precision / recall / F1 per fault type, with 95% bootstrap CIs.</p>
        </div>
        <div className="flex gap-2">
          {isReviewer && (
            <Button size="sm" data-testid="btn-run-evaluation" disabled={runEval.isPending} onClick={() => runEval.mutate()}>
              {runEval.isPending ? "Running…" : "Run evaluation"}
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" data-testid="btn-run-benchmark" disabled={runBench.isPending} onClick={() => runBench.mutate()}>
              {runBench.isPending ? "Benchmarking…" : "Run scale benchmark"}
            </Button>
          )}
        </div>
      </div>

      {/* disclaimer — always visible (spec 12) */}
      <div data-testid="eval-disclaimer" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        Note: {evalQ.data?.disclaimer ?? "synthetic-corpus benchmark metrics reflect offline test suites and not live production variance."}
      </div>

      {!report ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-slate-400">
            <Gauge className="h-6 w-6" />
            No evaluation report yet — load the demo corpus (Dashboard, admin) and run the evaluation.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-semibold text-slate-900" data-testid="eval-fpr">{fmtPct(report.false_positive_rate)}</div>
                <div className="text-xs uppercase tracking-[0.15em] font-semibold text-slate-500">False-positive rate (clean docs)</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-semibold text-slate-900" data-testid="eval-labels">{report.labels}</div>
                <div className="text-xs uppercase tracking-[0.15em] font-semibold text-slate-500">Labeled corpus items</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-semibold text-slate-900" data-testid="eval-benchmark-seconds">
                  {report.benchmark ? `${report.benchmark.seconds}s` : "—"}
                </div>
                <div className="text-xs uppercase tracking-[0.15em] font-semibold text-slate-500">
                  Scale benchmark {report.benchmark ? `(${report.benchmark.docs} docs)` : "(admin can run)"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-semibold text-slate-900" data-testid="eval-ran-at">{new Date(report.ran_at).toLocaleTimeString()}</div>
                <div className="text-xs uppercase tracking-[0.15em] font-semibold text-slate-500">Last run</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-fault metrics</CardTitle>
              <CardDescription>Precision / recall / F1 with 95% bootstrap confidence intervals.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table data-testid="eval-metrics-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fault type</TableHead>
                    <TableHead>Precision (95% CI)</TableHead>
                    <TableHead>Recall (95% CI)</TableHead>
                    <TableHead>F1 (95% CI)</TableHead>
                    <TableHead className="text-right">TP / FP / FN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TYPE_ORDER.filter((t) => report.per_type[t]).map((t) => {
                    const m = report.per_type[t];
                    return (
                      <TableRow key={t} data-testid={`eval-row-${t}`}>
                        <TableCell className="capitalize">{t.replace(/_/g, " ")}</TableCell>
                        <TableCell>{m.precision.toFixed(3)} [{m.ci.precision[0]}, {m.ci.precision[1]}]</TableCell>
                        <TableCell>{m.recall.toFixed(3)} [{m.ci.recall[0]}, {m.ci.recall[1]}]</TableCell>
                        <TableCell className="font-medium">{m.f1.toFixed(3)} [{m.ci.f1[0]}, {m.ci.f1[1]}]</TableCell>
                        <TableCell className="text-right font-mono text-xs">{m.tp} / {m.fp} / {m.fn}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* imported labeled dataset — per-split metrics (deterministic 60/20/20) */}
          {report.imported && (
            <Card data-testid="imported-dataset-card" className="border-indigo-200">
              <CardHeader>
                <CardTitle className="text-base">Your imported dataset</CardTitle>
                <CardDescription>
                  {report.imported.labels} labels from your own documents · {report.imported.note}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table data-testid="imported-metrics-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fault type</TableHead>
                      <TableHead>Precision</TableHead>
                      <TableHead>Recall</TableHead>
                      <TableHead>F1 (95% CI)</TableHead>
                      <TableHead className="text-right">TP / FP / FN</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(report.imported.per_type).map(([t, m]) => (
                      <TableRow key={t} data-testid={`imported-row-${t}`}>
                        <TableCell className="capitalize">{t.replace(/_/g, " ")}</TableCell>
                        <TableCell>{m.precision.toFixed(3)}</TableCell>
                        <TableCell>{m.recall.toFixed(3)}</TableCell>
                        <TableCell className="font-medium">{m.f1.toFixed(3)} [{m.ci.f1[0]}, {m.ci.f1[1]}]</TableCell>
                        <TableCell className="text-right font-mono text-xs">{m.tp} / {m.fp} / {m.fn}</TableCell>
                      </TableRow>
                    ))}
                    {Object.keys(report.imported.per_type).length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-sm text-slate-400">
                        No scored fault types yet — run a scan so findings exist, then re-run the evaluation.
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="imported-splits">
                  {(["tune", "validate", "test"] as const).map((split) => {
                    const s = report.imported?.per_split?.[split];
                    return (
                      <div
                        key={split}
                        data-testid={`split-card-${split}`}
                        className={`rounded-lg border p-3 ${split === "test" ? "border-teal-300 bg-teal-50/50" : "border-slate-200 bg-slate-50"}`}
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                          {split} split{split === "test" ? " · never tuned on" : ""}
                        </div>
                        <div className="mt-1 text-xl font-semibold text-slate-900">{s ? s.macro_f1.toFixed(3) : "—"}</div>
                        <div className="text-xs text-slate-500">
                          macro F1 · {s ? `${s.labels} labels · FPR ${(s.false_positive_rate * 100).toFixed(1)}%` : "no labels"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400">
                  Import more labeled documents from Admin → Labeled dataset import, then re-run the evaluation.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-4 w-4 text-indigo-600" /> Recent scan runs</CardTitle>
        </CardHeader>        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Claims</TableHead>
                <TableHead>Pairs</TableHead>
                <TableHead>Found</TableHead>
                <TableHead>Auto-fixed</TableHead>
                <TableHead>Awaiting</TableHead>
                <TableHead>Reindexed</TableHead>
                <TableHead className="text-right">Seconds</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runs.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.ts).toLocaleString()}</TableCell>
                  <TableCell>{r.actor}</TableCell>
                  <TableCell>{r.claims}</TableCell>
                  <TableCell>{r.pairs}</TableCell>
                  <TableCell>{r.found}</TableCell>
                  <TableCell>{r.auto_fixed}</TableCell>
                  <TableCell>{r.awaiting_human}</TableCell>
                  <TableCell>{r.reindexed_docs}</TableCell>
                  <TableCell className="text-right">{r.seconds}</TableCell>
                </TableRow>
              ))}
              {(runs.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-sm text-slate-400">No scans yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
