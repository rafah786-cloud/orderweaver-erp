import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { loading, session, profile } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!session) return <Navigate to="/login" />;
  if (profile?.status !== "approved") return <Navigate to="/pending" />;

  return (
    <div className="relative flex h-screen overflow-hidden">
      {/* Ambient 3D atmosphere */}
      <div aria-hidden className="ambient-blob h-[520px] w-[520px] -top-40 -left-40" style={{ background: "oklch(0.55 0.18 280 / 0.55)" }} />
      <div aria-hidden className="ambient-blob h-[420px] w-[420px] top-1/3 -right-32" style={{ background: "oklch(0.70 0.14 85 / 0.35)" }} />
      <div aria-hidden className="ambient-blob h-[360px] w-[360px] bottom-[-120px] left-1/3" style={{ background: "oklch(0.50 0.16 250 / 0.45)" }} />

      <AppSidebar />
      <main className="relative flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
