import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { safeLocalRedirect } from "@/lib/safe-local-redirect";
import { getDeviceId, getDeviceName, setKeepSignedInPref } from "@/lib/device";
import zizz from "@/assets/brands/zizz.png.asset.json";
import softnights from "@/assets/brands/softnights.jpeg.asset.json";
import mrcoir from "@/assets/brands/mrcoir.jpeg.asset.json";
import byz from "@/assets/brands/byzbedding.jpeg.asset.json";
import ortho from "@/assets/brands/orthomedic.jpeg.asset.json";
import drspine from "@/assets/brands/drspine.jpeg.asset.json";

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
      { name: "description", content: "Sign in securely to the House of Abood Tradings ERP." },
      { property: "og:title", content: "Sign in | Mattress Maestro ERP" },
      {
        property: "og:description",
        content: "Sign in securely to the House of Abood Tradings ERP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),

  component: LoginPage,
});

const subBrands = [
  { name: "OrthoMedic", desc: "Orthopedic", src: ortho.url },
  { name: "Dr. Spine", desc: "Spine Care", src: drspine.url },
  { name: "Mr. Coir", desc: "Coir Range", src: mrcoir.url },
  { name: "Soft Nights", desc: "Comfort", src: softnights.url },
  { name: "BYZ Bedding", desc: "Bedding", src: byz.url },
];

function LoginPage() {
  const navigate = useNavigate();
  const { session, roles, profile } = useAuth();
  const { redirect, mode } = useSearch({ from: "/login" });
  const modeLabel = mode === "customer" ? "Customer Login" : mode === "supplier" ? "Supplier Login" : mode === "admin" ? "Admin / Management Login" : "Staff Login";
  const requiredRole = mode === "customer" ? "customer" : mode === "supplier" ? "vendor" : mode === "admin" ? "admin" : null;
  const target = redirect ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: target, replace: true });
  }, [session, target, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    if (mode && profile?.status === "approved" && requiredRole && !roles.includes(requiredRole as any)) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error(`This account is not enabled for ${modeLabel.toLowerCase()}.`);
      return;
    }

    // Persist the preference; useAuth reads it to decide whether to run the
    // 2-minute inactivity timeout on non-trusted devices.
    setKeepSignedInPref(keepSignedIn);
    // If the user opted in, mark this browser as a trusted device for their
    // account. Trust is per-user, per-device.
    if (keepSignedIn && data.user) {
      const { error: tdErr } = await supabase.from("trusted_devices").upsert(
        {
          user_id: data.user.id,
          device_id: getDeviceId(),
          device_name: getDeviceName(),
          user_agent: navigator.userAgent,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_id" },
      );
      if (tdErr) console.warn("[trusted_devices] upsert failed", tdErr);
    }
    setLoading(false);
    toast.success("Welcome back");
    navigate({ to: target, replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="ambient-blob h-[520px] w-[520px] -top-40 -left-40"
        style={{ background: "oklch(0.55 0.18 280 / 0.55)" }}
      />
      <div
        aria-hidden
        className="ambient-blob h-[420px] w-[420px] top-1/3 -right-32"
        style={{ background: "oklch(0.70 0.14 85 / 0.35)" }}
      />
      <div
        aria-hidden
        className="ambient-blob h-[360px] w-[360px] bottom-[-120px] left-1/3"
        style={{ background: "oklch(0.50 0.16 250 / 0.45)" }}
      />

      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-start gap-6 px-4 py-6 sm:justify-center sm:gap-10 sm:py-12 lg:flex-row lg:gap-16">
        {/* Brand showcase */}
        <section aria-labelledby="brand-heading" className="w-full max-w-xl space-y-5 sm:space-y-8">
          <div className="text-center lg:text-left">
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Est. Premium Sleep & Comfort
            </p>
            <h1
              id="brand-heading"
              className="mt-2 sm:mt-3 text-2xl sm:text-3xl lg:text-4xl font-semibold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              House of <span className="gold-text">Abood Tradings</span>
            </h1>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">
              Premium Sleep & Comfort Solutions
            </p>
          </div>

          {/* Zizz hero */}
          <div className="glass rounded-2xl sm:rounded-3xl p-3 sm:p-4 gold-ring">
            <div className="overflow-hidden rounded-xl sm:rounded-2xl border border-border bg-white">
              <img
                src={zizz.url}
                alt="Zizz — premium flagship brand"
                className="w-full aspect-[16/6] object-contain p-2 sm:p-3"
              />
            </div>
          </div>

          {/* Sub-brand grid */}
          <div>
            <p className="mb-2 sm:mb-3 text-[10px] sm:text-xs uppercase tracking-[0.25em] text-muted-foreground text-center lg:text-left">
              Our Specialized Brands
            </p>
            <ul className="flex flex-wrap justify-center gap-4 sm:gap-6" role="list">
              {subBrands.map((b) => (
                <li key={b.name} className="w-[calc(33.333%-0.667rem)] sm:w-[calc(33.333%-1rem)]">
                  <div
                    className="glass-sm rounded-lg sm:rounded-xl overflow-hidden flex flex-col"
                    title={b.name}
                  >
                    <div className="bg-white/95 aspect-square flex items-center justify-center">
                      <img
                        src={b.src}
                        alt={b.name}
                        className="w-full h-full object-contain p-1 sm:p-1.5"
                        loading="lazy"
                      />
                    </div>
                    <div className="px-1.5 py-1.5 text-center">
                      <div className="text-[11px] sm:text-xs font-semibold leading-tight truncate">
                        {b.name}
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight truncate">
                        {b.desc}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Login card */}
        <section
          aria-labelledby="login-heading"
          className="glass w-full max-w-md rounded-2xl p-6 sm:p-8"
        >
          <div className="text-center space-y-2 mb-5 sm:mb-6">
            <div className="mx-auto h-12 w-12 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl btn-gold flex items-center justify-center overflow-hidden bg-white">
              <img src={zizz.url} alt="Zizz" className="w-full h-full object-contain" />
            </div>
            <h2
              id="login-heading"
              className="text-xl sm:text-2xl font-semibold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {modeLabel}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "customer"
                ? "Access your customer account"
                : mode === "supplier"
                  ? "Access your supplier account"
                  : mode === "admin"
                    ? "Access the management workspace"
                    : "Access the staff workspace"}
            </p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-md"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="keep-signed-in"
                checked={keepSignedIn}
                onCheckedChange={(v) => setKeepSignedIn(v === true)}
                className="mt-0.5"
              />
              <div className="grid gap-0.5 leading-tight">
                <Label htmlFor="keep-signed-in" className="cursor-pointer text-sm font-medium">
                  Keep me signed in
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Marks this device as trusted. Untrusted devices are signed out after 2 minutes of
                  inactivity.
                </p>
              </div>
            </div>
            <Button type="submit" className="w-full btn-gold" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              No account?{" "}
              <Link
                to="/signup"
                search={redirect ? { redirect } : {}}
                className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-md"
              >
                Request access
              </Link>
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
