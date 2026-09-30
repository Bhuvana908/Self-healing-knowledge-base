import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import {
  Sparkles, CheckCircle2, XCircle, AlertTriangle, ArrowRight, ShieldCheck,
  FileText, History, HelpCircle, RefreshCw, ThumbsUp, ThumbsDown, Info, Zap
} from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import type { Conflict, ResolveOutcome } from "@/lib/types";
import { formatError } from "@/components/AppShell";
import { TrustBadge, SourceBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle
} from "@/components/ui/dialog";

export default function SelfHealingPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"all" | "open" | "resolved">("open");
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [customMergeText, setCustomMergeText] = useState("");
  const [showEvidenceModal, setShowEvidenceModal] = useState<Conflict | null>(null);

  const conflictsQuery = useQuery({
    queryKey: ["conflicts"],
    queryFn: () => apiGet<Conflict[]>("/conflicts"),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, action, merged_text }: { id: string; action: string; merged_text?: string }) =>
      apiPost<ResolveOutcome>(`/conflicts/${id}/resolve`, { action, merged_text }),
    onSuccess: (data, vars) => {
      if (vars.action === "accept" || vars.action === "synthesize") {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#4F46E5", "#0D9488", "#10B981"],
        });
        toast.success(`Self-healing applied! New document version anchored in ledger.`);
      } else if (vars.action === "reject") {
        toast.info("Proposed correction rejected. Knowledge item remains preserved.");
      }
      qc.invalidateQueries({ queryKey: ["conflicts"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["health-score"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      setSelectedConflict(null);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const conflicts = conflictsQuery.data || [];
  const filteredConflicts = conflicts.filter((c) => {
    if (activeTab === "open") return c.status === "open";
    if (activeTab === "resolved") return c.status !== "open";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <Sparkles className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Self-Healing RAG Engine
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time Before vs After reconciliation: detects conflicting or outdated enterprise claims, proposes cryptographically verified corrections, and preserves audit lineage.
          </p>
        </div>

        {/* Quick summary pill */}
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3.5 py-1.5 rounded-full text-xs font-medium text-indigo-900">
          <Zap className="h-4 w-4 text-indigo-600 animate-pulse" />
          <span>{conflicts.filter((c) => c.status === "open").length} Actions Awaiting Review</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={activeTab === "open" ? "default" : "outline"}
            className={activeTab === "open" ? "bg-indigo-600 text-white" : ""}
            onClick={() => setActiveTab("open")}
          >
            Awaiting Self-Healing ({conflicts.filter((c) => c.status === "open").length})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "resolved" ? "default" : "outline"}
            onClick={() => setActiveTab("resolved")}
          >
            Resolved Lineage ({conflicts.filter((c) => c.status !== "open").length})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "all" ? "default" : "outline"}
            onClick={() => setActiveTab("all")}
          >
            All Items ({conflicts.length})
          </Button>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs text-slate-600"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["conflicts"] });
            toast.success("Refreshed self-healing queue");
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* List of Self-Healing Cards with Before vs After Split View */}
      <div className="space-y-6">
        {filteredConflicts.map((c) => {
          const isResolved = c.status !== "open";
          const before = c.before || {
            originalContent: c.text_b || c.text_a,
            problemDescription: c.explanation,
            conflictingSource: `${c.doc_b_title || "External Source"} (${c.date_b || "Unknown date"})`,
            contradictionExcerpt: c.claim_b || c.claim_a,
          };

          const after = c.after || {
            proposedContent: c.proposal.new_sentence || c.text_a,
            changeSummary: `Replaces contradictory guidance with authoritative policy (${(c.confidence * 100).toFixed(0)}% confidence).`,
            evidence: `${c.doc_a_title} (Effective: ${c.date_a || "2025-04-01"})`,
            sources: [
              { title: c.doc_a_title || "Authoritative Policy", type: "signed_policy", date: c.date_a || "2025-04-01", trust: c.trust_a || 0.95 },
              { title: c.doc_b_title || "Conflicting Source", type: "chat", date: c.date_b || "2025-06-01", trust: c.trust_b || 0.35 },
            ],
            confidence: c.confidence,
            rationale: "Enterprise knowledge bases require higher trust policies to supersede informal documentation.",
          };

          return (
            <Card
              key={c.id}
              className={`overflow-hidden border transition-all ${
                isResolved
                  ? "border-slate-200 bg-slate-50/50 opacity-90"
                  : "border-indigo-200 shadow-sm bg-white"
              }`}
            >
              {/* Conflict Header Strip */}
              <div className="bg-slate-50 border-b px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="capitalize font-semibold border-indigo-300 bg-indigo-50 text-indigo-700 text-xs px-2.5 py-0.5"
                  >
                    {c.type}
                  </Badge>
                  <span className="font-mono text-xs text-slate-500">ID: {c.id}</span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500">
                    Confidence: <span className="font-semibold text-slate-800">{(c.confidence * 100).toFixed(0)}%</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isResolved ? (
                    <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                      <CheckCircle2 className="h-3 w-3" /> Resolved ({c.status})
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 gap-1 text-xs">
                      <AlertTriangle className="h-3 w-3 text-amber-600" /> Action Required
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-indigo-600 hover:text-indigo-800 gap-1 px-2"
                    onClick={() => setShowEvidenceModal(c)}
                  >
                    <Info className="h-3.5 w-3.5" /> Explainability & Evidence
                  </Button>
                </div>
              </div>

              {/* CORE BEFORE vs AFTER SPLIT VIEW */}
              <CardContent className="p-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                  {/* BEFORE PANEL */}
                  <div className="p-5 space-y-4 bg-rose-50/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-xs font-bold">
                          1
                        </span>
                        <h3 className="text-sm font-bold text-rose-900 tracking-tight">
                          BEFORE (Detected Problem)
                        </h3>
                      </div>
                      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 text-[11px]">
                        Conflicting / Outdated
                      </Badge>
                    </div>

                    {/* Detected Problem Summary */}
                    <div className="rounded-md border border-rose-200 bg-white p-3 text-xs text-slate-800 space-y-1">
                      <span className="font-semibold text-rose-800 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> Problem Detected:
                      </span>
                      <p className="text-slate-600 leading-relaxed">{before.problemDescription}</p>
                    </div>

                    {/* Original Content Snippet with Red highlight */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
                        <span>Original Content:</span>
                        <span className="text-slate-400 font-mono text-[10px]">{c.doc_b_title || c.doc_a_title}</span>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 leading-relaxed relative">
                        <p>{before.originalContent}</p>
                        <div className="mt-2 pt-2 border-t border-rose-100 text-[11px] text-rose-700 font-sans">
                          <span className="font-semibold">Conflicting Excerpt: </span>
                          <span className="bg-rose-100 px-1 py-0.5 rounded text-rose-900 font-medium">
                            "{before.contradictionExcerpt}"
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Conflicting Source Details */}
                    <div className="text-xs text-slate-500 flex items-center justify-between bg-white/60 p-2 rounded border border-slate-200/60">
                      <span>Source: <strong className="text-slate-700">{before.conflictingSource}</strong></span>
                      <span className="font-mono text-rose-600">Trust: {((c.trust_b || 0.35) * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* AFTER PANEL */}
                  <div className="p-5 space-y-4 bg-emerald-50/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          2
                        </span>
                        <h3 className="text-sm font-bold text-emerald-900 tracking-tight">
                          AFTER (Proposed Self-Healing)
                        </h3>
                      </div>
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] gap-1">
                        <Sparkles className="h-3 w-3 text-emerald-600" /> AI Synthesized & Verified
                      </Badge>
                    </div>

                    {/* Proposed Corrected Content with Green highlight */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
                        <span>Proposed Corrected Version:</span>
                        <span className="text-emerald-700 font-semibold text-[11px]">
                          Confidence: {(after.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="rounded-md border border-emerald-300 bg-white p-3 font-mono text-xs text-slate-800 leading-relaxed shadow-sm">
                        <p className="bg-emerald-50/70 p-1.5 rounded border border-emerald-200 text-emerald-950 font-medium">
                          {after.proposedContent}
                        </p>
                        <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 font-sans">
                          <span className="font-semibold text-slate-700">What Changed: </span>
                          <span>{after.changeSummary}</span>
                        </div>
                      </div>
                    </div>

                    {/* Authoritative Evidence & Authority Comparison */}
                    <div className="rounded-md border border-slate-200 bg-white p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Supporting Evidence:
                        </span>
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800 font-mono text-[10px]">
                          Authoritative Trust: {((c.trust_a || 0.95) * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <p className="text-slate-600 text-xs">{after.evidence}</p>
                      <p className="text-[11px] text-slate-500 italic border-t pt-1.5">{after.rationale}</p>
                    </div>

                    {/* User Action Controls */}
                    {!isResolved && (
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm flex-1 text-xs font-semibold"
                          disabled={resolveMutation.isPending}
                          onClick={() => resolveMutation.mutate({ id: c.id, action: "accept" })}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" /> Accept Proposed Correction
                        </Button>
                        <Button
                          variant="outline"
                          className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs"
                          onClick={() => {
                            setSelectedConflict(c);
                            setCustomMergeText(after.proposedContent);
                          }}
                        >
                          Edit & Synthesize…
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-slate-500 hover:text-rose-600 text-xs"
                          disabled={resolveMutation.isPending}
                          onClick={() => resolveMutation.mutate({ id: c.id, action: "reject" })}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    )}

                    {isResolved && (
                      <div className="bg-emerald-100/50 text-emerald-900 border border-emerald-200 rounded p-2 text-xs flex items-center justify-between">
                        <span className="flex items-center gap-1 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                          Correction accepted and permanently recorded in Ledger.
                        </span>
                        <span className="font-mono text-[11px] text-emerald-700">Status: {c.status}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredConflicts.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800">Knowledge Base 100% In Harmony</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
              No unresolved conflicts or stale documents currently require intervention. All claims are verified against authoritative signed policies.
            </p>
          </div>
        )}
      </div>

      {/* Edit & Synthesize Dialog */}
      {selectedConflict && (
        <Dialog open={Boolean(selectedConflict)} onOpenChange={() => setSelectedConflict(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Edit & Synthesize Custom Resolution</DialogTitle>
              <DialogDescription>
                Customize the exact sentence that will update the target document in the knowledge base and ledger.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700 border">
                <p className="font-semibold text-slate-800 mb-1">Target Document:</p>
                <p>{selectedConflict.doc_b_title || selectedConflict.doc_a_title}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Synthesized Content</label>
                <Textarea
                  rows={4}
                  className="font-mono text-xs"
                  value={customMergeText}
                  onChange={(e) => setCustomMergeText(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedConflict(null)}>
                Cancel
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={!customMergeText.trim() || resolveMutation.isPending}
                onClick={() =>
                  resolveMutation.mutate({
                    id: selectedConflict.id,
                    action: "synthesize",
                    merged_text: customMergeText,
                  })
                }
              >
                Apply Custom Synthesis
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Explainability & Evidence Modal */}
      {showEvidenceModal && (
        <Dialog open={Boolean(showEvidenceModal)} onOpenChange={() => setShowEvidenceModal(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-indigo-700">
                  {showEvidenceModal.type.toUpperCase()}
                </Badge>
                <span className="text-xs text-slate-400 font-mono">ID: {showEvidenceModal.id}</span>
              </div>
              <DialogTitle>Explainability & Evidence Panel</DialogTitle>
              <DialogDescription>
                Full reasoning trace and source confidence metrics behind this self-healing proposal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border space-y-2">
                <h4 className="font-semibold text-slate-900 text-sm">System Decision Rationale:</h4>
                <p className="text-slate-700 leading-relaxed">{showEvidenceModal.explanation}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-1.5">
                  <span className="font-semibold text-slate-800">Authoritative Document (Doc A):</span>
                  <p className="text-slate-600 font-medium">{showEvidenceModal.doc_a_title}</p>
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t text-slate-500">
                    <span>Trust Rating:</span>
                    <strong className="text-emerald-700 font-mono">{((showEvidenceModal.trust_a || 0.95) * 100).toFixed(0)}%</strong>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-1.5">
                  <span className="font-semibold text-slate-800">Conflicting Document (Doc B):</span>
                  <p className="text-slate-600 font-medium">{showEvidenceModal.doc_b_title || "External Communication"}</p>
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t text-slate-500">
                    <span>Trust Rating:</span>
                    <strong className="text-rose-700 font-mono">{((showEvidenceModal.trust_b || 0.35) * 100).toFixed(0)}%</strong>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-indigo-100 bg-indigo-50/40 text-slate-800 space-y-1.5">
                <span className="font-semibold text-indigo-900">Cryptographic Ledger Impact:</span>
                <p className="text-slate-600">
                  Acceptance of this self-healing proposal computes a new SHA-256 block anchored with the hash of the previous version, guaranteeing immutable provenance.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setShowEvidenceModal(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
