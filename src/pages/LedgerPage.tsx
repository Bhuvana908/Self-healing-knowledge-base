import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldAlert, ShieldCheck, Link2, RotateCcw, AlertTriangle, Bug,
  CheckCircle2, Key, Terminal, ArrowRight, RefreshCw, Hash
} from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import type { Document, LedgerBlock, User, VerifyResponse, VersionEntry } from "@/lib/types";
import { formatError } from "@/components/AppShell";
import { WordDiff } from "@/components/WordDiff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function LedgerPage() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<User>("/auth/me"), retry: false });
  const isAdmin = me.data?.role === "admin";
  const qc = useQueryClient();

  const [isTamperActive, setIsTamperActive] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<LedgerBlock | null>(null);

  const verify = useQuery({
    queryKey: ["ledger", "verify"],
    queryFn: () => apiGet<VerifyResponse>("/ledger/verify"),
    refetchInterval: 10000,
    retry: false,
  });

  const blocksQuery = useQuery({
    queryKey: ["ledger", "blocks"],
    queryFn: () => apiGet<LedgerBlock[]>("/ledger/blocks"),
  });

  const docs = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiGet<Document[]>("/documents"),
    retry: false,
  });

  const [docId, setDocId] = useState<string>("");
  const history = useQuery({
    queryKey: ["history", docId],
    queryFn: () => apiGet<VersionEntry[]>(`/documents/${docId}/history`),
    retry: false,
    enabled: !!docId,
  });

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const versions = history.data ?? [];
  const current = useMemo(
    () => versions.reduce<VersionEntry | null>((acc, v) => (!acc || v.version_no > acc.version_no ? v : acc), null),
    [versions]
  );
  const selected = versions.find((v) => v.version_no === selectedVersion) ?? null;

  const rollback = useMutation({
    mutationFn: (v: number) => apiPost(`/documents/${docId}/rollback/${v}`),
    onSuccess: () => {
      toast.success("Rollback applied — the old text was appended as a NEW version (nothing deleted)");
      qc.invalidateQueries({ queryKey: ["history", docId] });
      qc.invalidateQueries({ queryKey: ["ledger", "verify"] });
      qc.invalidateQueries({ queryKey: ["ledger", "blocks"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const tamperDemoMutation = useMutation({
    mutationFn: (enabled: boolean) => apiPost("/ledger/tamper-demo", { enabled }),
    onSuccess: (data: any) => {
      setIsTamperActive(data.simulatedTamperActive);
      if (data.simulatedTamperActive) {
        toast.error("Simulated bit-flip activated on Block #2! Tamper detected by SHA-256 verifier.");
      } else {
        toast.success("Cryptographic integrity restored! All SHA-256 chain links valid.");
      }
      qc.invalidateQueries({ queryKey: ["ledger", "verify"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <Link2 className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Cryptographic Ledger & Tamper Proofing
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Append-only hash-chained ledger: every document update, conflict resolution, and red-team remediation is cryptographically anchored.
          </p>
        </div>

        {/* Tamper Simulation Toggle for Judges */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isTamperActive ? "destructive" : "outline"}
            className={`text-xs gap-1.5 shadow-sm font-semibold ${
              !isTamperActive ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" : ""
            }`}
            onClick={() => tamperDemoMutation.mutate(!isTamperActive)}
          >
            <Bug className="h-4 w-4" />
            {isTamperActive ? "Reset to Clean Ledger" : "Simulate Tamper Bit-Flip (Demo)"}
          </Button>
        </div>
      </div>

      {/* Cryptographic Chain Verification Banner */}
      <div
        data-testid="chain-verification-banner"
        className={cn(
          "rounded-xl border p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-all",
          verify.data?.ok
            ? "border-emerald-300 bg-emerald-50/70 text-emerald-950"
            : "border-rose-300 bg-rose-50 text-rose-950 ring-2 ring-rose-200"
        )}
      >
        <div className="flex items-start gap-3">
          {verify.data?.ok ? (
            <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <p className="font-bold text-sm">
              {verify.data?.ok ? "Cryptographic Ledger Verified: 100% Continuity" : "TAMPER DETECTED: CRYPTOGRAPHIC INTEGRITY VIOLATION"}
            </p>
            <p className="text-slate-600">
              {verify.data?.versions.message || "Auditing SHA-256 chain links across all ledger blocks…"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] self-end sm:self-center">
          <Badge variant="outline" className={verify.data?.ok ? "border-emerald-300 text-emerald-800" : "border-rose-300 text-rose-800"}>
            {blocksQuery.data?.length || 0} Anchored Blocks
          </Badge>
          <span className="text-slate-400">Checked: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Block Explorer Table */}
      <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 bg-slate-50 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Hash className="h-4 w-4 text-indigo-600" />
              Immutable Ledger Blocks Explorer
            </CardTitle>
            <CardDescription className="text-xs">
              Every block computes SHA-256(prev_hash | seq | timestamp | actor | event_type | canonical_payload)
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-slate-500 gap-1"
            onClick={() => qc.invalidateQueries({ queryKey: ["ledger", "blocks"] })}
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-100/70 border-b text-slate-500 font-semibold">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Event Type</th>
                <th className="py-2.5 px-3">Actor</th>
                <th className="py-2.5 px-3">Target</th>
                <th className="py-2.5 px-3">SHA-256 Block Hash</th>
                <th className="py-2.5 px-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(blocksQuery.data || []).map((block) => {
                const isTamperedBlock = isTamperActive && block.seq === 2;
                return (
                  <tr
                    key={block.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isTamperedBlock ? "bg-rose-50/80 text-rose-950 font-bold" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 font-bold text-slate-900">{block.seq}</td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {new Date(block.ts).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge
                        variant="outline"
                        className={
                          isTamperedBlock
                            ? "border-rose-400 bg-rose-100 text-rose-900"
                            : "border-indigo-200 bg-indigo-50/70 text-indigo-700"
                        }
                      >
                        {block.type}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{block.actor}</td>
                    <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">{block.target}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      <span className={isTamperedBlock ? "text-rose-600 line-through" : "text-emerald-700"}>
                        {block.hash.slice(0, 16)}…
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] text-indigo-600 hover:text-indigo-800 px-2"
                        onClick={() => setSelectedBlock(block)}
                      >
                        Inspect Payload
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Document History & Rollback Section */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-indigo-600" />
            Document Version Lineage & Non-Destructive Rollback
          </CardTitle>
          <CardDescription className="text-xs">
            Admin rollbacks never delete history: rolling back appends the historical state as a new version with full cryptographic provenance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full sm:w-96">
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Select Document to Inspect:
            </label>
            <Select value={docId} onValueChange={(v) => { setDocId(v); setSelectedVersion(null); }}>
              <SelectTrigger className="w-full bg-white">
                <SelectValue placeholder="Select an enterprise document…" />
              </SelectTrigger>
              <SelectContent>
                {(docs.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title} (v{d.current_version_no})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {docId && versions.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-500">Version History:</span>
                {versions.map((v) => (
                  <Button
                    key={v.version_no}
                    size="sm"
                    variant={selectedVersion === v.version_no ? "default" : "outline"}
                    className={selectedVersion === v.version_no ? "bg-indigo-600 text-white" : ""}
                    onClick={() => setSelectedVersion(v.version_no)}
                  >
                    v{v.version_no} {v.version_no === current?.version_no ? "(Current)" : ""}
                  </Button>
                ))}
              </div>

              {selected && current && selected.version_no !== current.version_no && (
                <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm">
                        Comparing v{selected.version_no} against current v{current.version_no}
                      </h4>
                      <p className="text-xs text-slate-500 font-mono">
                        Author: {selected.author} · Reason: {selected.reason}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 shadow-sm"
                      disabled={rollback.isPending}
                      onClick={() => rollback.mutate(selected.version_no)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Rollback to v{selected.version_no}
                    </Button>
                  </div>

                  <div className="bg-white p-3 rounded border text-xs font-mono leading-relaxed">
                    <WordDiff a={current.text} b={selected.text} />
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block Payload Modal */}
      {selectedBlock && (
        <Dialog open={Boolean(selectedBlock)} onOpenChange={() => setSelectedBlock(null)}>
          <DialogContent className="max-w-xl font-mono text-xs">
            <DialogHeader>
              <DialogTitle className="font-sans text-base">
                Ledger Block #{selectedBlock.seq} Inspector
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                Event ID: {selectedBlock.id} · Type: {selectedBlock.type}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="p-2.5 rounded bg-slate-100 border text-slate-800 space-y-1">
                <span className="text-slate-500 font-bold block">Previous Block SHA-256 Hash:</span>
                <span className="text-[11px] break-all">{selectedBlock.prev_hash}</span>
              </div>

              <div className="p-2.5 rounded bg-slate-100 border text-slate-800 space-y-1">
                <span className="text-slate-500 font-bold block">Current Block SHA-256 Hash:</span>
                <span className="text-[11px] break-all text-indigo-700 font-bold">{selectedBlock.hash}</span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 font-bold block font-sans">Anchored Event Payload:</span>
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded-lg overflow-x-auto text-[11px]">
                  {JSON.stringify(selectedBlock.detail, null, 2)}
                </pre>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setSelectedBlock(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
