import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiGet, apiPost } from "@/lib/api";
import type { Conflict, User, VersionEntry } from "@/lib/types";
import { formatError } from "@/components/AppShell";
import { ConfidenceBar } from "@/components/ConfidenceBar";
import { RouteBadge, SourceBadge, StatusBadge, TypeBadge } from "@/components/badges";
import { WordDiff } from "@/components/WordDiff";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  all: "All types", contradiction: "Contradiction", duplicate: "Duplicate",
  stale: "Stale", unsupported: "Unsupported",
};
const ROUTE_LABELS: Record<string, string> = { all: "All routes", auto: "Auto", human: "Human", dismissed: "Dismissed" };
const STATUS_LABELS: Record<string, string> = {
  all: "All statuses", open: "Open", hold: "Hold", auto_applied: "Auto-applied",
  accepted: "Accepted", synthesized: "Synthesized", kept_both: "Kept both",
  rejected: "Rejected", rolled_back: "Rolled back", dismissed: "Dismissed",
};

function filterQuery(params: Record<string, string>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && v !== "all") q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

// Version history of one document (Genealogy tab).
function GenealogyPanel({ docId, title }: { docId: string; title: string }) {
  const q = useQuery({
    queryKey: ["history", docId],
    queryFn: () => apiGet<VersionEntry[]>(`/documents/${docId}/history`),
    retry: false,
  });
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3" data-testid="genealogy-panel">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{title}</div>
      {q.isError && <p className="text-sm text-slate-400">History unavailable.</p>}
      <div className="space-y-1.5">
        {(q.data ?? []).map((v) => (
          <div key={v.seq} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-mono text-xs text-slate-500">v{v.version_no}</span>
            <span className="min-w-0 flex-1 truncate text-slate-700">{v.reason}</span>
            <span className="font-mono text-[11px] text-slate-400" title={v.hash}>{v.hash.slice(0, 10)}…</span>
          </div>
        ))}
        {q.data && q.data.length === 0 && <p className="text-sm text-slate-400">No versions.</p>}
      </div>
    </div>
  );
}

