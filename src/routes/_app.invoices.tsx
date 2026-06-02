import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, AlertTriangle, Ban, FileDown, MoreHorizontal, IndianRupee, XCircle, Printer } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { inr, formatDate, daysBetween } from "@/lib/format";
import { buildGstr1Json, downloadJson } from "@/lib/gstr1";

export const Route = createFileRoute("/_app/invoices")({
  component: InvoicesPage,
});

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  status: "unpaid" | "partial" | "paid" | "cancelled";
  party_id: string;
};

type Item = { description: string; quantity: number; unit_price: number };

const TAX_RATE = 0.18;
const CREDIT_LIMIT_HARD = 150000;
const OVERDUE_THRESHOLD = 50000;
const OVERDUE_DAYS = 90;

function InvoicesPage() {
  const { hasAnyRole, user } = useAuth();
  const canCreate = hasAnyRole(["admin", "sales"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [blockMsg, setBlockMsg] = useState<{ title: string; reason: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const today = new Date();
  const [exportYear, setExportYear] = useState(today.getFullYear());
  const [exportMonth, setExportMonth] = useState(today.getMonth() + 1);
  const [supplierGstin, setSupplierGstin] = useState("");
  const [supplierState, setSupplierState] = useState("29");
  const [exporting, setExporting] = useState(false);
  const [payInv, setPayInv] = useState<InvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, party_id")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  const { data: parties = [] } = useQuery({
    queryKey: ["parties-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parties").select("id, name, credit_limit").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; credit_limit: number }[];
    },
  });

  const partyMap = new Map(parties.map((p) => [p.id, p]));

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  const resetForm = () => {
    setPartyId("");
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    setNotes("");
    setItems([{ description: "", quantity: 1, unit_price: 0 }]);
  };

  const checkBlock = async (pid: string, newTotal: number) => {
    const { data, error } = await supabase
      .from("party_outstanding")
      .select("outstanding, oldest_unpaid_date")
      .eq("party_id", pid)
      .maybeSingle();
    if (error) throw error;
    const out = Number(data?.outstanding ?? 0);
    const limit = partyMap.get(pid)?.credit_limit ?? CREDIT_LIMIT_HARD;
    const projected = out + newTotal;
    if (projected >= limit) {
      return {
        title: "Credit limit exceeded",
        reason: `Current outstanding ${inr(out)} + new invoice ${inr(newTotal)} = ${inr(projected)} which meets or exceeds the credit limit of ${inr(limit)}.`,
      };
    }
    if (out >= OVERDUE_THRESHOLD && data?.oldest_unpaid_date && daysBetween(data.oldest_unpaid_date) > OVERDUE_DAYS) {
      return {
        title: "Overdue payments",
        reason: `Party has ${inr(out)} outstanding with the oldest invoice from ${formatDate(data.oldest_unpaid_date)} (${daysBetween(data.oldest_unpaid_date)} days). Clear overdue invoices first.`,
      };
    }
    return null;
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!partyId) throw new Error("Select a party");
      if (items.some((i) => !i.description.trim())) throw new Error("All line items need a description");
      if (total <= 0) throw new Error("Invoice total must be greater than zero");

      const blocked = await checkBlock(partyId, total);
      if (blocked) {
        setBlockMsg(blocked);
        throw new Error(blocked.title);
      }

      const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          party_id: partyId,
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          subtotal,
          tax_amount: tax,
          total_amount: total,
          notes: notes || null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (invErr) throw invErr;

      const { error: itemErr } = await supabase.from("invoice_items").insert(
        items.map((i) => ({
          invoice_id: inv.id,
          description: i.description,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          amount: Number(i.quantity) * Number(i.unit_price),
        }))
      );
      if (itemErr) throw itemErr;
    },
    onSuccess: () => {
      toast.success("Invoice created");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["party-outstanding"] });
      setOpen(false);
      resetForm();
    },
    onError: (e: Error) => {
      if (!blockMsg) toast.error(e.message);
    },
  });

  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!payInv) throw new Error("No invoice selected");
      const amt = Number(payAmount);
      if (!amt || amt <= 0) throw new Error("Enter a payment amount greater than zero");
      const newPaid = Number(payInv.paid_amount) + amt;
      if (newPaid > Number(payInv.total_amount) + 0.01) throw new Error("Payment exceeds invoice total");
      const status: InvoiceRow["status"] = newPaid >= Number(payInv.total_amount) - 0.01 ? "paid" : "partial";
      const { error } = await supabase
        .from("invoices")
        .update({ paid_amount: newPaid, status })
        .eq("id", payInv.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dash-outstanding"] });
      setPayInv(null);
      setPayAmount("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelInvoice = useMutation({
    mutationFn: async (inv: InvoiceRow) => {
      const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", inv.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice cancelled");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dash-outstanding"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const handleExport = async () => {
    if (!/^\d{2}[A-Z0-9]{13}$/.test(supplierGstin.trim().toUpperCase())) {
      toast.error("Enter a valid 15-character supplier GSTIN");
      return;
    }
    setExporting(true);
    try {
      const start = new Date(Date.UTC(exportYear, exportMonth - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(exportYear, exportMonth, 1)).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total_amount, subtotal, tax_amount, party_id, invoice_items(description, quantity, unit_price, amount, hsn_code, tax_rate)")
        .neq("status", "cancelled")
        .gte("invoice_date", start)
        .lt("invoice_date", end);
      if (error) throw error;
      const { data: partyData, error: pErr } = await supabase
        .from("parties")
        .select("id, name, gstin, state_code");
      if (pErr) throw pErr;
      if (!data || data.length === 0) {
        toast.error("No invoices found for this period");
        return;
      }
      const json = buildGstr1Json({
        gstin: supplierGstin.trim().toUpperCase(),
        year: exportYear,
        month: exportMonth,
        invoices: data as never,
        parties: partyData as never,
        supplierStateCode: supplierState,
      });
      downloadJson(`gstr1_${supplierGstin.trim().toUpperCase()}_${String(exportMonth).padStart(2, "0")}${exportYear}.json`, json);
      toast.success(`Exported ${data.length} invoice(s)`);
      setExportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Create invoices with automatic credit-limit and overdue blocking."
        actions={
          <div className="flex gap-2">
            {hasAnyRole(["admin", "sales"]) && (
              <Button variant="outline" onClick={() => setExportOpen(true)}>
                <FileDown className="h-4 w-4 mr-1" />Export GSTR-1 JSON
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Invoice</Button>
            )}
          </div>
        }
      />

      <PageBody>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No invoices yet.</TableCell></TableRow>
                ) : invoices.map((inv) => {
                  const canManage = hasAnyRole(["admin", "sales"]);
                  const closed = inv.status === "paid" || inv.status === "cancelled";
                  return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{partyMap.get(inv.party_id)?.name ?? "—"}</TableCell>
                    <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                    <TableCell>{formatDate(inv.due_date)}</TableCell>
                    <TableCell className="text-right font-medium">{inr(inv.total_amount)}</TableCell>
                    <TableCell className="text-right">{inr(inv.paid_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "secondary" : inv.status === "cancelled" ? "outline" : "default"} className="capitalize">
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Print invoice">
                          <Link to="/print/invoice/$id" params={{ id: inv.id }} target="_blank">
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                        {canManage && !closed && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setPayInv(inv); setPayAmount(String(Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount)))); }}>
                                <IndianRupee className="h-4 w-4 mr-2" />Record payment
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => { if (confirm(`Cancel invoice ${inv.invoice_number}?`)) cancelInvoice.mutate(inv); }}
                              >
                                <XCircle className="h-4 w-4 mr-2" />Cancel invoice
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
            <DialogDescription>GST 18% is applied automatically. Credit checks run on save.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Party *</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger><SelectValue placeholder="Select party" /></SelectTrigger>
                <SelectContent>
                  {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Invoice Date</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Line Items</Label>
                <Button size="sm" variant="outline" onClick={() => setItems([...items, { description: "", quantity: 1, unit_price: 0 }])}>
                  <Plus className="h-3 w-3 mr-1" />Add
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <Input className="col-span-6" placeholder="Description (e.g. King Mattress 6x6.5)" value={it.description}
                      onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
                    <Input className="col-span-2" type="number" min="0" placeholder="Qty" value={it.quantity}
                      onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
                    <Input className="col-span-3" type="number" min="0" placeholder="Unit ₹" value={it.unit_price}
                      onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value) } : x))} />
                    <Button className="col-span-1" size="icon" variant="ghost"
                      onClick={() => setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : items)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
              <Row label="Subtotal" value={inr(subtotal)} />
              <Row label={`GST (${(TAX_RATE * 100).toFixed(0)}%)`} value={inr(tax)} />
              <div className="border-t pt-1 mt-1"><Row label="Total" value={inr(total)} bold /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create Invoice"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!blockMsg} onOpenChange={(o) => !o && setBlockMsg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5" />Invoice Blocked
            </DialogTitle>
          </DialogHeader>
          {blockMsg && (
            <div className="space-y-3">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">{blockMsg.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{blockMsg.reason}</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Collect payment or contact an admin to override before creating new invoices for this party.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setBlockMsg(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Export GSTR-1 JSON</DialogTitle>
            <DialogDescription>
              Generates a GSTR-1 JSON file for the selected month. Upload it on the GST portal via the Returns Offline Tool.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Supplier GSTIN *</Label>
              <Input
                placeholder="e.g. 29ABCDE1234F1Z5"
                value={supplierGstin}
                maxLength={15}
                onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">State code</Label>
                <Input
                  placeholder="29"
                  value={supplierState}
                  maxLength={2}
                  onChange={(e) => setSupplierState(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Month</Label>
                <Select value={String(exportMonth)} onValueChange={(v) => setExportMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {new Date(2000, m - 1, 1).toLocaleString("en-IN", { month: "long" })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Year</Label>
              <Input
                type="number"
                min="2020"
                max="2100"
                value={exportYear}
                onChange={(e) => setExportYear(Number(e.target.value))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Invoices with a valid party GSTIN are exported as B2B; the rest are aggregated as B2CS. Cancelled invoices are excluded.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? "Generating…" : "Download JSON"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payInv} onOpenChange={(o) => { if (!o) { setPayInv(null); setPayAmount(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {payInv && (
                <>Invoice <span className="font-medium">{payInv.invoice_number}</span> · Balance{" "}
                  <span className="font-medium">{inr(Number(payInv.total_amount) - Number(payInv.paid_amount))}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Amount received (₹)</Label>
              <Input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayInv(null); setPayAmount(""); }}>Cancel</Button>
            <Button onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending}>
              {recordPayment.isPending ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>

  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-semibold text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
