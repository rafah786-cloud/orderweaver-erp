import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, BookOpen, Clock, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_app/vendor/")({ component: VendorDashboard });

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function VendorDashboard() {
  const { data: bills = [] } = useQuery({
    queryKey: ["vendor-pos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("id, bill_number, bill_date, total_amount, vendor_ack_status")
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ledger = [] } = useQuery({
    queryKey: ["vendor-ledger-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_ledger_entries")
        .select("debit, credit");
      if (error) throw error;
      return data ?? [];
    },
  });

  const pending = bills.filter((b) => b.vendor_ack_status === "pending").length;
  const accepted = bills.filter((b) => b.vendor_ack_status === "accepted").length;
  const rejected = bills.filter((b) => b.vendor_ack_status === "rejected").length;
  const outstanding = ledger.reduce(
    (s, e: any) => s + Number(e.credit ?? 0) - Number(e.debit ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="text-sm text-muted-foreground">
          Manage your purchase orders and account here.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Clock}
          label="Pending POs"
          value={pending}
          tone="bg-amber-500/10 text-amber-600"
        />
        <Stat
          icon={CheckCircle2}
          label="Accepted POs"
          value={accepted}
          tone="bg-emerald-500/10 text-emerald-600"
        />
        <Stat
          icon={XCircle}
          label="Rejected POs"
          value={rejected}
          tone="bg-rose-500/10 text-rose-600"
        />
        <Stat
          icon={BookOpen}
          label="Outstanding"
          value={inr(outstanding)}
          tone="bg-primary/10 text-primary"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Purchase Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Review, accept or reject the orders placed to you.
            </p>
            <Button asChild size="sm">
              <Link to="/vendor/purchase-orders">Open</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Ledger Statement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              View payments and outstanding balances.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/vendor/ledger">Open</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-md flex items-center justify-center ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
