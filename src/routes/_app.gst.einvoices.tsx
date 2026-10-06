import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { sb } from "@/lib/accounting";
import { formatDate, inr } from "@/lib/format";
import { QrCode, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/gst/einvoices")({
  component: EInvoicesPage,
});

type EInvoice = {
  id: string; invoice_id: string;
  irn: string | null; ack_no: string | null; ack_date: string | null;
  signed_qr: string | null; status: string; created_at: string;
};

function EInvoicesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const q = useQuery({
    queryKey: ["einvoices"],
    queryFn: async () => {
      const { data, error } = await sb.from("e_invoices").select("*,invoices(invoice_number,invoice_date,total_amount)").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as (EInvoice & { invoices: { invoice_number: string; invoice_date: string; total_amount: number } | null })[];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      // Lookup invoice by number
      const { data: inv, error: invErr } = await sb.from("invoices").select("id,invoice_number,total_amount").eq("invoice_number", invoiceNumber.trim()).maybeSingle();
      if (invErr) throw invErr;
      if (!inv) throw new Error(`Invoice ${invoiceNumber} not found`);
      // Generate a stub IRN (64-char hash-like). Real IRP integration goes here.
      const irn = stubIrn(inv.id);
      const ackNo = `ACK${Date.now().toString().slice(-12)}`;
      const qr = JSON.stringify({ irn, ackNo, value: inv.total_amount });
      const { error } = await sb.from("e_invoices").insert({
        invoice_id: inv.id, irn, ack_no: ackNo, ack_date: new Date().toISOString(),
        signed_qr: qr, status: "generated",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("IRN generated (stub — wire IRP for live)");
      qc.invalidateQueries({ queryKey: ["einvoices"] });
      setOpen(false); setInvoiceNumber("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("e_invoices").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Manual cancel" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cancelled"); qc.invalidateQueries({ queryKey: ["einvoices"] }); },
  });

  return (
    <>
      <PageHeader
        title="E-Invoices"
        description="IRN registry. Generate IRN for B2B invoices ≥ ₹5 cr turnover thresholds."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Generate IRN</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Generate IRN (Stub)</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Production wiring to IRP (NIC / GSP) goes here. For now a stub IRN, Ack No., and QR payload are stored so the rest of the workflow works end-to-end.
                </p>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Invoice number</label>
                  <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-0001" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => generate.mutate()} disabled={!invoiceNumber || generate.isPending}>Generate</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <PageBody>
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-32">Invoice</TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>IRN</TableHead>
              <TableHead className="w-36">Ack No.</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {q.data?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.invoices?.invoice_number ?? "—"}</TableCell>
                  <TableCell className="text-sm">{e.invoices?.invoice_date ? formatDate(e.invoices.invoice_date) : "—"}</TableCell>
                  <TableCell className="font-mono text-[10px] truncate max-w-[280px]" title={e.irn ?? ""}>{e.irn ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{e.ack_no ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === "generated" ? "default" : e.status === "cancelled" ? "destructive" : "secondary"}>
                      {e.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{inr(e.invoices?.total_amount ?? 0)}</TableCell>
                  <TableCell className="flex gap-1">
                    <Link to="/print/invoice/$id" params={{ id: e.invoice_id }}>
                      <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /></Button>
                    </Link>
                    {e.status === "generated" && (
                      <Button variant="ghost" size="sm" onClick={() => cancel.mutate(e.id)}>×</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {q.data?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  <QrCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No e-invoices yet.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent></Card>
      </PageBody>
    </>
  );
}

function stubIrn(id: string): string {
  // Deterministic 64-char hex-ish stub based on id + timestamp.
  const base = (id + Date.now().toString(36)).replace(/-/g, "");
  let s = base;
  while (s.length < 64) s += Math.random().toString(36).slice(2);
  return s.slice(0, 64);
}
