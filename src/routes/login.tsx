import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { safeLocalRedirect } from "@/lib/safe-local-redirect";
import { defaultRouteForRoles, type AppRole } from "@/lib/permissions";
import { getDeviceId, getDeviceName, setKeepSignedInPref } from "@/lib/device";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import zizz from "@/assets/brands/zizz.png.asset.json";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string; mode?: "customer" | "staff" | "supplier" | "admin" } => {
    const mode = ["customer", "staff", "supplier", "admin"].includes(String(s.mode))
      ? (String(s.mode) as "customer" | "staff" | "supplier" | "admin")
      : undefined;
    return {
      redirect: safeLocalRedirect(s.redirect) ? safeLocalRedirect(s.redirect) : undefined,
      mode,
    };
  },
  head: () => ({
    meta: [
      { title: "Sign in | Mattress Maestro ERP" },
      { name: "description", content: "Secure access to the House of Abood Tradings business workspace." },
      { property: "og:title", content: "Sign in | Mattress Maestro ERP" },
      { property: "og:description", content: "Secure access to the House of Abood Tradings business workspace." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LoginPage,
});

const STAFF_ROLES = ["admin", "accountant", "sales", "production", "hr", "employee"] as const;

function modeAllows(
  mode: "customer" | "staff" | "supplier" | "admin" | undefined,
  roles: string[],
) {
  if (!mode) return true;
  if (mode === "customer") return roles.includes("customer");
  if (mode === "supplier") return roles.includes("vendor");
  if (mode === "admin") return roles.includes("admin");
  return roles.some((role) => STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number]));
}

function LoginPage() {
  const navigate = useNavigate();
  const { redirect, mode } = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);

  const finishAuthenticatedSession = async (userId: string, userEmail?: string | null) => {
    setCheckingSession(true);
    try {
      const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] = await Promise.all([
        supabase.from("profiles").select("full_name, email, status").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);

      if (profileError) throw profileError;
      if (roleError) throw roleError;

      const roles = (roleRows ?? []).map((row) => row.role as AppRole);
      if (!profile || profile.status !== "approved") {
        navigate({ to: "/pending", replace: true });
        return;
      }

      if (!modeAllows(mode, roles)) {
        await supabase.auth.signOut();
        toast.error("This account is not enabled for " + (mode ?? "this login type") + ".");
        return;
      }

      const target = redirect ?? defaultRouteForRoles(roles);
      setKeepSignedInPref(keepSignedIn);
      if (keepSignedIn) {
        const { error } = await supabase.from("trusted_devices").upsert(
          {
            user_id: userId,
            device_id: getDeviceId(),
            device_name: getDeviceName(),
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "user_id,device_id" },
        );
        if (error) console.warn("[trusted_devices] upsert failed", error);
      }
      toast.success("Welcome back" + (userEmail ? ", " + userEmail : ""));
      navigate({ to: target, replace: true });
    } catch (error) {
      console.error("Login session check failed", error);
      toast.error("We could not finish signing you in. Please try again.");
    } finally {
      setCheckingSession(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      void finishAuthenticatedSession(data.session.user.id, data.session.user.email);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setLoading(false);
      toast.error(error?.message ?? "Sign in failed");
      return;
    }

    // Check mode and approval against fresh server state after authentication.
    setLoading(false);
    await finishAuthenticatedSession(data.user.id, data.user.email);
  };

  const heading =
    mode === "customer"
      ? "Customer Login"
      : mode === "supplier"
        ? "Supplier Login"
        : mode === "admin"
          ? "Admin / Management Login"
          : mode === "staff"
            ? "Staff Login"
            : "Sign in";

  return (
    <div className="min-h-screen bg-[#f5f7fa] text-[#172033]">
      <header className="border-b border-[#dce3ea] bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3" aria-label="Back to Zizz corporate website">
            <div className="flex h-9 w-14 items-center justify-center rounded-md border border-[#dce3ea] bg-white px-1.5">
              <img src={zizz.url} alt="Zizz" className="max-h-7 w-full object-contain" />
            </div>
            <div className="hidden min-[420px]:block leading-tight">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#8490a0]">House of</div>
              <div className="text-sm font-bold text-[#20374e]">Abood Tradings</div>
            </div>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-[#526273] hover:bg-[#f2f5f8]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to website
          </Link>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_420px] lg:py-14">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">
              Secure workspace
            </div>
            <h1 className="text-5xl font-semibold leading-[1.03] tracking-[-0.04em] text-[#17324d]">
              The business behind better sleep.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[#657486]">
              Mattress Maestro brings sales, production, inventory, finance, people and business intelligence into one controlled workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-xs text-[#5f6f80]">
              <span className="rounded-full border border-[#d7e0e7] bg-white px-3 py-2">Multi-company controls</span>
              <span className="rounded-full border border-[#d7e0e7] bg-white px-3 py-2">Accounting & GST</span>
              <span className="rounded-full border border-[#d7e0e7] bg-white px-3 py-2">AI business intelligence</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="login-heading" className="rounded-xl border border-[#dce3ea] bg-white p-6 shadow-[0_18px_50px_-28px_rgba(16,34,53,.35)] sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[#dce3ea] bg-[#f7f9fb]">
              <ShieldCheck className="h-5 w-5 text-[#17324d]" aria-hidden="true" />
            </div>
            <h2 id="login-heading" className="mt-4 text-2xl font-semibold tracking-tight text-[#17324d]">
              {heading}
            </h2>
            <p className="mt-2 text-sm text-[#6b7788]">
              {mode === "customer"
                ? "Access orders, invoices and customer information."
                : mode === "supplier"
                  ? "Access purchase orders, documents and supplier information."
                  : mode === "admin"
                    ? "Access administration and management controls."
                    : "Sign in to your approved Mattress Maestro account."}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-[#742f3f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Forgot password?
                </Link>
              </div>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="keep-signed-in"
                checked={keepSignedIn}
                onCheckedChange={(value) => setKeepSignedIn(value === true)}
                className="mt-0.5"
              />
              <div className="leading-tight">
                <Label htmlFor="keep-signed-in" className="cursor-pointer text-sm font-medium">
                  Keep me signed in
                </Label>
                <p className="mt-1 text-[11px] leading-5 text-[#758394]">
                  This trusts the current device. Untrusted devices sign out after the configured inactivity period.
                </p>
              </div>
            </div>

            <Button type="submit" className="w-full btn-gold" disabled={loading || checkingSession}>
              {loading || checkingSession ? "Signing in…" : "Sign in"}
            </Button>

            <div className="border-t border-[#e6ebef] pt-4 text-center text-sm text-[#6b7788]">
              No account?{" "}
              <Link to="/signup" className="font-semibold text-[#742f3f] hover:underline">
                Request access
              </Link>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

