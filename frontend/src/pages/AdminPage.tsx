import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PlugZap } from "lucide-react";

import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import type { LlmPing, LlmStatus, Settings, User } from "@/lib/types";
import { formatError } from "@/components/AppShell";
import { DatasetImportCard } from "@/components/DatasetImportCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const THRESHOLD_FIELDS: { key: string; label: string; step: number }[] = [
  { key: "auto_apply", label: "Auto-apply threshold", step: 0.05 },
  { key: "human_min", label: "Human-review minimum", step: 0.05 },
  { key: "duplicate_sim", label: "Duplicate similarity", step: 0.05 },
  { key: "conflict_sim", label: "Conflict similarity", step: 0.05 },
  { key: "llm_band_sim", label: "Judge-band similarity", step: 0.05 },
  { key: "knn_k", label: "kNN k", step: 1 },
  { key: "stale_days", label: "Stale gap (days)", step: 1 },
  { key: "embedding_weight", label: "Embedding blend weight", step: 0.05 },
  { key: "winner_trust_gap", label: "Winner trust gap", step: 0.01 },
  { key: "winner_date_gap_days", label: "Winner date gap (days)", step: 1 },
];

export default function AdminPage() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<User>("/auth/me"), retry: false });
  const isAdmin = me.data?.role === "admin";
  const qc = useQueryClient();

  const users = useQuery({
    queryKey: ["auth", "users"],
    queryFn: () => apiGet<User[]>("/auth/users"),
    retry: false,
    enabled: isAdmin,
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<Settings>("/settings"),
    retry: false,
    enabled: isAdmin,
  });
  const llm = useQuery({
    queryKey: ["llm-status"],
    queryFn: () => apiGet<LlmStatus>("/admin/llm-status"),
    retry: false,
  });

  const [trust, setTrust] = useState<Record<string, number>>({});
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("viewer");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["auth", "users"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["ledger", "verify"] });
  };
  const err = (e: unknown) => toast.error(formatError(e));

  const saveTrust = useMutation({
    mutationFn: () => apiPut("/settings/trust", { trust }),
    onSuccess: () => { toast.success("Trust table saved"); invalidate(); },
    onError: err,
  });
  const saveThresholds = useMutation({
    mutationFn: () => apiPut("/settings/thresholds", { thresholds }),
    onSuccess: () => { toast.success("Thresholds saved — the next scan uses them"); invalidate(); },
    onError: err,
  });
  const testLlm = useMutation({
    mutationFn: () => apiPost<LlmPing>("/admin/llm-test"),
    onSuccess: (r) => {
      if (r.connected) toast.success(`Provider connected (${r.model ?? r.provider})`);
      else toast.warning("Provider not reachable — detection stays on the offline engine");
      qc.invalidateQueries({ queryKey: ["llm-status"] });
    },
    onError: err,
  });
  const changeRole = useMutation({    mutationFn: ({ username, role }: { username: string; role: string }) =>
      apiPatch(`/auth/users/${username}`, { role }),
    onSuccess: () => { toast.success("Role updated"); invalidate(); },
    onError: err,
  });
  const createUser = useMutation({    mutationFn: () => apiPost("/auth/users", { username: newUsername, password: newPassword, role: newRole }),
    onSuccess: () => {
      toast.success(`User ${newUsername} created`);
      setNewUserOpen(false);
      setNewUsername(""); setNewPassword(""); setNewRole("viewer");
      invalidate();
    },
    onError: err,
  });

  if (!isAdmin) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-slate-500" data-testid="admin-gate">
        Admin role required — this section manages users, trust scores and thresholds.
      </CardContent></Card>
    );
  }

  const trustData = { ...(settings.data?.trust ?? {}), ...trust };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Admin</h1>
        <p className="text-sm text-slate-500">Users, source trust, routing thresholds, and provider status.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* user management */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Users & roles</CardTitle>
              <CardDescription>viewer (read-only) · reviewer (ingest/scan/resolve) · admin (everything)</CardDescription>
            </div>
            <Dialog open={newUserOpen} onOpenChange={setNewUserOpen}>
              <DialogTrigger render={<Button size="sm" data-testid="btn-open-create-user" />}>Add user</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create user</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-username">Username</Label>
                    <Input id="new-username" data-testid="new-username-input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">Password</Label>
                    <Input id="new-password" data-testid="new-password-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select value={newRole} onValueChange={(v: string) => setNewRole(v)}>
                      <SelectTrigger data-testid="new-role-select" className="w-full">
                        <SelectValue>{newRole}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">viewer</SelectItem>
                        <SelectItem value="reviewer">reviewer</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button data-testid="btn-confirm-create-user" disabled={createUser.isPending || !newUsername || newPassword.length < 8} onClick={() => createUser.mutate()}>
                    Create user
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users.data ?? []).map((u) => (
                  <TableRow key={u.username} data-testid={`user-row-${u.username}`}>
                    <TableCell>{u.username}</TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={(v: string) => changeRole.mutate({ username: u.username, role: v })}>
                        <SelectTrigger size="sm" data-testid={`role-select-${u.username}`} className="w-32">
                          <SelectValue>{u.role}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">viewer</SelectItem>
                          <SelectItem value="reviewer">reviewer</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* provider status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><PlugZap className="h-4 w-4 text-teal-600" /> LLM / embedding provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm" data-testid="provider-status">
            <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-500">LLM judge</span>
              <span className="font-medium" data-testid="llm-provider-value">{llm.data?.llm ?? "…"}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-500">Embeddings</span>
              <span className="font-medium" data-testid="embeddings-provider-value">{llm.data?.embeddings ?? "…"}</span>
            </div>
            <Button
              size="sm" variant="outline" data-testid="btn-test-llm"
              disabled={testLlm.isPending} onClick={() => testLlm.mutate()}
            >
              {testLlm.isPending ? "Testing…" : "Test connection"}
            </Button>
            {testLlm.data && (
              <p
                data-testid="llm-test-result"
                className={`rounded-lg px-3 py-2 text-xs ${testLlm.data.connected ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
              >
                {testLlm.data.connected ? "Connected" : "Not connected"} — {testLlm.data.detail}
              </p>
            )}
            <p className="text-xs text-slate-400">
              The judge is label-only and has no write access: it returns contradiction / duplicate / consistent,
              an injection true/false, or a suggested merged sentence. Every write stays in deterministic code,
              and detection falls back to rules + TF-IDF whenever the provider is unavailable.
            </p>
          </CardContent>
        </Card>

        {/* labeled dataset import */}
        <div className="lg:col-span-2">
          <DatasetImportCard />
        </div>

        {/* trust table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source trust scores</CardTitle>
            <CardDescription>Used to pick winners and weight confidence. Unknown sources default to 0.30.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(trustData).map(([src, val]) => (
              <div key={src} className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm text-slate-700">{src}</span>
                <Input
                  type="number" min={0} max={1} step={0.05}
                  data-testid={`trust-input-${src}`}
                  className="w-24"
                  value={val}
                  onChange={(e) => setTrust({ ...trust, [src]: Number(e.target.value) })}
                />
              </div>
            ))}
            <Button size="sm" data-testid="btn-save-trust" disabled={saveTrust.isPending} onClick={() => saveTrust.mutate()}>Save trust table</Button>
          </CardContent>
        </Card>

        {/* thresholds */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Routing thresholds</CardTitle>
            <CardDescription>Auto-apply ≥ 0.80, human review 0.40–0.80, below 0.40 dismissed. Ties always go to a human.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {THRESHOLD_FIELDS.map(({ key, label, step }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-700">{label}</span>
                <Input
                  type="number" step={step}
                  data-testid={`threshold-input-${key}`}
                  className="w-24"
                  value={thresholds[key] ?? settings.data?.thresholds?.[key] ?? ""}
                  onChange={(e) => setThresholds({ ...thresholds, [key]: Number(e.target.value) })}
                />
              </div>
            ))}
            <Button size="sm" data-testid="btn-save-thresholds" disabled={saveThresholds.isPending} onClick={() => saveThresholds.mutate()}>Save thresholds</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
