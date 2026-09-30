import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api";
import type { AuditEntry } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ACTIONS = [
  "all", "ingest", "quarantine", "scan", "resolve_accept", "resolve_keep_both",
  "resolve_hold", "resolve_reject", "resolve_synthesize", "undo_fix", "rollback",
  "login", "login_failed", "login_rate_limited", "user_create", "user_update",
  "settings_update", "demo_load", "evaluation", "benchmark",
];

export default function AuditLog() {
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");

  const entries = useQuery({
    queryKey: ["audit", action],
    queryFn: () => apiGet<AuditEntry[]>(`/audit${action !== "all" ? `?action=${action}` : ""}`),
    retry: false,
  });

  const filtered = (entries.data ?? []).filter((e) =>
    search
      ? `${e.actor} ${e.action} ${e.target} ${JSON.stringify(e.detail)}`.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Audit log</h1>
        <p className="text-sm text-slate-500">Hash-chained action history — append-only, tamper-evident.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={action} onValueChange={(v: string) => setAction(v)}>
          <SelectTrigger data-testid="audit-action-filter" className="w-52">
            <SelectValue>{action === "all" ? "All actions" : action}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>{a === "all" ? "All actions" : a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          data-testid="audit-search-input"
          className="w-72"
          placeholder="Search actor, target, detail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seq</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.seq} data-testid={`audit-row-${e.action}`}>
                  <TableCell className="font-mono text-xs">#{e.seq}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-slate-500">{new Date(e.ts).toLocaleString()}</TableCell>
                  <TableCell>{e.actor}</TableCell>
                  <TableCell><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{e.action}</span></TableCell>
                  <TableCell className="max-w-24 truncate font-mono text-xs text-slate-500" title={e.target}>{e.target}</TableCell>
                  <TableCell className="max-w-md">
                    <details>
                      <summary className="cursor-pointer text-xs text-indigo-600">view</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-600">
                        {JSON.stringify(e.detail, null, 2)}
                      </pre>
                    </details>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-400" title={e.hash}>{(e.hash ?? "").slice(0, 10)}…</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-sm text-slate-400">No matching audit entries.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
