import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_app/vendor/purchase-orders/$id")({ component: VendorPODetail });

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN");

function VendorPODetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dispatchDate, setDispatchDate] = useState("");
  const [note, setNote] = useState("");

  const { data: bill } = useQuery({
    queryKey: ["vendor-po", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("id, bill_number, bill_date, total_amount, subtotal, tax_amount, notes, vendor_ack_status, vendor_ack_at, vendor_ack_note, expected_dispatch_date")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["vendor-po-items", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bill_items")
        .select("id, quantity, unit_price, amount, raw_material_id, raw_materials(name, unit)")
        .eq("purchase_bill_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (bill?.expected_dispatch_date) setDispatchDate(bill.expected_dispatch_date);
    if (bill?.vendor_ack_note) setNote(bill.vendor_ack_note);
  }, [bill]);

  const ack = useMutation({
    mutationFn: async (status: "accepted" | "rejected") => {
      const { error } = await supabase.from("purchase_bills").update({
        vendor_ack_status: status,
        vendor_ack_at: new Date().toISOString(),
        vendor_ack_note: note || null,
        expected_dispatch_date: status === "accepted" && dispatchDate ? dispatchDate : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, status) => {
      toast.success(`Purchase order ${status}`);
      qc.invalidateQueries({ queryKey: ["vendor-po", id] });
      qc.invalidateQueries({ queryKey: ["vendor-po-list"] });
      qc.invalidateQueries({ queryKey: ["vendor-pos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadPDF = () => {
    window.open(`/print/purchase/${id}`, "_blank");
  };

  if (!bill) {
    return <div className="text-muted-foreground text-sm">Loading…</div>;
  }

  const editable = bill.vendor_ack_status === "pending";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/vendor/purchase-orders" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button size="sm" variant="outline" onClick={downloadPDF}>
          <Download className="h-4 w-4 mr-1" /> Download PDF
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>PO #{bill.bill_number}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Date: {fmt(bill.bill_date)}</p>
            </div>
            <Badge variant="secondary">{bill.vendor_ack_status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((it: any) => (
                <TableRow key={it.id}>
                  <TableCell>{it.raw_materials?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{Number(it.quantity)} {it.raw_materials?.unit ?? ""}</TableCell>
                  <TableCell className="text-right">{inr(Number(it.unit_price))}</TableCell>
                  <TableCell className="text-right">{inr(Number(it.quantity) * Number(it.unit_price))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end mt-4 text-sm">
            <div className="space-y-1 text-right">
              <div className="text-muted-foreground">Subtotal: {inr(Number(bill.subtotal ?? 0))}</div>
              <div className="text-muted-foreground">Tax: {inr(Number(bill.tax_amount ?? 0))}</div>
              <div className="font-semibold text-base">Total: {inr(Number(bill.total_amount))}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Acknowledgement</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!editable ? (
            <div className="text-sm">
              <Badge variant="secondary" className="mr-2">{bill.vendor_ack_status}</Badge>
              on {bill.vendor_ack_at ? new Date(bill.vendor_ack_at).toLocaleString("en-IN") : "—"}
              {bill.vendor_ack_note && <p className="text-muted-foreground mt-2">Note: {bill.vendor_ack_note}</p>}
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Expected dispatch date</Label>
                  <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Note (optional)</Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any comments for the buyer…" />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => ack.mutate("accepted")} disabled={ack.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Accept
                </Button>
                <Button variant="destructive" onClick={() => ack.mutate("rejected")} disabled={ack.isPending}>
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
