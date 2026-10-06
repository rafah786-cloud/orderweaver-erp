import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/pending")({
  component: PendingPage,
});

function PendingPage() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  if (!session) return <Navigate to="/login" />;
  if (profile?.status === "approved") return <Navigate to="/dashboard" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-warning text-warning-foreground">
            <Clock className="h-6 w-6" />
          </div>
          <CardTitle>Awaiting Approval</CardTitle>
          <CardDescription>
            {profile?.status === "rejected"
              ? "Your account request was rejected. Please contact your administrator."
              : "Your account is pending admin approval. You'll be able to sign in once an admin assigns you a role."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
