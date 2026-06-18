import { createFileRoute, Navigate, Outlet, useLocation, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar, MobileTopBar } from "@/components/AppSidebar";
import { allowedRolesFor } from "@/lib/permissions";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { loading, session, profile, hasAnyRole, roles } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!session) {
    const here = location.pathname + (location.searchStr || "");
    return <Navigate to="/login" search={{ redirect: here }} replace />;
  }
  if (profile?.status !== "approved") return <Navigate to="/pending" />;

  const allowed = allowedRolesFor(location.pathname);
  const denied = allowed !== null && !hasAnyRole(allowed);

  return (
    <div className="relative flex h-dvh overflow-hidden">
      {/* Ambient 3D atmosphere */}
      <div aria-hidden className="ambient-blob h-[520px] w-[520px] -top-40 -left-40" style={{ background: "oklch(0.55 0.18 280 / 0.55)" }} />
      <div aria-hidden className="ambient-blob h-[420px] w-[420px] top-1/3 -right-32" style={{ background: "oklch(0.70 0.14 85 / 0.35)" }} />
      <div aria-hidden className="ambient-blob h-[360px] w-[360px] bottom-[-120px] left-1/3" style={{ background: "oklch(0.50 0.16 250 / 0.45)" }} />

      <AppSidebar />
      <div className="relative flex flex-1 flex-col min-w-0">
        <MobileTopBar />
        <main className="relative flex-1 overflow-y-auto overflow-x-auto">
          {denied ? <AccessDenied allowed={allowed!} have={roles} /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}

function AccessDenied({ allowed, have }: { allowed: string[]; have: string[] }) {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="glass max-w-md w-full p-8 text-center space-y-4 rounded-2xl">
        <div className="mx-auto h-14 w-14 rounded-2xl btn-gold flex items-center justify-center">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Access denied</h1>
        <p className="text-sm text-muted-foreground">
          This screen is restricted to: <span className="font-medium text-foreground">{allowed.join(", ")}</span>.
          Your role{have.length > 1 ? "s are" : " is"}: <span className="font-medium text-foreground">{have.join(", ") || "none"}</span>.
        </p>
        <Button asChild className="btn-3d">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
