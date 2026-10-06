import { createFileRoute, Navigate, Outlet, useLocation, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar, MobileTopBar } from "@/components/AppSidebar";
import { allowedRolesFor, defaultRouteForRoles } from "@/lib/permissions";
import { Bell, Search, ShieldAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanyProvider, useCompany } from "@/lib/company-context";
import { CompanySwitcher } from "@/components/CompanySwitcher";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { loading, session, profile, hasAnyRole, roles } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <div className="space-y-2 text-center">
          <div className="text-sm font-medium text-foreground">Loading workspace</div>
          <div className="text-xs">Securing your session…</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" search={{ redirect: location.href }} replace />;
  }

  // Do not treat a temporarily unloaded profile as a rejected user.
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <div className="space-y-2 text-center">
          <div className="text-sm font-medium text-foreground">Preparing your workspace</div>
          <div className="text-xs">Loading account permissions…</div>
        </div>
      </div>
    );
  }

  if (profile.status !== "approved") return <Navigate to="/pending" />;

  const allowed = allowedRolesFor(location.pathname);
  const denied = allowed !== null && !hasAnyRole(allowed);

  return (
    <CompanyProvider>
      <AppFrame denied={denied} roles={roles} />
    </CompanyProvider>
  );
}

function AppFrame({
  denied,
  roles,
}: {
  denied: boolean;
  roles: import("@/lib/permissions").AppRole[];
}) {
  const { profile, hasAnyRole } = useAuth();
  const { activeCompany } = useCompany();

  const managementBook = activeCompany?.code.endsWith("_MGMT") ?? false;

  return (
    <div className="app-shell relative flex h-dvh overflow-hidden">
      <div className="app-shell-sidebar">
        <AppSidebar />
      </div>
      <div className="app-shell-content relative flex min-w-0 flex-1 flex-col">
        <div className="app-shell-mobile-bar">
          <MobileTopBar />
        </div>
        <header className="app-shell-topbar corporate-topbar hidden md:flex">
          <div className="corporate-wordmark">
            <span>House of</span>
            <strong>Abood Tradings</strong>
          </div>
          <div className="flex min-w-0 flex-1 justify-center px-4">
            <CompanySwitcher />
          </div>
          <nav aria-label="Workspace tools">
            {hasAnyRole(["admin", "accountant", "sales", "production"]) && (
              <Link to="/ai/search" aria-label="Search ERP" title="Search ERP">
                <Search aria-hidden="true" />
              </Link>
            )}
            {hasAnyRole(["admin"]) && (
              <Link to="/communications/inbox" aria-label="Notifications" title="Notifications">
                <Bell aria-hidden="true" />
              </Link>
            )}
            <div className="profile-chip" title={profile?.email ?? undefined}>
              <UserRound aria-hidden="true" />
              <span>{profile?.full_name ?? "Account"}</span>
            </div>
          </nav>
        </header>

        {managementBook && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950"
          >
            <span className="font-medium">Internal management book</span>
            <span>
              For management analysis only. Statutory GST, tax and compliance records belong in the
              official company books.
            </span>
          </div>
        )}

        <main className="app-shell-main relative flex-1 overflow-y-auto overflow-x-auto">
          {denied ? <AccessDenied /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}

function AccessDenied() {
  const { roles } = useAuth();
  const destination = defaultRouteForRoles(roles);

  return (
    <div className="flex min-h-full items-center justify-center p-6 sm:p-8">
      <div className="glass w-full max-w-md space-y-4 rounded-xl p-6 text-center sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl btn-gold">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Access restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You do not have permission to open this area. Please use the workspace available to your
            account.
          </p>
        </div>
        <Button asChild className="btn-3d w-full sm:w-auto">
          <Link to={destination}>Open my workspace</Link>
        </Button>
      </div>
    </div>
  );
}
