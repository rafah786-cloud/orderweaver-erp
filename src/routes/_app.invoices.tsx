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
import { Plus, Trash2, AlertTriangle, Ban } from "lucide-react";
import { toast } from "sonner";
import { inr, formatDate, daysBetween } from "@/lib/format";

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

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Create invoices with automatic credit-limit and overdue blocking."
        actions={canCreate ? <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Invoice</Button> : undefined}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No invoices yet.</TableCell></TableRow>
                ) : invoices.map((inv) => (
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
                  </TableRow>
                ))}
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
