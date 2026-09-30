import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";

import { apiGet } from "@/lib/api";
import type { NeedsSetup, User } from "@/lib/types";
import { FullSplash } from "@/components/FullSplash";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import ReviewQueue from "@/pages/ReviewQueue";
import PoisonLab from "@/pages/PoisonLab";
import LedgerPage from "@/pages/LedgerPage";
import EvaluationPage from "@/pages/EvaluationPage";
import AuditLog from "@/pages/AuditLog";
import AdminPage from "@/pages/AdminPage";

// Auth gate: verifies the httpOnly session cookie; routes to /setup on first run
// (no default credentials exist), /login otherwise.
function RequireAuth() {
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<User>("/auth/me"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const status = useQuery({
    queryKey: ["auth", "status"],
    queryFn: () => apiGet<NeedsSetup>("/auth/status"),
    retry: false,
    enabled: me.isError,
    refetchOnWindowFocus: false,
  });

  if (me.isPending) return <FullSplash label="Checking session" />;
  if (me.isError) {
    if (status.isPending) return <FullSplash label="Checking setup state" />;
    if (status.data?.needs_setup) return <Navigate to="/setup" replace />;
    return <Navigate to="/login" replace />;
  }
  return <AppShell />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/poison-lab" element={<PoisonLab />} />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="/eval" element={<EvaluationPage />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
