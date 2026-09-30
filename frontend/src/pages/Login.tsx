import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { ApiError, apiGet, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { NeedsSetup, User } from "@/lib/types";
import { FullSplash } from "@/components/FullSplash";
import { formatError } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Split branded login: governance assurance panel left, credential card right.
export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const status = useQuery({
    queryKey: ["auth", "status"],
    queryFn: () => apiGet<NeedsSetup>("/auth/status"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<User>("/auth/me"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const mut = useMutation({
    mutationFn: () => apiPost<User>("/auth/login", { username, password }),
    onSuccess: () => {
      beginSession();
      navigate("/");
    },
  });

  if (status.isPending) return <FullSplash label="Loading" />;
  if (status.data?.needs_setup) return <Navigate to="/setup" replace />;
  if (me.isSuccess) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-svh grid-cols-1 lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-slate-900 p-10 lg:flex">
        <div className="flex items-center gap-2 text-slate-100">
          <ShieldCheck className="h-5 w-5 text-sky-400" />
          <span className="text-sm font-semibold">Self-Healing Knowledge Base</span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold tracking-tight text-slate-50">
            Every change verified. Every fix reversible.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
            The platform audits your knowledge base for stale, duplicated, contradictory and
            unsupported claims — quarantines prompt-injection documents, auto-applies only
            high-confidence fixes, and records everything on a tamper-evident hash chain.
          </p>
        </div>
        <p className="text-xs text-slate-500">Document text is data, never instructions.</p>
      </div>

      <div className="flex items-center justify-center px-4">
        <form
          className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          data-testid="login-form"
        >
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <div className="space-y-2">
            <Label htmlFor="login-username">Username</Label>
            <Input
              id="login-username"
              data-testid="login-username-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              data-testid="login-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {mut.isError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="login-error">
              {mut.error instanceof ApiError && mut.error.status === 429
                ? "Too many failed attempts — try again in a few minutes."
                : formatError(mut.error)}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={mut.isPending} data-testid="login-form-submit-button">
            {mut.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