function ConflictDetail({ conflict, role }: { conflict: Conflict; role: string }) {
  const qc = useQueryClient();
  const [merged, setMerged] = useState("");
  const isReviewer = role === "admin" || role === "reviewer";
  const isAdmin = role === "admin";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["conflicts"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["ledger", "verify"] });
  };

  const resolve = useMutation({
    mutationFn: (body: { action: string; merged_text?: string }) =>
      apiPost(`/conflicts/${conflict.id}/resolve`, body),
    onSuccess: (_r, v) => {
      toast.success(`Decision applied: ${v.action.replace("_", " ")}`);
      invalidate();
    },
    onError: (e) => toast.error(formatError(e)),
  });
  const suggest = useMutation({
    mutationFn: () => apiPost<{ merged: string | null }>(`/conflicts/${conflict.id}/suggest`),
    onSuccess: (r) => {
      if (r.merged) setMerged(r.merged);
      else toast.info("LLM is offline — write the merged sentence yourself");
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const proposal = conflict.proposal;
  const winnerIsA =
    proposal.kind === "replace"
      ? proposal.new_sentence === conflict.text_a
      : proposal.kind === "remove"
        ? proposal.doc_id === conflict.doc_b // removing B's sentence -> A recommended
        : false;
  const paneClass = (recommended: boolean) =>
    cn("rounded-lg border p-3", recommended ? "border-teal-500 bg-teal-50/40 ring-1 ring-teal-500" : "border-slate-200 bg-white");

  return (
    <Tabs defaultValue="compare" data-testid="conflict-detail-tabs">
      <TabsList>
        <TabsTrigger value="compare">Compare</TabsTrigger>
        <TabsTrigger value="genealogy">Genealogy</TabsTrigger>
        <TabsTrigger value="resolve">Resolve</TabsTrigger>
      </TabsList>

      <TabsContent value="compare" className="space-y-4" data-testid="tab-compare">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className={paneClass(proposal.kind !== "none" && winnerIsA)} data-testid="compare-pane-a">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              A {proposal.kind !== "none" && winnerIsA ? "· recommended" : ""}
            </div>
            <p className="text-sm leading-6 text-slate-800">{conflict.text_a}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conflict.trust_a != null && conflict.date_a && (
                <SourceBadge sourceType={conflict.doc_a_title ?? "doc A"} trust={conflict.trust_a} date={conflict.date_a} />
              )}
            </div>
          </div>
          <div className={paneClass(proposal.kind !== "none" && !winnerIsA)} data-testid="compare-pane-b">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              B {proposal.kind !== "none" && !winnerIsA ? "· recommended" : ""}
            </div>
            <p className="text-sm leading-6 text-slate-800">{conflict.text_b ?? "(single-claim finding)"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conflict.trust_b != null && conflict.date_b ? (
                <SourceBadge sourceType={conflict.doc_b_title ?? "doc B"} trust={conflict.trust_b} date={conflict.date_b} />
              ) : (
                <span className="text-xs text-slate-400">{conflict.doc_b_title ?? "no counterpart document"}</span>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900" data-testid="proposed-fix">
          <span className="font-semibold">Proposed fix · </span>
          {proposal.kind === "none" && "No deterministic proposal — a human must decide (use Synthesize or Keep both)."}
          {proposal.kind === "replace" && `Replace the sentence in "${proposal.doc_id === conflict.doc_a ? conflict.doc_a_title : conflict.doc_b_title}" with the recommended one.`}
          {proposal.kind === "remove" && `Remove the duplicate/unsupported sentence from "${proposal.doc_id === conflict.doc_a ? conflict.doc_a_title : conflict.doc_b_title}".`}
        </div>
      </TabsContent>

      <TabsContent value="genealogy" className="space-y-4" data-testid="tab-genealogy">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <GenealogyPanel docId={conflict.doc_a} title={conflict.doc_a_title ?? "Document A"} />
          {conflict.doc_b ? (
            <GenealogyPanel docId={conflict.doc_b} title={conflict.doc_b_title ?? "Document B"} />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-400">
              Single-claim finding — no counterpart document.
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="resolve" className="space-y-4" data-testid="tab-resolve">
        {!isReviewer ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Viewers cannot resolve findings — sign in as a reviewer or admin.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm" data-testid="btn-accept-fix" disabled={proposal.kind === "none" || resolve.isPending}
                onClick={() => resolve.mutate({ action: "accept" })}
              >
                Accept fix
              </Button>
              <Button size="sm" variant="outline" data-testid="btn-keep-both" disabled={resolve.isPending} onClick={() => resolve.mutate({ action: "keep_both" })}>
                Keep both
              </Button>
              <Button size="sm" variant="outline" data-testid="btn-hold" disabled={resolve.isPending} onClick={() => resolve.mutate({ action: "hold" })}>
                Hold
              </Button>
              <Button size="sm" variant="outline" data-testid="btn-reject-fix" disabled={resolve.isPending} onClick={() => resolve.mutate({ action: "reject" })}>
                Reject
              </Button>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Synthesize merged sentence</span>
                <Button size="xs" variant="ghost" data-testid="btn-suggest-merge" disabled={suggest.isPending} onClick={() => suggest.mutate()}>
                  {suggest.isPending ? "Asking…" : "Suggest merge (LLM)"}
                </Button>
              </div>
              <Textarea
                data-testid="synthesize-textarea"
                value={merged}
                onChange={(e) => setMerged(e.target.value)}
                placeholder="Write the merged sentence, then apply — replaces A's sentence and removes B's."
                rows={3}
              />
              <Button
                size="sm" className="mt-2" data-testid="btn-apply-synthesis"
                disabled={!merged.trim() || resolve.isPending || !conflict.text_b}
                onClick={() => resolve.mutate({ action: "synthesize", merged_text: merged })}
              >
                Apply synthesis
              </Button>
            </div>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

export default function ReviewQueue() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<User>("/auth/me"), retry: false });
  const role = me.data?.role ?? "viewer";
  const isAdmin = role === "admin";

  const [typeFilter, setTypeFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const conflicts = useQuery({
    queryKey: ["conflicts", statusFilter, typeFilter, routeFilter],
    queryFn: () => apiGet<Conflict[]>(`/conflicts${filterQuery({ status: statusFilter, type: typeFilter, route: routeFilter })}`),
    retry: false,
  });
  const applied = useQuery({
    queryKey: ["conflicts", "auto_applied"],
    queryFn: () => apiGet<Conflict[]>("/conflicts?status=auto_applied"),
    retry: false,
  });

  const qc = useQueryClient();
  const undo = useMutation({
    mutationFn: (id: string) => apiPost(`/conflicts/${id}/undo`),
    onSuccess: () => {
      toast.success("Auto-applied fix undone — the previous version was restored on the ledger");
      qc.invalidateQueries({ queryKey: ["conflicts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["ledger", "verify"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const selected = useMemo(
    () => conflicts.data?.find((c) => c.id === selectedId) ?? conflicts.data?.[0] ?? null,
    [conflicts.data, selectedId],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Review queue</h1>
        <p className="text-sm text-slate-500">Findings routed to humans, with auto-applied fixes listed below.</p>
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap gap-2">
        <Select value={typeFilter} onValueChange={(v: string) => setTypeFilter(v)}>
          <SelectTrigger data-testid="filter-type" className="w-44"><SelectValue>{TYPE_LABELS[typeFilter]}</SelectValue></SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={routeFilter} onValueChange={(v: string) => setRouteFilter(v)}>
          <SelectTrigger data-testid="filter-route" className="w-44"><SelectValue>{ROUTE_LABELS[routeFilter]}</SelectValue></SelectTrigger>
          <SelectContent>
            {Object.entries(ROUTE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v)}>
          <SelectTrigger data-testid="filter-status" className="w-44"><SelectValue>{STATUS_LABELS[statusFilter]}</SelectValue></SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* findings list */}
        <div className="space-y-3 xl:col-span-5" data-testid="findings-list">
          {conflicts.isPending && <Card><CardContent className="p-4 text-sm text-slate-400">Loading findings…</CardContent></Card>}
          {conflicts.data && conflicts.data.length === 0 && (
            <Card><CardContent className="p-4 text-sm text-slate-400">No findings match these filters. Run a scan from the dashboard.</CardContent></Card>
          )}
          {(conflicts.data ?? []).map((c) => (
            <button
              key={c.id}
              data-testid={`finding-card-${c.type}`}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full rounded-xl border bg-white p-4 text-left transition-all duration-200 hover:shadow-md",
                selected?.id === c.id ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-200",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <TypeBadge type={c.type} />
                <RouteBadge route={c.route} tie={c.tie} />
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-2">
                <ConfidenceBar value={c.confidence} />
                <div className="mt-1 flex justify-between text-xs text-slate-500">
                  <span>confidence {c.confidence.toFixed(2)}</span>
                  <span>{c.sim != null ? `sim ${c.sim.toFixed(2)}` : "single claim"}</span>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{c.explanation}</p>
            </button>
          ))}
        </div>

        {/* detail pane */}
        <div className="xl:col-span-7">
          {selected ? (
            <Card data-testid="conflict-detail-panel">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <TypeBadge type={selected.type} />
                  <span className="text-sm font-normal text-slate-500">{selected.explanation}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ConflictDetail conflict={selected} role={role} />
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="p-6 text-sm text-slate-400">Select a finding to inspect it.</CardContent></Card>
          )}
        </div>
      </div>

      {/* auto-applied fixes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auto-applied fixes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(applied.data ?? []).map((c) => (
                <TableRow key={c.id} data-testid="auto-applied-row">
                  <TableCell><TypeBadge type={c.type} /></TableCell>
                  <TableCell>{c.confidence.toFixed(2)}</TableCell>
                  <TableCell className="max-w-md truncate text-slate-600">{c.explanation}</TableCell>
                  <TableCell className="text-right">
                    {isAdmin ? (
                      <Button size="xs" variant="outline" data-testid="btn-undo-fix" disabled={undo.isPending} onClick={() => undo.mutate(c.id)}>
                        Undo
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">admin only</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(applied.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-sm text-slate-400">No auto-applied fixes yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
