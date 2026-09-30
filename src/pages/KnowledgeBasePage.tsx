import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen, Plus, Search, ShieldCheck, ShieldAlert, FileText,
  Calendar, Award, History, ArrowRight, UploadCloud, Eye, CheckCircle2, RotateCcw
} from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import type { Document, VersionEntry } from "@/lib/types";
import { formatError } from "@/components/AppShell";
import { TrustBadge, SourceBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";

export default function KnowledgeBasePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "quarantined">("all");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New doc form state
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [sourceType, setSourceType] = useState("official_wiki");
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));

  const docsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiGet<Document[]>("/documents"),
  });

  const historyQuery = useQuery({
    queryKey: ["document", selectedDoc?.id, "history"],
    queryFn: () => apiGet<VersionEntry[]>(`/documents/${selectedDoc?.id}/history`),
    enabled: Boolean(selectedDoc?.id),
  });

  const createMutation = useMutation({
    mutationFn: (body: { title: string; text: string; source_type: string; doc_date: string }) =>
      apiPost<Document>("/documents", body),
    onSuccess: (newDoc) => {
      toast.success(`Document ingested: "${newDoc.title}"`);
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["health-score"] });
      setShowCreateModal(false);
      setTitle("");
      setText("");
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const rollbackMutation = useMutation({
    mutationFn: ({ docId, verNo }: { docId: string; verNo: number }) =>
      apiPost(`/documents/${docId}/rollback/${verNo}`),
    onSuccess: () => {
      toast.success("Document successfully rolled back to selected version");
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["document", selectedDoc?.id, "history"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["health-score"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const filteredDocs = (docsQuery.data || []).filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-indigo-600" />
            Knowledge Base Repository
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enterprise documents, policies, and reference materials with cryptographic version lineage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
            <DialogTrigger
              render={
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-sm" />
              }
            >
              <Plus className="h-4 w-4" /> Ingest Document
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Ingest New Knowledge Document</DialogTitle>
                <DialogDescription>
                  Documents are automatically evaluated for prompt injections, claims are indexed, and version hashes are anchored to the ledger.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Document Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Information Security Standard 2025"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="source">Source Classification</Label>
                    <select
                      id="source"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                      value={sourceType}
                      onChange={(e) => setSourceType(e.target.value)}
                    >
                      <option value="signed_policy">Signed Policy (Trust 0.95)</option>
                      <option value="official_wiki">Official Wiki (Trust 0.85)</option>
                      <option value="team_wiki">Team Wiki (Trust 0.65)</option>
                      <option value="email">Email Communication (Trust 0.50)</option>
                      <option value="chat">Slack / Chat Thread (Trust 0.35)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="date">Publication / Effective Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={docDate}
                      onChange={(e) => setDocDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="content">Document Text / Claims</Label>
                  <Textarea
                    id="content"
                    rows={6}
                    placeholder="Paste corporate guidelines, compliance rules, or technical documentation..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={!title.trim() || !text.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate({ title, text, source_type: sourceType, doc_date: docDate })}
                >
                  {createMutation.isPending ? "Ingesting & Scanning..." : "Ingest & Anchor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search documents by title or ID..."
            className="pl-9 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <Button
            size="sm"
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
          >
            All ({docsQuery.data?.length || 0})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "active" ? "default" : "outline"}
            className={statusFilter === "active" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
            onClick={() => setStatusFilter("active")}
          >
            Active ({docsQuery.data?.filter((d) => d.status === "active").length || 0})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "quarantined" ? "default" : "outline"}
            className={statusFilter === "quarantined" ? "bg-rose-600 hover:bg-rose-700 text-white" : ""}
            onClick={() => setStatusFilter("quarantined")}
          >
            Quarantined ({docsQuery.data?.filter((d) => d.status === "quarantined").length || 0})
          </Button>
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDocs.map((doc) => {
          const isQuarantined = doc.status === "quarantined";
          return (
            <Card
              key={doc.id}
              className={`hover:shadow-md transition-shadow cursor-pointer border ${
                isQuarantined
                  ? "border-rose-300 bg-rose-50/40"
                  : "border-slate-200 bg-white"
              }`}
              onClick={() => setSelectedDoc(doc)}
            >
              <CardHeader className="pb-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <SourceBadge src={doc.source_type} />
                    <TrustBadge trust={doc.trust} />
                  </div>
                  {isQuarantined ? (
                    <Badge variant="destructive" className="gap-1 text-xs shrink-0">
                      <ShieldAlert className="h-3 w-3" /> Quarantined
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1 text-xs shrink-0">
                      <ShieldCheck className="h-3 w-3" /> v{doc.current_version_no}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base font-semibold text-slate-900 mt-2 line-clamp-2">
                  {doc.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="text-xs text-slate-500 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> {doc.doc_date}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {doc.id}
                  </span>
                </div>
                {isQuarantined && doc.quarantine_reason && (
                  <div className="rounded-md bg-rose-100/70 p-2 text-xs text-rose-800 border border-rose-200">
                    <p className="font-medium">Quarantine Reason:</p>
                    <p className="line-clamp-2 mt-0.5">{doc.quarantine_reason}</p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t text-xs text-indigo-600 font-medium">
                  <span>Inspect lineage & claims</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredDocs.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-dashed border-slate-300">
          <BookOpen className="h-10 w-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-base font-semibold text-slate-800">No documents found</h3>
          <p className="text-sm text-slate-500 mt-1">Try adjusting your search criteria or ingest a new document.</p>
        </div>
      )}

      {/* Selected Document Details & History Modal */}
      {selectedDoc && (
        <Dialog open={Boolean(selectedDoc)} onOpenChange={() => setSelectedDoc(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <SourceBadge src={selectedDoc.source_type} />
                <TrustBadge trust={selectedDoc.trust} />
                <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                  Version {selectedDoc.current_version_no}
                </Badge>
              </div>
              <DialogTitle className="text-xl">{selectedDoc.title}</DialogTitle>
              <DialogDescription className="font-mono text-xs text-slate-400">
                Document ID: {selectedDoc.id} · Effective: {selectedDoc.doc_date}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-3">
              {/* Document Status Banner */}
              {selectedDoc.status === "quarantined" ? (
                <div className="rounded-lg border border-rose-300 bg-rose-50 p-3.5 flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-rose-900">
                    <p className="font-semibold">Security Quarantine Active</p>
                    <p className="text-xs text-rose-700 mt-0.5">{selectedDoc.quarantine_reason}</p>
                    <p className="text-xs text-rose-600 mt-1">Claims from this document are completely withheld from RAG retrieval.</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 flex items-center justify-between text-xs text-emerald-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Active in Knowledge Base · High Confidence Retrieval Verified</span>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-600">Trust: {(selectedDoc.trust * 100).toFixed(0)}%</span>
                </div>
              )}

              {/* Version History Timeline */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <History className="h-4 w-4 text-indigo-600" />
                  Cryptographic Version History & Rollback Lineage
                </h4>
                <div className="space-y-2.5">
                  {historyQuery.isLoading ? (
                    <div className="p-4 text-center text-sm text-slate-400">Loading version lineage…</div>
                  ) : (
                    (historyQuery.data || []).map((ver) => {
                      const isCurrent = ver.version_no === selectedDoc.current_version_no;
                      return (
                        <div
                          key={ver.id}
                          className={`rounded-lg border p-3 text-xs transition-colors ${
                            isCurrent
                              ? "border-indigo-300 bg-indigo-50/40"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={isCurrent ? "default" : "outline"} className={isCurrent ? "bg-indigo-600" : ""}>
                                Version v{ver.version_no}
                              </Badge>
                              <span className="font-medium text-slate-700">{ver.reason}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">{new Date(ver.ts).toLocaleTimeString()}</span>
                              {!isCurrent && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1"
                                  disabled={rollbackMutation.isPending}
                                  onClick={() => rollbackMutation.mutate({ docId: selectedDoc.id, verNo: ver.version_no })}
                                >
                                  <RotateCcw className="h-3 w-3" /> Rollback to v{ver.version_no}
                                </Button>
                              )}
                            </div>
                          </div>
                          <p className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-700 font-mono text-[11px] leading-relaxed">
                            {ver.text}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>Author: {ver.author}</span>
                            <span>SHA-256: {ver.hash.slice(0, 16)}…</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedDoc(null)}>
                Close Inspector
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
