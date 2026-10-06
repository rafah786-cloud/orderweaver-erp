import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
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
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Request Access</CardTitle>
          <CardDescription>An admin will approve your account</CardDescription>
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
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              New accounts are automatically registered under <span className="font-medium text-foreground">ABOOD TRADINGS</span>. Company access is assigned by an administrator after approval.
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
                  This device will be marked as trusted after your first sign-in. Untrusted devices
                  are signed out after 2 minutes of inactivity.
                </p>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating…" : "Request access"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                to="/login"
                search={redirect ? { redirect } : {}}
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
