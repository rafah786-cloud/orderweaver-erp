import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  head: () => ({
    meta: [
      { title: "Authorize agent access | Mattress Maestro ERP" },
      {
        name: "description",
        content: "Approve a secure agent connection to your Mattress Maestro ERP account.",
      },
      { property: "og:title", content: "Authorize agent access | Mattress Maestro ERP" },
      {
        property: "og:description",
        content: "Approve a secure agent connection to your Mattress Maestro ERP account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConsentPage,
});

type AuthorizationDetails = Awaited<
  ReturnType<typeof supabase.auth.oauth.getAuthorizationDetails>
>["data"];

function ConsentPage() {
  const { authorization_id } = Route.useSearch();
  const navigate = useNavigate();
  const [details, setDetails] = useState<AuthorizationDetails>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!authorization_id) {
        setError("Authorization request is missing or expired.");
        setLoading(false);
        return;
      }
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (!active) return;
        if (authError || !user) {
          const redirect = `/.lovable/oauth/consent?authorization_id=${encodeURIComponent(authorization_id)}`;
          navigate({ to: "/login", search: { redirect }, replace: true });
          return;
        }
        const { data, error: detailsError } =
          await supabase.auth.oauth.getAuthorizationDetails(authorization_id);
        if (!active) return;
        if (detailsError) throw detailsError;
        if (data && "redirect_url" in data) {
          window.location.assign(data.redirect_url);
          return;
        }
        setDetails(data);
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : "Could not load authorization request.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [authorization_id, navigate]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      const { data, error: decisionError } = approve
        ? await supabase.auth.oauth.approveAuthorization(authorization_id, {
            skipBrowserRedirect: true,
          })
        : await supabase.auth.oauth.denyAuthorization(authorization_id, {
            skipBrowserRedirect: true,
          });
      if (decisionError) throw decisionError;
      if (!data?.redirect_url)
        throw new Error("Authorization server did not return a destination.");
      window.location.assign(data.redirect_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto max-w-lg space-y-6">
        <p className="text-sm font-semibold text-primary">Mattress Maestro ERP</p>
        <h1 className="text-3xl font-semibold">
          Connect {details && "client" in details ? details.client.name : "an agent"}
        </h1>
        {loading && <p className="text-muted-foreground">Checking your connection request…</p>}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {details && "client" in details && (
          <>
            <p className="text-muted-foreground">
              This agent will act as your signed-in ERP account. It can read your account details
              and, if you have sales or accounting access, recent invoices. You can decline below.
            </p>
            <div className="flex gap-3">
              <Button disabled={busy} onClick={() => void decide(true)}>
                Approve access
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>
                Deny
              </Button>
            </div>
          </>
        )}
        {error && (
          <Button variant="outline" asChild>
            <Link to="/login">Return to sign in</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
