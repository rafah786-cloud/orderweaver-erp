import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { lookupEmailByNamePhone } from "@/lib/account-lookup.functions";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<string | null>(null);
  const findEmail = useServerFn(lookupEmailByNamePhone);

  const onReset = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("If an account exists, a reset link has been sent.");
  };

  const onLookup = async (e: FormEvent) => {
    e.preventDefault();
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const r = await findEmail({ data: { fullName, phone } });
      if (!r.found) {
        setLookupResult("No matching account found. Please contact your administrator.");
      } else {
        setLookupResult(`Your registered email is: ${r.maskedEmail}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <KeyRound className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Account recovery</CardTitle>
          <CardDescription>Reset your password or find your registered email</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="reset" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="reset">Forgot password</TabsTrigger>
              <TabsTrigger value="email">Forgot email</TabsTrigger>
            </TabsList>

            <TabsContent value="reset" className="pt-4">
              <form onSubmit={onReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="email" className="pt-4">
              <form onSubmit={onLookup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Registered phone</Label>
                  <Input id="phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={lookupLoading}>
                  {lookupLoading ? "Searching…" : "Find my email"}
                </Button>
                {lookupResult && (
                  <p className="text-sm text-center text-muted-foreground">{lookupResult}</p>
                )}
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
