import { BrowserRouter, Navigate, Route, Routes, useInRouterContext } from "react-router-dom";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/queryClient";

import { apiGet } from "@/lib/api";
import type { NeedsSetup, User } from "@/lib/types";
import { FullSplash } from "@/components/FullSplash";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import ReviewQueue from "@/pages/ReviewQueue";
import HealthOverviewPage from "@/pages/HealthOverviewPage";
import KnowledgeBasePage from "@/pages/KnowledgeBasePage";
import SelfHealingPage from "@/pages/SelfHealingPage";
import KnowledgeGraphPage from "@/pages/KnowledgeGraphPage";
import RedTeamPage from "@/pages/RedTeamPage";
import ReportsPage from "@/pages/ReportsPage";
import PoisonLab from "@/pages/PoisonLab";
import LedgerPage from "@/pages/LedgerPage";
import EvaluationPage from "@/pages/EvaluationPage";
import AuditLog from "@/pages/AuditLog";
import AdminPage from "@/pages/AdminPage";

// Auth gate: verifies the session; routes to /setup on first run
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

function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        <Route element={<RequireAuth />}>
          {/* Original Past Version Tabs (100% Preserved) */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/poison-lab" element={<PoisonLab />} />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="/eval" element={<EvaluationPage />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/admin" element={<AdminPage />} />

          {/* New Shortlisted Feature Tabs Below */}
          <Route path="/health-overview" element={<HealthOverviewPage />} />
          <Route path="/documents" element={<KnowledgeBasePage />} />
          <Route path="/self-healing" element={<SelfHealingPage />} />
          <Route path="/graph" element={<KnowledgeGraphPage />} />
          <Route path="/red-team" element={<RedTeamPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default function App() {
  const inRouter = useInRouterContext();
  return (
    <QueryClientProvider client={queryClient}>
      {inRouter ? (
        <AppRoutes />
      ) : (
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      )}
    </QueryClientProvider>
  );
}
