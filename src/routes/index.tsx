import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mattress Maestro | House of Abood Tradings" },
      {
        name: "description",
        content: "Secure ERP workspace for House of Abood Tradings and its mattress brands.",
      },
      { property: "og:title", content: "Mattress Maestro | House of Abood Tradings" },
      {
        property: "og:description",
        content: "Secure ERP workspace for House of Abood Tradings and its mattress brands.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { loading, session, profile } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" />;
  if (profile?.status !== "approved") return <Navigate to="/pending" />;
  return <Navigate to="/dashboard" />;
}
