import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { User } from "@/lib/types";
import { formatError } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// First-run bootstrap: creates an admin account and signs in.
export default function Setup() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<User>("/auth/me"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const mut = useMutation({
    mutationFn: () => apiPost<User>("/auth/setup", { username, password }),
    onSuccess: () => {
      beginSession();
      navigate("/");
    },
  });

  if (me.isSuccess) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Self-Healing Knowledge Base</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create an administrator account and initialize your session.
          </p>
        </div>
        <form
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          data-testid="setup-form"
        >
          <div className="space-y-2">
            <Label htmlFor="setup-username">Admin username</Label>
            <Input
              id="setup-username"
              data-testid="setup-username-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              required
              minLength={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-password">Password</Label>
            <Input
              id="setup-password"
              data-testid="setup-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          {mut.isError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="setup-error">
              {formatError(mut.error)}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={mut.isPending} data-testid="setup-form-submit-button">
            {mut.isPending ? "Creating…" : "Create admin & initialize ledger"}
          </Button>
          <div className="text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-indigo-600 hover:underline">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
