import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Database, FlaskConical, Globe2 } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import type { CorpusLoadResult, CorpusState } from "@/lib/types";
import { formatError } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type Corpus = "real" | "demo";

const OPTIONS: { id: Corpus; title: string; icon: React.ReactNode; blurb: string }[] = [
  {
    id: "real",
    title: "Real-world corpus",
    icon: <Globe2 className="h-4 w-4" />,
    blurb:
      "30 excerpts of genuinely published documents (NIST, PCI DSS, GDPR + EDPB, WHO/CDC, RFCs, OWASP, ISO 27001, WCAG). Only a small slice has ground-truth labels — the rest is unlabeled real data.",
  },
  {
    id: "demo",
    title: "Demo corpus",
    icon: <FlaskConical className="h-4 w-4" />,
    blurb:
      "~73 synthetic documents with every fault type planted and fully labeled — best for seeing precision/recall across contradictions, duplicates, stale pairs, unsupported claims and injections.",
  },
];

export function CorpusCard({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: ["corpus"],
    queryFn: () => apiGet<CorpusState>("/admin/corpus"),
    retry: false,
  });
  const [choice, setChoice] = useState<Corpus>("real");
  const [replace, setReplace] = useState(true);

  const load = useMutation({
    mutationFn: () => apiPost<CorpusLoadResult>("/admin/corpus/load", { corpus: choice, replace }),
    onSuccess: (r) => {
      toast.success(`${r.label} loaded`, {
        description: `${r.ingested} documents ingested${r.replaced ? ` · ${r.cleared_documents} previous documents cleared` : " (merged into the existing knowledge base)"} · ${r.quarantined} quarantined · ${r.labels} labels. No findings yet — click Run scan.`,
      });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["corpus"] });
      qc.invalidateQueries({ queryKey: ["conflicts"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["ledger", "verify"] });
      qc.invalidateQueries({ queryKey: ["evaluation"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const active = state.data;

  return (
    <Card data-testid="corpus-card">
      <CardHeader>
        <CardTitle className="text-base">Knowledge base corpus</CardTitle>
        <CardDescription>
          Pick which data the platform audits. One corpus is active at a time — loading a corpus
          replaces the previous knowledge base and clears all findings, so nothing appears until you
          run a scan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
          data-testid="corpus-active-state"
        >
          <Database className="h-4 w-4 text-slate-400" />
          {active?.active ? (
            <>
              <span className="font-semibold text-slate-900">
                Active: {active.active === "real" ? "Real-world corpus" : "Demo corpus"}
              </span>
              <span className="text-slate-500">· {active.documents} documents</span>
              <span className={cn("text-xs font-medium", active.scanned ? "text-emerald-700" : "text-amber-700")}>
                {active.scanned ? "· scanned" : "· not scanned yet — click Run scan"}
              </span>
            </>
          ) : (
            <span className="text-slate-500">No corpus loaded yet — choose one below.</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              data-testid={`corpus-option-${o.id}`}
              aria-pressed={choice === o.id}
              onClick={() => setChoice(o.id)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors duration-150",
                choice === o.id
                  ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-200"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="text-indigo-600">{o.icon}</span>
                {o.title}
                {choice === o.id && <CheckCircle2 className="ml-auto h-4 w-4 text-indigo-600" />}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{o.blurb}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Checkbox
              checked={replace}
              onCheckedChange={(v: boolean) => setReplace(Boolean(v))}
              data-testid="corpus-replace-checkbox"
            />
            Replace the current knowledge base (uncheck to merge both corpora)
          </label>
          <Button
            size="sm"
            data-testid="corpus-load-button"
            disabled={!isAdmin || load.isPending}
            onClick={() => load.mutate()}
          >
            {load.isPending ? "Loading…" : `Load ${choice === "real" ? "real-world" : "demo"} corpus`}
          </Button>
          {!isAdmin && <span className="text-xs text-slate-400">Admins only</span>}
        </div>
      </CardContent>
    </Card>
  );
}
