import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import zizz from "@/assets/brands/zizz.png.asset.json";
import { setKeepSignedInPref } from "@/lib/device";
import { safeLocalRedirect } from "@/lib/safe-local-redirect";

export const Route = createFileRoute("/signup")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } =>
    safeLocalRedirect(s.redirect) ? { redirect: safeLocalRedirect(s.redirect) } : {},
  head: () => ({
    meta: [
      { title: "Request access | Mattress Maestro ERP" },
      { name: "description", content: "Request an account for the House of Abood Tradings ERP." },
      { property: "og:title", content: "Request access | Mattress Maestro ERP" },
      {
        property: "og:description",
        content: "Request an account for the House of Abood Tradings ERP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${redirect ?? "/"}`,
        data: { full_name: fullName, phone },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Remember the preference on this browser. Once the admin approves the
    // account and the user signs in, the login flow will honor it and mark
    // this device as trusted.
    setKeepSignedInPref(keepSignedIn);
    toast.success("Account requested — pending admin approval");
    navigate({ to: "/pending" });
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] text-[#172033]">
      <header className="border-b border-[#dce3ea] bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-3"
            aria-label="Back to Zizz corporate website"
          >
            <div className="flex h-9 w-14 items-center justify-center rounded-md border border-[#dce3ea] bg-white px-1.5">
              <img src={zizz.url} alt="Zizz" className="max-h-7 w-full object-contain" />
            </div>
            <div className="hidden min-[420px]:block leading-tight">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#8490a0]">
                House of
              </div>
              <div className="text-sm font-bold text-[#20374e]">Abood Tradings</div>
            </div>
          </Link>
          <Link
            to="/login"
            search={redirect ? { redirect } : {}}
            className="rounded-md px-3 py-2 text-sm font-semibold text-[#526273] hover:bg-[#f2f5f8]"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_420px] lg:py-14">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">
              Request access
            </div>
            <h1 className="text-5xl font-semibold leading-[1.03] tracking-[-0.04em] text-[#17324d]">
              A controlled workspace for the business behind better sleep.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[#657486]">
              Mattress Maestro brings sales, production, inventory, finance, people and business
              intelligence into one governed workspace.
            </p>
            <div className="mt-8 rounded-lg border border-[#dce3ea] bg-white p-4 text-sm">
              <div className="font-semibold text-[#20374e]">ABOOD TRADINGS by default</div>
              <p className="mt-1 text-xs leading-5 text-[#738295]">
                New accounts begin with the default company. An administrator assigns additional
                company access and the appropriate role after approval.
              </p>
            </div>
          </div>
        </section>

        <Card className="w-full max-w-md border-[#dce3ea] shadow-[0_18px_50px_-28px_rgba(16,34,53,.35)] lg:justify-self-end">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[#dce3ea] bg-[#f7f9fb]">
              <ShieldCheck className="h-5 w-5 text-[#17324d]" />
            </div>
            <CardTitle className="text-2xl tracking-tight text-[#17324d]">Request Access</CardTitle>
            <CardDescription className="text-[#6b7788]">
              Submit your details for administrator approval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
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
              <div className="rounded-lg border border-[#dce3ea] bg-[#f7f9fb] px-3 py-3 text-xs leading-5 text-[#66778a]">
                New accounts are automatically registered under{" "}
                <span className="font-semibold text-[#20374e]">ABOOD TRADINGS</span>. Company access
                and the appropriate workspace role are assigned by an administrator after approval.
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
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
                    Keep me signed in on this device
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    This device will be marked as trusted after your first sign-in. Untrusted
                    devices are signed out after 2 minutes of inactivity.
                  </p>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating…" : "Request access"}
              </Button>
              <p className="border-t border-[#e6ebef] pt-4 text-center text-sm text-[#6b7788]">
                Already have an account?{" "}
                <Link
                  to="/login"
                  search={redirect ? { redirect } : {}}
                  className="font-semibold text-[#742f3f] hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
