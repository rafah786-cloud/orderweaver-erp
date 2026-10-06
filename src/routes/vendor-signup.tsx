import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lookupVendorInvite, claimVendorInvite } from "@/lib/vendor-invite.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/vendor-signup")({
  validateSearch: (s) => searchSchema.parse(s),
  component: VendorSignupPage,
});

function VendorSignupPage() {
  const { token } = useSearch({ from: "/vendor-signup" });
  const navigate = useNavigate();
  const lookup = useServerFn(lookupVendorInvite);
  const claim = useServerFn(claimVendorInvite);

  const [invite, setInvite] = useState<{ email: string; supplier_name: string | null } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing invite token");
      setLoading(false);
      return;
    }
    lookup({ data: { token } })
      .then((r) => setInvite({ email: r.email, supplier_name: r.supplier_name }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, lookup]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !invite) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    const { data, error: sErr } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, phone },
      },
    });
    if (sErr || !data.user) {
      setSubmitting(false);
      toast.error(sErr?.message ?? "Signup failed");
      return;
    }
    // If email confirmation is required, no session is set; sign in directly
    if (!data.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      });
      if (signInErr) {
        setSubmitting(false);
        toast.error("Account created — please log in to continue.");
        navigate({ to: "/login" });
        return;
      }
    }
    try {
      await claim({ data: { token } });
      toast.success("Vendor portal ready");
      navigate({ to: "/vendor" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link invite");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Validating invite…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Vendor Portal Signup</CardTitle>
          <CardDescription>
            {invite?.supplier_name
              ? `Setting up access for ${invite.supplier_name}`
              : "Set up your vendor account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-sm text-destructive text-center py-6">
              {error}
              <div className="mt-4">
                <Link to="/login" className="text-primary underline">
                  Back to login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={invite?.email ?? ""} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Contact name</Label>
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
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Creating account…" : "Create vendor account"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
