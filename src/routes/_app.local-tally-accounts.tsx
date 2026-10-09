import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { LocalTallyAccounts } from "@/components/LocalTallyAccounts";

export const Route = createFileRoute("/_app/local-tally-accounts")({
  head: () => ({ meta: [
    { title: "Tally Data Import | Mattress Maestro" },
    { name: "description", content: "Review company-qualified local Tally exports and validate accounting source data safely." },
    { property: "og:title", content: "Tally Data Import | Mattress Maestro" },
    { property: "og:description", content: "Secure local Tally connection and read-only XML accounting validation." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: LocalTallyPage,
});
function LocalTallyPage() {
  const { hasRole, profile } = useAuth();
  if (!hasRole("admin") || profile?.status !== "approved") return <PageBody><p>Administrator access required.</p></PageBody>;
  return <><PageHeader title="Tally Data Import" description="Local Tally Accounts" /><PageBody><LocalTallyAccounts /></PageBody></>;
}