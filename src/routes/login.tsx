import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import zizz from "@/assets/brands/zizz.png.asset.json";
import softnights from "@/assets/brands/softnights.jpeg.asset.json";
import mrcoir from "@/assets/brands/mrcoir.jpeg.asset.json";
import byz from "@/assets/brands/byzbedding.jpeg.asset.json";
import ortho from "@/assets/brands/orthomedic.jpeg.asset.json";
import drspine from "@/assets/brands/drspine.jpeg.asset.json";

export const Route = createFileRoute("/login")({
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
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (session) {
    navigate({ to: "/" });
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back");
    navigate({ to: "/" });
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="ambient-blob h-[520px] w-[520px] -top-40 -left-40" style={{ background: "oklch(0.55 0.18 280 / 0.55)" }} />
      <div aria-hidden className="ambient-blob h-[420px] w-[420px] top-1/3 -right-32" style={{ background: "oklch(0.70 0.14 85 / 0.35)" }} />
      <div aria-hidden className="ambient-blob h-[360px] w-[360px] bottom-[-120px] left-1/3" style={{ background: "oklch(0.50 0.16 250 / 0.45)" }} />

      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-start gap-6 px-4 py-6 sm:justify-center sm:gap-10 sm:py-12 lg:flex-row lg:gap-16">
        {/* Brand showcase */}
        <section aria-labelledby="brand-heading" className="w-full max-w-xl space-y-5 sm:space-y-8">
          <div className="text-center lg:text-left">
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-muted-foreground">Est. Premium Sleep & Comfort</p>
            <h1 id="brand-heading" className="mt-2 sm:mt-3 text-2xl sm:text-3xl lg:text-4xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              House of <span className="gold-text">Abood Tradings</span>
            </h1>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">Premium Sleep & Comfort Solutions</p>
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
            <ul className="flex flex-wrap justify-center gap-2 sm:gap-3" role="list">
              {subBrands.map((b) => (
                <li key={b.name} className="w-[calc(33.333%-0.5rem)] sm:w-[calc(33.333%-0.75rem)]">
                  <div
                    className="glass-sm rounded-lg sm:rounded-xl overflow-hidden flex flex-col"
                    title={b.name}
                  >
                    <div className="bg-white/95 aspect-square flex items-center justify-center">
                      <img src={b.src} alt={b.name} className="w-full h-full object-contain p-1 sm:p-1.5" loading="lazy" />
                    </div>
                    <div className="px-1.5 py-1.5 text-center">
                      <div className="text-[11px] sm:text-xs font-semibold leading-tight truncate">{b.name}</div>
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight truncate">{b.desc}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Login card */}
        <section aria-labelledby="login-heading" className="glass w-full max-w-md rounded-2xl p-6 sm:p-8">
          <div className="text-center space-y-2 mb-5 sm:mb-6">
            <div className="mx-auto h-12 w-12 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl btn-gold flex items-center justify-center overflow-hidden bg-white">
              <img src={zizz.url} alt="Zizz" className="w-full h-full object-contain" />
            </div>
            <h2 id="login-heading" className="text-xl sm:text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Abood Tradings ERP</h2>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-md">
                  Forgot password?
                </Link>
              </div>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full btn-gold" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              No account?{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-md">
                Request access
              </Link>
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
