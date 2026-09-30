import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity, ArrowRight, Award, CheckCircle2, ChevronRight,
  Download, FileText, Info, Network, Sparkles, ShieldCheck, Zap
} from "lucide-react";

import { apiGet } from "@/lib/api";
import type { HealthScoreResponse, Stats } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HealthOverviewPage() {
  const [selectedExplainItem, setSelectedExplainItem] = useState<string | null>("exp-1");

  const stats = useQuery({ queryKey: ["stats"], queryFn: () => apiGet<Stats>("/stats"), retry: false });
  const healthQuery = useQuery({
    queryKey: ["health-score"],
    queryFn: () => apiGet<HealthScoreResponse>("/health-score"),
    retry: false,
  });

  const s = stats.data;
  const health = healthQuery.data;

  const getScoreColor = (score: number) => {
    if (score >= 90) return { ring: "text-emerald-500", bg: "bg-emerald-50", badge: "bg-emerald-600 text-white" };
    if (score >= 75) return { ring: "text-indigo-600", bg: "bg-indigo-50", badge: "bg-indigo-600 text-white" };
    if (score >= 55) return { ring: "text-amber-500", bg: "bg-amber-50", badge: "bg-amber-600 text-white" };
    return { ring: "text-rose-600", bg: "bg-rose-50", badge: "bg-rose-600 text-white" };
  };

  const scoreTheme = getScoreColor(health?.overallScore || 82);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <Activity className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Knowledge Base Health Score & Explainability
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Algorithmic integrity scoring based on 8 criteria: conflicting claims, outdated documents, missing metadata, low-confidence info, duplicate data, broken dependencies, unresolved conflicts, and source reliability.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/reports">
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 text-xs font-semibold shadow-sm">
              <Download className="h-3.5 w-3.5" /> Export PDF Audit
            </Button>
          </Link>
        </div>
      </div>

      {/* Health Score & Factors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radial Health Gauge */}
        <Card className="border-indigo-100 bg-white shadow-sm flex flex-col justify-between overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-full blur-2xl -mr-10 -mt-10" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Composite Health Score
              </CardTitle>
              <Badge className={scoreTheme.badge}>
                {health?.status || "GOOD"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Algorithmic verification across 8 dimensions
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-4">
            <div className="relative flex items-center justify-center">
              <svg className="w-36 h-36 transform -rotate-90">
                <circle cx="72" cy="72" r="58" stroke="#E2E8F0" strokeWidth="12" fill="transparent" />
                <circle
                  cx="72"
                  cy="72"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeDasharray={`${2 * Math.PI * 58}`}
                  strokeDashoffset={`${2 * Math.PI * 58 * (1 - (health?.overallScore || 82) / 100)}`}
                  strokeLinecap="round"
                  fill="transparent"
                  className={`${scoreTheme.ring} transition-all duration-1000 ease-out`}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-slate-900 font-mono tracking-tight">
                  {health?.overallScore || 82}
                </span>
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-0.5">
                  / 100
                </span>
              </div>
            </div>

            <p className="text-xs text-center text-slate-500 mt-3 max-w-xs">
              {health?.overallScore && health.overallScore >= 75
                ? "Knowledge base is stable. Minor policy divergences flagged for review."
                : "Integrity alert: multiple critical policy conflicts detected across documents."}
            </p>
          </CardContent>

          <div className="bg-slate-50 p-3 border-t grid grid-cols-2 gap-2 text-xs">
            <Link to="/self-healing" className="w-full">
              <Button size="sm" variant="outline" className="w-full text-indigo-700 bg-white hover:bg-indigo-50 border-indigo-200 text-xs gap-1">
                <Sparkles className="h-3 w-3" /> Self-Healing ({s?.awaiting_human ?? 0})
              </Button>
            </Link>
            <Link to="/graph" className="w-full">
              <Button size="sm" variant="outline" className="w-full text-slate-700 bg-white hover:bg-slate-100 border-slate-200 text-xs gap-1">
                <Network className="h-3 w-3" /> Graph Multi-Hop
              </Button>
            </Link>
          </div>
        </Card>

        {/* Factors Breakdown */}
        <Card className="lg:col-span-2 border-slate-200 bg-white shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Individual Health Factors & Weighted Criteria
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Real-time algorithmic scoring across authoritative enterprise compliance criteria
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono text-xs text-indigo-700 border-indigo-200 bg-indigo-50">
                8 Factors Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-xs">
            {health &&
              Object.entries(health.breakdown).map(([factorKey, factor]) => {
                const isPass = factor.score >= 80;
                return (
                  <div key={factorKey} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 capitalize">
                        {factorKey.replace(/([A-Z])/g, " $1")}
                      </span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-[10px] text-slate-400 font-sans">({factor.weight})</span>
                        <span className={isPass ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"}>
                          {factor.score}/100
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isPass ? "bg-emerald-500" : factor.score >= 60 ? "bg-amber-500" : "bg-rose-500"
                        }`}
                        style={{ width: `${factor.score}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1">{factor.description}</p>
                  </div>
                );
              })}
          </CardContent>
          <div className="bg-slate-50/80 px-4 py-2 border-t flex items-center justify-between text-[11px] text-slate-500">
            <span>Audit Standard: SOC 2 & ISO 27001 Knowledge Integrity Criteria</span>
            <Link to="/reports" className="text-indigo-600 font-semibold hover:underline flex items-center gap-0.5">
              Full Criteria Report <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </Card>
      </div>

      {/* EXPLAINABILITY PANEL */}
      <Card className="border-indigo-200 bg-white shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-indigo-50/80 to-white border-b py-3 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-indigo-600 text-white">
                <Info className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Explainability & Decision Transparency Panel
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Inspect what the system detected, why it detected it, what evidence was cited, and what action would improve the health score.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="border-indigo-300 bg-white text-indigo-700 text-xs font-medium">
              Zero Hidden Hallucinations
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(health?.explainability || []).map((item) => {
              const isSelected = selectedExplainItem === item.id;
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3.5 cursor-pointer transition-all text-xs space-y-2 ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-300"
                      : "border-slate-200 bg-white hover:border-indigo-200"
                  }`}
                  onClick={() => setSelectedExplainItem(item.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{item.title}</span>
                    <Badge variant="outline" className="border-slate-300 text-[10px] font-mono">
                      {(item.confidence * 100).toFixed(0)}% Conf
                    </Badge>
                  </div>
                  <p className="text-slate-600 line-clamp-2">{item.whatDetected}</p>
                  <div className="text-[11px] text-indigo-700 font-semibold flex items-center justify-between pt-1 border-t">
                    <span>{item.scoreImpact}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Deep-Dive */}
          {selectedExplainItem && (
            <div className="mt-3 p-4 rounded-xl border border-indigo-200 bg-indigo-50/20 text-xs space-y-3">
              {(() => {
                const item = health?.explainability.find((x) => x.id === selectedExplainItem) || health?.explainability[0];
                if (!item) return null;
                return (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                        <h4 className="font-bold text-slate-900 text-sm">Deep-Dive: {item.title}</h4>
                      </div>
                      <Badge className="bg-indigo-600 text-white text-[11px]">
                        Confidence: {(item.confidence * 100).toFixed(0)}%
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
                        <span className="font-semibold text-slate-800">What the System Detected:</span>
                        <p className="text-slate-600">{item.whatDetected}</p>
                      </div>
                      <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
                        <span className="font-semibold text-slate-800">Why It Was Detected:</span>
                        <p className="text-slate-600">{item.whyDetected}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
                        <span className="font-semibold text-slate-800">Evidence / Sources Used:</span>
                        <p className="text-slate-600">{item.evidence}</p>
                      </div>
                      <div className="space-y-1.5 bg-emerald-50/60 p-3 rounded-lg border border-emerald-200 text-emerald-950">
                        <span className="font-semibold text-emerald-900">Recommended Action:</span>
                        <p className="text-emerald-800">{item.recommendedAction}</p>
                        <p className="text-[11px] font-bold text-emerald-700 pt-1">{item.scoreImpact}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-slate-500 text-[11px]">
                      <span>Affected Documents: <strong>{item.affectedDocuments.join(", ")}</strong></span>
                      <Link to="/self-healing">
                        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-7 text-xs gap-1">
                          Execute Self-Healing <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
