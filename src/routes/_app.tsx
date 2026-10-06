import { createFileRoute, Navigate, Outlet, useLocation, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar, MobileTopBar } from "@/components/AppSidebar";
import { allowedRolesFor } from "@/lib/permissions";
import { Bell, Search, ShieldAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanyProvider } from "@/lib/company-context";
import { CompanySwitcher } from "@/components/CompanySwitcher";

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
    return <Navigate to="/login" search={{ redirect: location.href }} replace />;
  }
  if (profile?.status !== "approved") return <Navigate to="/pending" />;

  const allowed = allowedRolesFor(location.pathname);
  const denied = allowed !== null && !hasAnyRole(allowed);

  return (
    <CompanyProvider>
      <div className="app-shell relative flex h-dvh overflow-hidden">
        <div className="app-shell-sidebar"><AppSidebar /></div>
        <div className="app-shell-content relative flex min-w-0 flex-1 flex-col">
          <div className="app-shell-mobile-bar"><MobileTopBar /></div>
          <header className="app-shell-topbar corporate-topbar hidden md:flex">
            <div className="corporate-wordmark">
              <span>House of</span>
              <strong>Abood Tradings</strong>
            </div>
            <div className="flex min-w-0 flex-1 justify-center px-4">
              <CompanySwitcher />
            </div>
            <nav aria-label="Workspace tools">
              {hasAnyRole(["admin", "accountant", "sales", "production"]) && <Link to="/ai/search" aria-label="Search ERP"><Search /></Link>}
              {hasAnyRole(["admin"]) && <Link to="/communications/inbox" aria-label="Notifications"><Bell /></Link>}
              <div className="profile-chip"><UserRound /><span>{profile?.full_name ?? "Account"}</span></div>
            </nav>
          </header>
          <main className="app-shell-main relative flex-1 overflow-y-auto overflow-x-auto">
            {denied ? <AccessDenied allowed={allowed!} have={roles} /> : <Outlet />}
          </main>
        </div>
      </div>
    </CompanyProvider>
  );
}

function AccessDenied({ allowed, have }: { allowed: string[]; have: string[] }) {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="glass max-w-md w-full p-8 text-center space-y-4 rounded-xl">
        <div className="mx-auto h-14 w-14 rounded-xl btn-gold flex items-center justify-center">
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
