import { NavLink, Outlet } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FlaskConical, Gauge, LayoutDashboard, Link2, ListChecks, Loader2, LogOut,
  ScrollText, Settings, ShieldAlert, ShieldCheck, ScanLine,
} from "lucide-react";

import { ApiError, apiGet, apiPost } from "@/lib/api";
import { endSession } from "@/lib/session";
import type { ScanRun, Stats, User, VerifyResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { to: "/review", label: "Review Queue", icon: ListChecks, adminOnly: false },
  { to: "/poison-lab", label: "Poison Lab", icon: FlaskConical, adminOnly: false },
  { to: "/ledger", label: "Ledger & Rollback", icon: Link2, adminOnly: false },
  { to: "/eval", label: "Evaluation", icon: Gauge, adminOnly: false },
  { to: "/audit", label: "Audit Log", icon: ScrollText, adminOnly: false },
  { to: "/admin", label: "Admin", icon: Settings, adminOnly: true },
];

// Always-visible header pill: cryptographic hash-chain integrity (green / pulse / red).
export function LedgerVerifiedBadge() {
  const q = useQuery({
    queryKey: ["ledger", "verify"],
    queryFn: () => apiGet<VerifyResponse>("/ledger/verify"),
    refetchInterval: 30000,
    retry: false,
  });
  if (q.isPending) {
    return (
      <span data-testid="badge-ledger-verified" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-pulse" /> checking ledger…
      </span>
    );
  }
  if (q.data?.ok) {
    return (
      <span data-testid="badge-ledger-verified" className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        Ledger verified · {q.data.versions.records ?? 0} versions
      </span>
    );
  }
  return (
    <span
      data-testid="badge-ledger-verified"
      title={q.data?.versions.message ?? q.data?.audit.message ?? "chain verification failed"}
      className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800"
    >
      <ShieldAlert className="h-3.5 w-3.5" /> TAMPER DETECTED
    </span>
  );
}

export function AutoApplyToggle({ enabled, admin }: { enabled: boolean; admin: boolean }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => apiPost("/settings/auto-apply", { enabled: !enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stats"] }),
    onError: (e) => toast.error(formatError(e)),
  });
  if (!admin) {
    return (
      <Badge variant="outline" data-testid="auto-apply-state" className="border-slate-200 text-slate-600">
        auto-apply {enabled ? "on" : "off"}
      </Badge>
    );
  }
  return (
    <Button
      data-testid="toggle-auto-apply"
      size="sm"
      variant={enabled ? "default" : "outline"}
      disabled={mut.isPending}
      onClick={() => mut.mutate()}
      aria-pressed={enabled}
    >
      Auto-apply {enabled ? "ON" : "OFF"}
    </Button>
  );
}

export function formatError(e: unknown): string {
  if (e instanceof ApiError) {
    const detail = (e.body as { detail?: unknown } | null)?.detail;
    return typeof detail === "string" ? detail : `${e.status} error`;
  }
  return e instanceof Error ? e.message : String(e);
}

export function RunScanButton({ disabled }: { disabled: boolean }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => apiPost<ScanRun>("/scan"),
    onSuccess: (r) => {
      toast.success(`Scan complete — ${r.found} findings, ${r.auto_fixed} auto-fixed, ${r.awaiting_human} awaiting human`, {
        description: `${r.claims} claims · ${r.pairs} candidate pairs · ${r.seconds}s`,
      });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["corpus"] });
      qc.invalidateQueries({ queryKey: ["conflicts"] });
      qc.invalidateQueries({ queryKey: ["ledger", "verify"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });
  return (
    <Button
      data-testid="btn-run-scan"
      size="sm"
      disabled={disabled || mut.isPending}
      onClick={() => mut.mutate()}
    >
      {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
      Run scan
    </Button>
  );
}

function UserMenu({ user }: { user: User }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" data-testid="user-menu-trigger" className="gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden sm:inline">{user.username}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {user.username} · <span className="capitalize">{user.role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="btn-logout"
          variant="destructive"
          onClick={() => void endSession()}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppShell() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<User>("/auth/me"), retry: false });
  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => apiGet<Stats>("/stats"),
    refetchInterval: 20000,
    retry: false,
  });
  const role = me.data?.role ?? "viewer";
  const items = NAV.filter((n) => !n.adminOnly || role === "admin");

  return (
    <div className="min-h-svh bg-slate-50">
      {/* deep-navy sidebar (spec design: #0F172A, sky active indicator) */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col bg-slate-900 md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400 text-slate-900">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-50">Self-Healing KB</div>
            <div className="text-[11px] uppercase tracking-[0.15em] text-slate-400">v1.0 · governance</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3" data-testid="sidebar-nav">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={`nav-${to === "/" ? "dashboard" : to.slice(1)}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
                  isActive
                    ? "bg-slate-800 text-sky-400 font-medium shadow-[inset_2px_0_0_0_#38BDF8]"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4 text-[11px] text-slate-400">
          Document text is data, never instructions.
        </div>
      </aside>

      <div className="md:pl-64">
        {/* glassmorphic sticky header */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 shadow-xs backdrop-blur-md sm:px-6">
          <LedgerVerifiedBadge />
          <div className="flex-1" />
          {role !== "viewer" && <RunScanButton disabled={false} />}
          <AutoApplyToggle enabled={stats.data?.auto_apply_enabled ?? false} admin={role === "admin"} />
          {me.data && <UserMenu user={me.data} />}
        </header>

        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden" data-testid="mobile-nav">
          {items.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn("whitespace-nowrap rounded-full px-3 py-1 text-xs",
                  isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8" data-testid="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
