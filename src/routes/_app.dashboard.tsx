import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inr, daysBetween } from "@/lib/format";
import { IndianRupee, AlertTriangle, Factory, Users } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { profile, roles } = useAuth();

  const { data: outstanding } = useQuery({
    queryKey: ["dash-outstanding"],
    queryFn: async () => {
      const { data, error } = await supabase.from("party_outstanding").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: production } = useQuery({
    queryKey: ["dash-production"],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_orders").select("status");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: employees } = useQuery({
    queryKey: ["dash-employees"],
    queryFn: async () => {
      const { count, error } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const totalOutstanding = (outstanding ?? []).reduce((s, p) => s + Number(p.outstanding ?? 0), 0);
  const overdueCount = (outstanding ?? []).filter(
    (p) => Number(p.outstanding ?? 0) >= 50000 && p.oldest_unpaid_date && daysBetween(p.oldest_unpaid_date) > 90
  ).length;

  const pipeline = (production ?? []).reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  const topCustomers = (outstanding ?? [])
    .slice()
    .sort((a, b) => Number(b.outstanding ?? 0) - Number(a.outstanding ?? 0))
    .slice(0, 5);

  return (
    <>
      <PageHeader title={`Welcome, ${profile?.full_name?.split(" ")[0] ?? ""}`} description={`Role: ${roles.join(", ") || "—"}`} />
      <PageBody>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <KpiCard label="Total Outstanding" value={inr(totalOutstanding)} icon={IndianRupee} />
          <KpiCard label="Overdue >90d" value={String(overdueCount)} icon={AlertTriangle} accent="warning" />
          <KpiCard label="In Production" value={String((pipeline.in_production ?? 0) + (pipeline.received ?? 0) + (pipeline.qc ?? 0))} icon={Factory} />
          <KpiCard label="Active Employees" value={String(employees ?? 0)} icon={Users} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Production Pipeline</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {["received", "in_production", "qc", "ready", "dispatched"].map((s) => (
                  <div key={s} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{s.replace("_", " ")}</span>
                    <span className="font-medium">{pipeline[s] ?? 0}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Top Customers by Outstanding</CardTitle></CardHeader>
            <CardContent>
              {topCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <div className="space-y-2">
                  {topCustomers.map((c) => (
                    <div key={c.party_id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{c.name}</span>
                      <span className="font-medium">{inr(Number(c.outstanding ?? 0))}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; accent?: "warning" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className={`text-2xl font-semibold mt-1 ${accent === "warning" ? "text-warning" : "text-foreground"}`}>{value}</div>
          </div>
          <div className={`h-9 w-9 rounded-md flex items-center justify-center ${accent === "warning" ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
