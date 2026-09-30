import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import type { Document, User, VerifyResponse, VersionEntry } from "@/lib/types";
import { formatError } from "@/components/AppShell";
import { WordDiff } from "@/components/WordDiff";
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

  const verify = useQuery({
    queryKey: ["ledger", "verify"],
    queryFn: () => apiGet<VerifyResponse>("/ledger/verify"),
    retry: false,
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
  const current = useMemo(() => versions.reduce<VersionEntry | null>((acc, v) => (!acc || v.version_no > acc.version_no ? v : acc), null), [versions]);
  const selected = versions.find((v) => v.version_no === selectedVersion) ?? null;

  const rollback = useMutation({
    mutationFn: (v: number) => apiPost(`/documents/${docId}/rollback/${v}`),
    onSuccess: () => {
      toast.success("Rollback applied — the old text was appended as a NEW version (nothing deleted)");
      qc.invalidateQueries({ queryKey: ["history", docId] });
      qc.invalidateQueries({ queryKey: ["ledger", "verify"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Ledger & rollback</h1>
        <p className="text-sm text-slate-500">Hash-chained version history. Rollback appends — history is immutable.</p>
      </div>

      {/* chain verification banner */}
      <div
        data-testid="chain-verification-banner"
        className={cn(
          "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm",
          verify.isPending
            ? "border-slate-200 bg-slate-50 text-slate-500"
            : verify.data?.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-300 bg-rose-50 font-medium text-rose-900",
        )}
      >
        {verify.isPending ? (
          "Verifying chains…"
        ) : verify.data?.ok ? (
          <>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span data-testid="chain-ok-message">
              Hash chains verified — {verify.data.versions.message}; audit {verify.data.audit.message.toLowerCase()}
            </span>
          </>
        ) : (
          <>
            <ShieldAlert className="h-4 w-4" />
            <span data-testid="chain-tamper-message">{verify.data?.versions.message ?? verify.data?.audit.message}</span>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document versions</CardTitle>
          <CardDescription>Pick a document, then a version to diff against the current text.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={docId} onValueChange={(v: string) => { setDocId(v); setSelectedVersion(null); }}>
            <SelectTrigger data-testid="ledger-doc-select" className="w-full max-w-md">
              <SelectValue>{docId ? (docs.data?.find((d) => d.id === docId)?.title ?? docId) : "Choose a document"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(docs.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.title} {d.status === "quarantined" ? "(quarantined)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-2" data-testid="version-list">
            {docId && versions.map((v) => (
              <div
                key={v.seq}
                data-testid={`version-row-${v.version_no}`}
                className={cn(
                  "rounded-lg border p-3 transition-colors duration-150",
                  selectedVersion === v.version_no ? "border-indigo-500 bg-indigo-50/40" : "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <button className="w-full text-left" onClick={() => setSelectedVersion(v.version_no)}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs text-white">v{v.version_no}</span>
                    <span className="text-slate-700">{v.reason}</span>
                    <span className="text-xs text-slate-400">by {v.author}</span>
                    <span className="ml-auto font-mono text-[11px] text-slate-400" title={`hash ${v.hash} · prev ${v.prev_hash}`}>
                      {v.hash.slice(0, 12)}… ← {v.prev_hash.slice(0, 8)}…
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    seq #{v.seq} · {new Date(v.ts).toLocaleString()}
                    {v.lineage && Object.keys(v.lineage).length > 0 && (
                      <span className="ml-2 font-mono text-[11px] text-indigo-500">lineage: {JSON.stringify(v.lineage)}</span>
                    )}
                  </div>
                </button>
                {isAdmin && current && v.version_no !== current.version_no && (
                  <Dialog>
                    <DialogTrigger render={<Button size="xs" variant="outline" className="mt-2" data-testid={`btn-rollback-v${v.version_no}`} />}>
                      Rollback to v{v.version_no}
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Rollback "{docs.data?.find((d) => d.id === docId)?.title}" to v{v.version_no}?</DialogTitle>
                        <DialogDescription>
                          Rollback never deletes: the v{v.version_no} text is appended as a NEW version with reason "rollback to v{v.version_no}".
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
                        <DialogClose
                          render={
                            <Button
                              size="sm"
                              data-testid="btn-confirm-rollback"
                              disabled={rollback.isPending}
                              onClick={() => rollback.mutate(v.version_no)}
                            />
                          }
                        >
                          Confirm rollback
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            ))}
            {docId && versions.length === 0 && <p className="text-sm text-slate-400">No versions found.</p>}
            {!docId && <p className="text-sm text-slate-400">Select a document to inspect its hash chain.</p>}
          </div>

          {selected && current && (
            <div className="space-y-2" data-testid="version-diff">
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Diff: v{selected.version_no} vs current v{current.version_no}
              </div>
              <WordDiff
                before={selected.text}
                after={current.text}
                beforeLabel={`v${selected.version_no} (selected)`}
                afterLabel={`v${current.version_no} (current)`}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
