import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye } from "lucide-react";

export const Route = createFileRoute("/_app/vendor/purchase-orders")({ component: VendorPOList });

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN");

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700",
  accepted: "bg-emerald-500/15 text-emerald-700",
  rejected: "bg-rose-500/15 text-rose-700",
  cancelled: "bg-muted text-muted-foreground",
};

function VendorPOList() {
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["vendor-po-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select(
          "id, bill_number, bill_date, total_amount, vendor_ack_status, expected_dispatch_date",
        )
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Purchase Orders</h1>
        <p className="text-sm text-muted-foreground">Orders placed to you by Zizz Mattress.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expected Dispatch</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : bills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No purchase orders yet.
                  </TableCell>
                </TableRow>
              ) : (
                bills.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.bill_number}</TableCell>
                    <TableCell>{fmt(b.bill_date)}</TableCell>
                    <TableCell className="text-right">{inr(Number(b.total_amount))}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONE[b.vendor_ack_status] ?? ""} variant="secondary">
                        {b.vendor_ack_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {b.expected_dispatch_date ? fmt(b.expected_dispatch_date) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="icon" variant="ghost">
                        <Link to="/vendor/purchase-orders/$id" params={{ id: b.id }}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
