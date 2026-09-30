import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flame } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import type { PoisonFireResult, PoisonPayload, PoisonSpan, User } from "@/lib/types";
import { formatError } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

// Render text with malicious spans merged into non-overlapping red-highlighted marks.
function renderWithSpans(text: string, spans: PoisonSpan[]): ReactNode[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: PoisonSpan[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      last.label = `${last.label} + ${s.label}`;
    } else {
      merged.push({ ...s });
    }
  }
  const out: ReactNode[] = [];
  let pos = 0;
  merged.forEach((s, i) => {
    if (s.start > pos) out.push(<span key={`t${i}`}>{text.slice(pos, s.start)}</span>);
    out.push(
      <mark
        key={`m${i}`}
        data-testid="poison-malicious-span"
        title={s.label}
        className="rounded border border-rose-400 bg-rose-100 px-0.5 text-rose-900"
      >
        {text.slice(s.start, s.end)}
      </mark>,
    );
    pos = s.end;
  });
  if (pos < text.length) out.push(<span key="tail">{text.slice(pos)}</span>);
  return out;
}

export default function PoisonLab() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<User>("/auth/me"), retry: false });
  const role = me.data?.role ?? "viewer";
  const canFire = role === "admin" || role === "reviewer";

  const payloads = useQuery({
    queryKey: ["poison", "payloads"],
    queryFn: () => apiGet<{ payloads: PoisonPayload[]; benign: string[] }>("/poison/payloads"),
    retry: false,
  });
  const [payloadId, setPayloadId] = useState<string | null>(null);
  const [text, setText] = useState("");

  const fire = useMutation({
    mutationFn: () => apiPost<PoisonFireResult>("/poison/fire", { payload_id: payloadId, text: text || undefined }),
    onSuccess: (r) => {
      if (r.quarantined) toast.success("Payload quarantined — the live index was untouched");
      else toast.warning("Payload was NOT flagged — review the score and patterns");
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const result = fire.data;
  const score = result?.injection.score ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Poison lab</h1>
        <p className="text-sm text-slate-500">
          Fire an attack payload through the real ingestion pipeline — flagged documents are quarantined and never indexed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attack payloads</CardTitle>
              <CardDescription>Red-team presets, or edit your own below.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2" data-testid="payload-presets">
              {(payloads.data?.payloads ?? []).map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={payloadId === p.id ? "default" : "outline"}
                  data-testid={`payload-preset-${p.id}`}
                  onClick={() => {
                    setPayloadId(p.id);
                    setText(p.text);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <Textarea
                data-testid="poison-text-input"
                rows={8}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPayloadId(null);
                }}
                placeholder="Paste or edit an attack payload…"
              />
              <Button
                className="w-full"
                data-testid="btn-fire-payload"
                disabled={!canFire || fire.isPending || !text.trim()}
                onClick={() => fire.mutate()}
              >
                <Flame className="h-4 w-4" /> {fire.isPending ? "Firing…" : "Fire payload"}
              </Button>
              {!canFire && <p className="text-xs text-slate-400">Reviewer or admin role required to fire payloads.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-7">
          {!result ? (
            <Card className="flex h-64 items-center justify-center">
              <CardContent className="text-sm text-slate-400">Fire a payload to see the quarantine inspector.</CardContent>
            </Card>
          ) : (
            <>
              <Card data-testid="poison-result-panel" className={result.quarantined ? "border-rose-300" : "border-amber-300"}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Badge
                      data-testid="quarantine-result-badge"
                      className={result.quarantined ? "bg-rose-600 text-white" : "bg-amber-500 text-white"}
                    >
                      {result.quarantined ? "QUARANTINED" : "NOT FLAGGED"}
                    </Badge>
                    <span className="text-sm font-normal text-slate-500">
                      Document stored as "{result.doc.title}"
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="poison-metrics">
                    <div className="rounded-lg bg-rose-50 p-3">
                      <div className="text-xl font-semibold text-rose-800">{score.toFixed(2)}</div>
                      <div className="text-[11px] uppercase tracking-[0.15em] text-rose-600">Threat score</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xl font-semibold text-slate-800">{result.injection.zero_width_count}</div>
                      <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Zero-width chars</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xl font-semibold text-slate-800">{result.injection.hidden_count}</div>
                      <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Hidden markup</div>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-3">
                      <div className="text-xl font-semibold text-emerald-800">{result.claims_after}</div>
                      <div className="text-[11px] uppercase tracking-[0.15em] text-emerald-700">Claims in KB (after)</div>
                    </div>
                  </div>

                  {result.injection.patterns_matched.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" data-testid="patterns-matched">
                      {result.injection.patterns_matched.map((p) => (
                        <Badge key={p} variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{p}</Badge>
                      ))}
                    </div>
                  )}

                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                      Payload with malicious spans highlighted
                    </div>
                    <p className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-7">
                      {renderWithSpans(text, result.injection.spans)}
                    </p>
                  </div>

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" data-testid="claims-stability">
                    Claims in the live KB: <span className="font-semibold">{result.claims_before} → {result.claims_after}</span>{" "}
                    {result.claims_unchanged ? "· unchanged — the poison never entered the index" : "· UNEXPECTED CHANGE"}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
