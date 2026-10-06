import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { sb } from "@/lib/accounting";
import { formatDate, inr } from "@/lib/format";
import { QrCode, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/gst/einvoices")({
  component: EInvoicesPage,
});

type EInvoice = {
  id: string;
  invoice_id: string;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  signed_qr: string | null;
  status: string;
  created_at: string;
};

function EInvoicesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const q = useQuery({
    queryKey: ["einvoices"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("e_invoices")
        .select("*,invoices(invoice_number,invoice_date,total_amount)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as (EInvoice & {
        invoices: { invoice_number: string; invoice_date: string; total_amount: number } | null;
      })[];
    },
  });

  // Real IRP registration is not connected in this deployment. Never synthesize
  // an IRN locally: a value shown as generated must come from the GST Invoice
  // Registration Portal (IRP), with the corresponding signed QR payload.
  const irpConfigured = false;

  const cancel = useMutation({
    mutationFn: async () => {
      throw new Error("E-invoice cancellation requires a live IRP integration.");
    },
  });

  return (
    <>
      <PageHeader
        title="E-Invoices"
        description="IRN registry for invoices successfully registered through a live GST IRP integration."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" /> Generate IRN
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate IRN (Stub)</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Production wiring to IRP (NIC / GSP) goes here. For now a stub IRN, Ack No., and
                  QR payload are stored so the rest of the workflow works end-to-end.
                </p>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Invoice number</label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-0001"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => generate.mutate()}
                  disabled={!invoiceNumber || generate.isPending}
                >
                  Generate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <PageBody>
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-950">
            <div className="font-semibold">Live IRP integration required</div>
            <p className="mt-1 leading-6">
              This ERP does not currently have a live GST Invoice Registration Portal connection.
              IRNs, acknowledgement numbers and signed QR payloads must never be fabricated locally.
              Generate e-invoices only after the official IRP integration is connected and tested.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Invoice</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>IRN</TableHead>
                  <TableHead className="w-36">Ack No.</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data?.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">
                      {e.invoices?.invoice_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.invoices?.invoice_date ? formatDate(e.invoices.invoice_date) : "—"}
                    </TableCell>
                    <TableCell
                      className="font-mono text-[10px] truncate max-w-[280px]"
                      title={e.irn ?? ""}
                    >
                      {e.irn ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.ack_no ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          e.status === "generated"
                            ? "default"
                            : e.status === "cancelled"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {inr(e.invoices?.total_amount ?? 0)}
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Link to="/print/invoice/$id" params={{ id: e.invoice_id }}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      {e.status === "generated" && (
                        <Button variant="ghost" size="sm" disabled title="Cancellation requires live IRP integration">
                          ×
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {q.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      <QrCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No e-invoices yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

